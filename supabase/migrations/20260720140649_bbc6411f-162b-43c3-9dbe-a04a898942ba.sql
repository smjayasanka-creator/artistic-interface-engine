
ALTER TABLE public.savings_product
  ADD COLUMN IF NOT EXISTS day_count int NOT NULL DEFAULT 365
    CHECK (day_count IN (360, 365)),
  ADD COLUMN IF NOT EXISTS accrual_frequency text NOT NULL DEFAULT 'daily'
    CHECK (accrual_frequency IN ('daily')),
  ADD COLUMN IF NOT EXISTS capitalization_frequency text NOT NULL DEFAULT 'monthly'
    CHECK (capitalization_frequency IN ('monthly','quarterly','half_yearly','yearly')),
  ADD COLUMN IF NOT EXISTS min_earn_balance numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_rounding text NOT NULL DEFAULT 'round'
    CHECK (interest_rounding IN ('round','floor','ceil')),
  ADD COLUMN IF NOT EXISTS dormant_treatment text NOT NULL DEFAULT 'accrue'
    CHECK (dormant_treatment IN ('accrue','skip','freeze')),
  ADD COLUMN IF NOT EXISTS wht_payable_account_id uuid REFERENCES public.gl_account(id);

CREATE OR REPLACE FUNCTION public.savings_round(_amount numeric, _mode text, _dp int DEFAULT 2)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _mode
    WHEN 'floor' THEN floor(_amount * power(10,_dp)) / power(10,_dp)
    WHEN 'ceil'  THEN ceil(_amount * power(10,_dp)) / power(10,_dp)
    ELSE round(_amount, _dp)
  END;
$$;

CREATE OR REPLACE FUNCTION public.accrue_savings_interest_daily(
  _company_id uuid,
  _business_date date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE
  v_acct RECORD;
  v_rate numeric;
  v_eligible numeric;
  v_gross numeric;
  v_count_ok int := 0;
  v_count_skip int := 0;
  v_total numeric := 0;
BEGIN
  FOR v_acct IN
    SELECT sa.id, sa.balance, sa.status, sa.interest_accrued,
           sp.interest_rate_pct, sp.day_count, sp.min_earn_balance,
           sp.interest_rounding, sp.dormant_treatment
      FROM public.savings_account sa
      JOIN public.savings_product sp ON sp.id = sa.product_id
     WHERE sa.company_id = _company_id
       AND sa.status IN ('active','dormant')
  LOOP
    IF v_acct.status = 'dormant' AND v_acct.dormant_treatment <> 'accrue' THEN
      v_count_skip := v_count_skip + 1; CONTINUE;
    END IF;
    v_eligible := COALESCE(v_acct.balance, 0);
    IF v_eligible < COALESCE(v_acct.min_earn_balance,0) OR v_eligible <= 0
       OR COALESCE(v_acct.interest_rate_pct,0) <= 0 THEN
      v_count_skip := v_count_skip + 1; CONTINUE;
    END IF;
    v_rate := v_acct.interest_rate_pct;
    v_gross := public.savings_round(
      v_eligible * (v_rate / 100.0) / v_acct.day_count,
      v_acct.interest_rounding, 4
    );
    IF v_gross <= 0 THEN v_count_skip := v_count_skip + 1; CONTINUE; END IF;

    INSERT INTO public.savings_interest_accrual(
      company_id, account_id, accrual_date, eligible_balance, rate_pct, day_count, gross_interest
    ) VALUES (
      _company_id, v_acct.id, _business_date, v_eligible, v_rate, v_acct.day_count, v_gross
    )
    ON CONFLICT (account_id, accrual_date) DO NOTHING;

    IF FOUND THEN
      UPDATE public.savings_account
         SET interest_accrued = COALESCE(interest_accrued,0) + v_gross
       WHERE id = v_acct.id;
      v_count_ok := v_count_ok + 1;
      v_total := v_total + v_gross;
    ELSE
      v_count_skip := v_count_skip + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('accrued', v_count_ok, 'skipped', v_count_skip,
    'gross_interest', v_total, 'business_date', _business_date);
END $fn$;
REVOKE ALL ON FUNCTION public.accrue_savings_interest_daily(uuid, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accrue_savings_interest_daily(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.is_capitalization_date(_freq text, _date date)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _freq
    WHEN 'monthly'     THEN _date = (date_trunc('month', _date) + INTERVAL '1 month - 1 day')::date
    WHEN 'quarterly'   THEN _date = (date_trunc('quarter', _date) + INTERVAL '3 months - 1 day')::date
    WHEN 'half_yearly' THEN EXTRACT(MONTH FROM _date) IN (6,12)
                            AND _date = (date_trunc('month', _date) + INTERVAL '1 month - 1 day')::date
    WHEN 'yearly'      THEN EXTRACT(MONTH FROM _date)=12 AND EXTRACT(DAY FROM _date)=31
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_savings_wht_rule(
  _company_id uuid, _account_id uuid, _as_of date
) RETURNS TABLE(rule_id uuid, rate_pct numeric, threshold numeric, wht_gl_account_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH acct AS (
    SELECT sa.product_id FROM public.savings_account sa WHERE sa.id = _account_id
  ),
  cand AS (
    SELECT r.*,
      ( (CASE WHEN r.product_id IS NOT NULL THEN 4 ELSE 0 END)
      + (CASE WHEN r.entity_type <> 'any' THEN 2 ELSE 0 END)
      + (CASE WHEN r.residency <> 'any'   THEN 1 ELSE 0 END) ) AS score
      FROM public.savings_wht_rule r, acct
     WHERE r.company_id = _company_id
       AND r.active
       AND r.effective_from <= _as_of
       AND (r.effective_to IS NULL OR r.effective_to >= _as_of)
       AND (r.product_id IS NULL OR r.product_id = acct.product_id)
       AND (r.entity_type IN ('any','individual'))
  )
  SELECT id, rate_pct, threshold, wht_gl_account_id
    FROM cand ORDER BY score DESC, effective_from DESC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_savings_wht_rule(uuid, uuid, date) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.capitalize_savings_interest(
  _company_id uuid,
  _period_end date DEFAULT CURRENT_DATE,
  _force boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE
  v_acct RECORD;
  v_period_start date;
  v_gross numeric;
  v_rule RECORD;
  v_wht numeric;
  v_net numeric;
  v_liab uuid; v_intx uuid; v_whtgl uuid;
  v_lines jsonb;
  v_ref text;
  v_idem text;
  v_entry uuid;
  v_txn uuid;
  v_wht_txn uuid;
  v_new_bal numeric;
  v_count int := 0;
  v_gross_total numeric := 0;
  v_wht_total numeric := 0;
  v_skipped int := 0;
BEGIN
  FOR v_acct IN
    SELECT sa.*, sp.capitalization_frequency, sp.deposit_liability_account_id,
           sp.interest_expense_account_id, sp.wht_payable_account_id, sp.interest_rounding
      FROM public.savings_account sa
      JOIN public.savings_product sp ON sp.id = sa.product_id
     WHERE sa.company_id = _company_id
       AND sa.status IN ('active','dormant')
     ORDER BY sa.id
  LOOP
    IF NOT _force AND NOT public.is_capitalization_date(v_acct.capitalization_frequency, _period_end) THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    v_period_start := (
      SELECT COALESCE(MAX(period_end) + 1, DATE '1970-01-01')
        FROM public.savings_interest_posting
       WHERE account_id = v_acct.id
    );

    SELECT COALESCE(SUM(gross_interest),0) INTO v_gross
      FROM public.savings_interest_accrual
     WHERE account_id = v_acct.id
       AND accrual_date >= v_period_start
       AND accrual_date <= _period_end;

    IF v_gross <= 0 THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    v_idem := 'sav-cap:' || v_acct.id::text || ':' || _period_end::text;
    PERFORM 1 FROM public.savings_interest_posting
      WHERE company_id = _company_id AND idempotency_key = v_idem;
    IF FOUND THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    v_wht := 0; v_whtgl := NULL;
    SELECT * INTO v_rule FROM public.resolve_savings_wht_rule(_company_id, v_acct.id, _period_end) LIMIT 1;
    IF v_rule.rule_id IS NOT NULL AND v_rule.rate_pct IS NOT NULL AND v_gross >= COALESCE(v_rule.threshold,0) THEN
      v_wht := public.savings_round(v_gross * (v_rule.rate_pct/100.0), v_acct.interest_rounding, 4);
      v_whtgl := v_rule.wht_gl_account_id;
    END IF;
    v_net := v_gross - v_wht;

    v_liab := COALESCE(v_acct.deposit_liability_account_id, (SELECT id FROM public.gl_account WHERE code='2100' LIMIT 1));
    v_intx := COALESCE(v_acct.interest_expense_account_id, (SELECT id FROM public.gl_account WHERE code='5100' LIMIT 1));
    v_whtgl := COALESCE(v_whtgl, v_acct.wht_payable_account_id);
    IF v_wht > 0 AND v_whtgl IS NULL THEN
      RAISE EXCEPTION 'WHT payable GL account not configured for account %', v_acct.account_no;
    END IF;
    IF v_liab IS NULL OR v_intx IS NULL THEN
      RAISE EXCEPTION 'Interest / liability GL not mapped for account %', v_acct.account_no;
    END IF;

    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_intx, 'debit', v_gross, 'credit', 0, 'memo','Interest expense'),
      jsonb_build_object('account_id', v_liab, 'debit', 0, 'credit', v_net,   'memo','Interest to deposit')
    );
    IF v_wht > 0 THEN
      v_lines := v_lines || jsonb_build_object('account_id', v_whtgl, 'debit', 0, 'credit', v_wht, 'memo','WHT payable');
    END IF;

    v_ref := 'SAV-CAP-' || to_char(_period_end,'YYMMDD') || '-' || SUBSTR(v_acct.id::text,1,8);
    v_entry := public.post_entry(
      _period_end, v_ref,
      'Interest capitalization · ' || v_acct.account_no,
      v_lines, v_acct.branch_id, 'savings_interest', v_acct.id, v_idem, v_acct.id
    );

    v_new_bal := COALESCE(v_acct.balance,0) + v_net;
    INSERT INTO public.savings_transaction(
      company_id, account_id, txn_type, channel, amount, running_balance,
      reference, narration, idempotency_key
    ) VALUES (
      _company_id, v_acct.id, 'interest'::savings_txn_type, 'other'::savings_channel,
      v_net, v_new_bal, v_ref, 'Interest capitalization',
      v_idem || ':int'
    ) RETURNING id INTO v_txn;

    IF v_wht > 0 THEN
      INSERT INTO public.savings_transaction(
        company_id, account_id, txn_type, channel, amount, running_balance,
        reference, narration, idempotency_key
      ) VALUES (
        _company_id, v_acct.id, 'wht'::savings_txn_type, 'other'::savings_channel,
        0, v_new_bal, v_ref, 'WHT withheld ' || v_wht::text,
        v_idem || ':wht'
      ) RETURNING id INTO v_wht_txn;
    END IF;

    UPDATE public.savings_account
       SET balance = v_new_bal,
           available_balance = v_new_bal - public.savings_active_hold_amount(v_acct.id),
           interest_accrued = GREATEST(0, COALESCE(interest_accrued,0) - v_gross),
           last_txn_at = now()
     WHERE id = v_acct.id;

    INSERT INTO public.savings_interest_posting(
      company_id, account_id, period_start, period_end, gross_interest, wht_amount, net_interest,
      wht_rule_id, gl_entry_id, savings_txn_id, wht_txn_id, idempotency_key
    ) VALUES (
      _company_id, v_acct.id, v_period_start, _period_end,
      v_gross, v_wht, v_net,
      v_rule.rule_id, v_entry, v_txn, v_wht_txn, v_idem
    );

    v_count := v_count + 1;
    v_gross_total := v_gross_total + v_gross;
    v_wht_total := v_wht_total + v_wht;
  END LOOP;

  RETURN jsonb_build_object(
    'posted', v_count, 'skipped', v_skipped,
    'gross_total', v_gross_total, 'wht_total', v_wht_total,
    'net_total', v_gross_total - v_wht_total,
    'period_end', _period_end
  );
END $fn$;
REVOKE ALL ON FUNCTION public.capitalize_savings_interest(uuid, date, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capitalize_savings_interest(uuid, date, boolean) TO service_role;
