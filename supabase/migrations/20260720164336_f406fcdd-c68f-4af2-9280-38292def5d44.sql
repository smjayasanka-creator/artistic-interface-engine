
-- ────────────────────────────────────────────────────────────────────────────
-- 1. Arrears snapshot: business-date aware
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.loan_arrears_snapshot(_loan_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE(arrears numeric, full_installment numeric, next_due date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH d AS (
    SELECT id, seq, due_date,
      GREATEST(0, COALESCE(fee_due,0)       - COALESCE(fee_paid,0))       AS f,
      GREATEST(0, COALESCE(interest_due,0)  - COALESCE(interest_paid,0))  AS i,
      GREATEST(0, COALESCE(principal_due,0) - COALESCE(principal_paid,0)) AS p
    FROM public.loan_installment
    WHERE loan_id = _loan_id
  ),
  a AS ( SELECT COALESCE(SUM(f+i+p),0) AS arrears FROM d WHERE due_date <= _as_of ),
  n AS (
    SELECT (f+i+p) AS amt, due_date
      FROM d WHERE due_date > _as_of
      ORDER BY due_date, seq LIMIT 1
  )
  SELECT a.arrears,
         COALESCE((SELECT amt FROM n),0)::numeric,
         (SELECT due_date FROM n)
  FROM a;
$$;
GRANT EXECUTE ON FUNCTION public.loan_arrears_snapshot(uuid, date) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Hardened per-mandate execution
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.execute_savings_loan_mandate(
  _mandate_id uuid,
  _run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE
  v_mandate     RECORD;
  v_acct        RECORD;
  v_loan        RECORD;
  v_product     RECORD;
  v_run         RECORD;
  v_holds       numeric;
  v_avail       numeric;
  v_target      numeric := 0;
  v_arr         numeric;
  v_full        numeric;
  v_next        date;
  v_amt         numeric := 0;
  v_remaining   numeric;
  v_actual      numeric := 0;
  v_alloc_fee   numeric := 0;
  v_alloc_int   numeric := 0;
  v_alloc_prin  numeric := 0;
  v_inst        RECORD;
  v_new_bal     numeric;
  v_new_avail   numeric;
  v_sav_txn     uuid;
  v_liab_gl     uuid;
  v_ar_gl       uuid;
  v_int_gl      uuid;
  v_fee_gl      uuid;
  v_entry_id    uuid;
  v_lines       jsonb;
  v_rep_id      uuid;
  v_ref         text;
  v_idem        text;
  v_status      text;
  v_reason      text;
  v_closed      bool := false;
  v_outstanding numeric;
BEGIN
  SELECT status, requested, collected, savings_txn_id, loan_repayment_id, gl_entry_id, reason
    INTO v_status, v_target, v_amt, v_sav_txn, v_rep_id, v_entry_id, v_reason
    FROM public.savings_auto_collection_result
    WHERE run_id = _run_id AND mandate_id = _mandate_id;
  IF FOUND THEN
    RETURN jsonb_build_object('status', v_status, 'requested', v_target, 'collected', v_amt,
      'savings_txn_id', v_sav_txn, 'loan_repayment_id', v_rep_id, 'gl_entry_id', v_entry_id,
      'reason', v_reason, 'idempotent_replay', true);
  END IF;

  SELECT * INTO v_run FROM public.savings_auto_collection_run WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run % not found', _run_id; END IF;

  SELECT * INTO v_mandate FROM public.savings_loan_mandate WHERE id = _mandate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mandate % not found', _mandate_id; END IF;

  -- Cross-entity company/customer consistency
  IF v_mandate.company_id <> v_run.company_id THEN
    RAISE EXCEPTION 'Mandate % does not belong to run company %', _mandate_id, v_run.company_id;
  END IF;

  IF v_mandate.status <> 'active' THEN
    INSERT INTO public.savings_auto_collection_result(run_id, mandate_id, savings_account_id, loan_id, status, requested, collected, reason)
    VALUES (_run_id, _mandate_id, v_mandate.savings_account_id, v_mandate.loan_id, 'skipped', 0, 0, 'Mandate '||v_mandate.status);
    RETURN jsonb_build_object('status','skipped','reason','Mandate '||v_mandate.status);
  END IF;
  IF v_mandate.effective_from > v_run.business_date OR
     (v_mandate.effective_to IS NOT NULL AND v_mandate.effective_to < v_run.business_date) THEN
    INSERT INTO public.savings_auto_collection_result(run_id, mandate_id, savings_account_id, loan_id, status, requested, collected, reason)
    VALUES (_run_id, _mandate_id, v_mandate.savings_account_id, v_mandate.loan_id, 'skipped', 0, 0, 'Not effective for date');
    RETURN jsonb_build_object('status','skipped','reason','not_effective');
  END IF;
  IF (v_run.run_window = 'morning' AND NOT v_mandate.morning_run) OR
     (v_run.run_window = 'afternoon' AND NOT v_mandate.afternoon_run) THEN
    INSERT INTO public.savings_auto_collection_result(run_id, mandate_id, savings_account_id, loan_id, status, requested, collected, reason)
    VALUES (_run_id, _mandate_id, v_mandate.savings_account_id, v_mandate.loan_id, 'skipped', 0, 0, 'Window disabled on mandate');
    RETURN jsonb_build_object('status','skipped','reason','window_disabled');
  END IF;

  SELECT * INTO v_acct FROM public.savings_account WHERE id = v_mandate.savings_account_id FOR UPDATE;
  SELECT * INTO v_loan FROM public.loan WHERE id = v_mandate.loan_id FOR UPDATE;

  IF v_acct.company_id <> v_mandate.company_id THEN
    RAISE EXCEPTION 'Savings account % is not in mandate company', v_acct.id;
  END IF;
  IF v_loan.company_id <> v_mandate.company_id THEN
    RAISE EXCEPTION 'Loan % is not in mandate company', v_loan.id;
  END IF;
  IF v_acct.client_id <> v_mandate.client_id OR v_loan.client_id <> v_mandate.client_id THEN
    RAISE EXCEPTION 'Mandate %, savings account and loan must share the same customer', _mandate_id;
  END IF;

  IF v_loan.status NOT IN ('disbursed','active') THEN
    INSERT INTO public.savings_auto_collection_result(run_id, mandate_id, savings_account_id, loan_id, status, requested, collected, reason)
    VALUES (_run_id, _mandate_id, v_mandate.savings_account_id, v_mandate.loan_id, 'skipped', 0, 0, 'Loan '||v_loan.status);
    RETURN jsonb_build_object('status','skipped','reason','loan_'||v_loan.status);
  END IF;

  IF v_acct.status IN ('closed','fully_blocked','frozen') OR
     (v_acct.status = 'debit_blocked' AND NOT v_mandate.ignore_debit_block) THEN
    INSERT INTO public.savings_auto_collection_result(run_id, mandate_id, savings_account_id, loan_id, status, requested, collected, reason)
    VALUES (_run_id, _mandate_id, v_mandate.savings_account_id, v_mandate.loan_id, 'blocked', 0, 0, 'Account '||v_acct.status);
    RETURN jsonb_build_object('status','blocked','reason','account_'||v_acct.status);
  END IF;

  -- Business-date aware arrears
  SELECT arrears, full_installment, next_due
    INTO v_arr, v_full, v_next
    FROM public.loan_arrears_snapshot(v_mandate.loan_id, v_run.business_date);

  v_target := CASE v_mandate.mandate_type
    WHEN 'arrears_only'     THEN v_arr
    WHEN 'full_installment' THEN GREATEST(v_arr, v_full)
    WHEN 'minimum_due'      THEN v_arr
    WHEN 'fixed_amount'     THEN COALESCE(v_mandate.fixed_amount, 0)
    ELSE 0
  END;
  IF v_mandate.max_amount_per_run IS NOT NULL THEN
    v_target := LEAST(v_target, v_mandate.max_amount_per_run);
  END IF;
  v_target := ROUND(v_target, 2);

  IF v_target <= 0 THEN
    INSERT INTO public.savings_auto_collection_result(run_id, mandate_id, savings_account_id, loan_id, status, requested, collected, reason)
    VALUES (_run_id, _mandate_id, v_mandate.savings_account_id, v_mandate.loan_id, 'no_arrears', 0, 0, 'Nothing due');
    RETURN jsonb_build_object('status','no_arrears','requested',0);
  END IF;

  v_holds := public.savings_active_hold_amount(v_mandate.savings_account_id);
  SELECT * INTO v_product FROM public.savings_product WHERE id = v_acct.product_id;
  v_avail := GREATEST(0, COALESCE(v_acct.balance,0) - v_holds - COALESCE(v_mandate.min_protected_balance,0) - COALESCE(v_product.min_balance,0));
  v_amt := LEAST(v_target, v_avail);
  v_amt := ROUND(v_amt, 2);

  IF v_amt <= 0 THEN
    INSERT INTO public.savings_auto_collection_result(run_id, mandate_id, savings_account_id, loan_id, status, requested, collected, reason)
    VALUES (_run_id, _mandate_id, v_mandate.savings_account_id, v_mandate.loan_id, 'insufficient', v_target, 0, 'Insufficient available balance');
    RETURN jsonb_build_object('status','insufficient','requested',v_target,'collected',0);
  END IF;

  IF v_amt < v_target AND NOT v_mandate.allow_partial THEN
    INSERT INTO public.savings_auto_collection_result(run_id, mandate_id, savings_account_id, loan_id, status, requested, collected, reason)
    VALUES (_run_id, _mandate_id, v_mandate.savings_account_id, v_mandate.loan_id, 'insufficient', v_target, 0, 'Partial disallowed');
    RETURN jsonb_build_object('status','insufficient','requested',v_target,'collected',0,'reason','partial_disallowed');
  END IF;

  -- ── Pre-compute allocation before touching savings, so we debit exactly what we allocate ──
  v_remaining := v_amt;
  FOR v_inst IN
    SELECT id, fee_due, fee_paid FROM public.loan_installment
     WHERE loan_id = v_mandate.loan_id AND fee_due > fee_paid
     ORDER BY seq ASC FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    DECLARE _apply numeric := LEAST(v_remaining, v_inst.fee_due - v_inst.fee_paid);
    BEGIN
      UPDATE public.loan_installment SET fee_paid = fee_paid + _apply WHERE id = v_inst.id;
      v_remaining := v_remaining - _apply;
      v_alloc_fee := v_alloc_fee + _apply;
    END;
  END LOOP;
  FOR v_inst IN
    SELECT id, interest_due, interest_paid FROM public.loan_installment
     WHERE loan_id = v_mandate.loan_id AND interest_due > interest_paid
     ORDER BY seq ASC FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    DECLARE _apply numeric := LEAST(v_remaining, v_inst.interest_due - v_inst.interest_paid);
    BEGIN
      UPDATE public.loan_installment SET interest_paid = interest_paid + _apply WHERE id = v_inst.id;
      v_remaining := v_remaining - _apply;
      v_alloc_int := v_alloc_int + _apply;
    END;
  END LOOP;
  FOR v_inst IN
    SELECT id, principal_due, principal_paid FROM public.loan_installment
     WHERE loan_id = v_mandate.loan_id AND principal_due > principal_paid
     ORDER BY seq ASC FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    DECLARE _apply numeric := LEAST(v_remaining, v_inst.principal_due - v_inst.principal_paid);
    BEGIN
      UPDATE public.loan_installment SET principal_paid = principal_paid + _apply WHERE id = v_inst.id;
      v_remaining := v_remaining - _apply;
      v_alloc_prin := v_alloc_prin + _apply;
    END;
  END LOOP;

  v_actual := ROUND(v_alloc_fee + v_alloc_int + v_alloc_prin, 2);

  IF v_actual <= 0 THEN
    INSERT INTO public.savings_auto_collection_result(run_id, mandate_id, savings_account_id, loan_id, status, requested, collected, reason)
    VALUES (_run_id, _mandate_id, v_mandate.savings_account_id, v_mandate.loan_id, 'error', v_target, 0, 'No allocatable installments');
    RETURN jsonb_build_object('status','error','reason','no_allocatable');
  END IF;

  UPDATE public.loan_installment
     SET state = CASE
       WHEN principal_paid >= principal_due AND interest_paid >= interest_due AND fee_paid >= fee_due THEN 'paid'::installment_state
       WHEN (principal_paid + interest_paid + fee_paid) > 0 THEN 'partial'::installment_state
       ELSE state END
   WHERE loan_id = v_mandate.loan_id;

  -- Resolve company-scoped GL accounts — no unscoped fallbacks
  v_liab_gl := v_product.deposit_liability_account_id;
  SELECT p.principal_account_id, p.interest_income_account_id,
         COALESCE(p.fee_income_account_id, p.interest_income_account_id)
    INTO v_ar_gl, v_int_gl, v_fee_gl
    FROM public.loan_product p WHERE p.id = v_loan.product_id;

  IF v_liab_gl IS NULL OR v_ar_gl IS NULL OR v_int_gl IS NULL OR v_fee_gl IS NULL THEN
    RAISE EXCEPTION 'Chart of accounts not configured (savings deposit liability / loan principal AR / interest / fee income) for company %', v_mandate.company_id
      USING HINT = 'Configure product GL mappings before enabling auto-collection.';
  END IF;

  -- Verify each GL account belongs to the same company
  PERFORM 1 FROM public.gl_account
    WHERE id IN (v_liab_gl, v_ar_gl, v_int_gl, v_fee_gl)
      AND company_id <> v_mandate.company_id;
  IF FOUND THEN
    RAISE EXCEPTION 'GL account belongs to a different company than mandate %', _mandate_id;
  END IF;

  -- Post savings side using the ACTUAL allocated amount, not the pre-allocation estimate.
  v_new_bal := COALESCE(v_acct.balance,0) - v_actual;
  v_new_avail := v_new_bal - v_holds;
  v_idem := 'auto:'||_run_id::text||':'||_mandate_id::text;
  v_ref := 'AUTO-'||to_char(v_run.business_date,'YYMMDD')||'-'||UPPER(SUBSTR(v_run.run_window,1,3))||'-'||SUBSTR(_mandate_id::text,1,8);

  INSERT INTO public.savings_transaction(
    company_id, account_id, txn_type, channel, amount, running_balance,
    reference, narration, idempotency_key, payment_method, payment_details
  ) VALUES (
    v_mandate.company_id, v_mandate.savings_account_id,
    'transfer_out'::savings_txn_type, 'other'::savings_channel,
    -v_actual, v_new_bal, v_ref,
    'Auto-collect to loan '||COALESCE(v_loan.loan_no, v_loan.id::text),
    v_idem, 'sdf_savings',
    jsonb_build_object('loan_id', v_loan.id, 'mandate_id', _mandate_id, 'run_id', _run_id)
  ) RETURNING id INTO v_sav_txn;

  UPDATE public.savings_account
     SET balance = v_new_bal, available_balance = v_new_avail, last_txn_at = now()
   WHERE id = v_mandate.savings_account_id;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_liab_gl, 'debit', v_actual, 'credit', 0, 'memo', 'Auto-collect from savings')
  );
  IF v_alloc_fee > 0 THEN
    v_lines := v_lines || jsonb_build_object('account_id', v_fee_gl, 'debit', 0, 'credit', v_alloc_fee, 'memo', 'Fees');
  END IF;
  IF v_alloc_int > 0 THEN
    v_lines := v_lines || jsonb_build_object('account_id', v_int_gl, 'debit', 0, 'credit', v_alloc_int, 'memo', 'Interest');
  END IF;
  IF v_alloc_prin > 0 THEN
    v_lines := v_lines || jsonb_build_object('account_id', v_ar_gl, 'debit', 0, 'credit', v_alloc_prin, 'memo', 'Principal');
  END IF;

  v_entry_id := public.post_entry(
    v_run.business_date, v_ref,
    'Auto-collect · savings→loan · '||COALESCE(v_loan.loan_no, v_loan.id::text),
    v_lines, v_loan.branch_id, 'savings_automation', v_sav_txn, v_idem, v_loan.id
  );

  INSERT INTO public.repayment(
    loan_id, entry_id, amount, channel, received_at,
    idempotency_key, reference, notes,
    allocated_fees, allocated_interest, allocated_principal, unallocated_amount
  ) VALUES (
    v_loan.id, v_entry_id, v_actual, 'internal'::payment_channel, now(),
    v_idem, v_ref, 'Auto-collect from savings '||v_acct.account_no,
    v_alloc_fee, v_alloc_int, v_alloc_prin, 0
  ) RETURNING id INTO v_rep_id;

  SELECT COALESCE(SUM(principal_due-principal_paid),0) + COALESCE(SUM(interest_due-interest_paid),0) + COALESCE(SUM(fee_due-fee_paid),0)
    INTO v_outstanding FROM public.loan_installment WHERE loan_id = v_loan.id;
  IF v_outstanding <= 0 THEN
    UPDATE public.loan SET status='closed'::loan_status WHERE id = v_loan.id;
    v_closed := true;
  ELSIF v_loan.status = 'disbursed' THEN
    UPDATE public.loan SET status='active'::loan_status WHERE id = v_loan.id;
  END IF;

  v_status := CASE WHEN v_actual >= v_target THEN 'collected' ELSE 'partial' END;
  INSERT INTO public.savings_auto_collection_result(
    run_id, mandate_id, savings_account_id, loan_id, status,
    requested, collected, savings_txn_id, loan_repayment_id, gl_entry_id, reason
  ) VALUES (
    _run_id, _mandate_id, v_mandate.savings_account_id, v_loan.id, v_status,
    v_target, v_actual, v_sav_txn, v_rep_id, v_entry_id,
    CASE WHEN v_closed THEN 'Loan closed' ELSE NULL END
  );

  RETURN jsonb_build_object(
    'status', v_status, 'requested', v_target, 'collected', v_actual,
    'savings_txn_id', v_sav_txn, 'loan_repayment_id', v_rep_id, 'gl_entry_id', v_entry_id,
    'loan_closed', v_closed
  );
EXCEPTION WHEN OTHERS THEN
  RAISE;
END $fn$;

REVOKE ALL ON FUNCTION public.execute_savings_loan_mandate(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_savings_loan_mandate(uuid, uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Dispatcher: called by pg_cron every 5 minutes.  Reads per-company config
--    and POSTs the webhook once per (company, business_date, window) when the
--    company's local time crosses the configured window time.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.savings_auto_collection_dispatch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  run_window text NOT NULL CHECK (run_window IN ('morning','afternoon')),
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  http_request_id bigint,
  UNIQUE (company_id, business_date, run_window)
);
GRANT SELECT ON public.savings_auto_collection_dispatch TO authenticated;
GRANT ALL    ON public.savings_auto_collection_dispatch TO service_role;
ALTER TABLE public.savings_auto_collection_dispatch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auto_coll_dispatch_view" ON public.savings_auto_collection_dispatch;
CREATE POLICY "auto_coll_dispatch_view"
  ON public.savings_auto_collection_dispatch FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'savings.automation.configure', company_id)
      OR public.has_permission(auth.uid(), 'savings.admin', company_id));

CREATE OR REPLACE FUNCTION public.dispatch_savings_auto_collections(
  _webhook_url text,
  _apikey text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE
  r RECORD;
  v_tz text;
  v_local timestamptz;
  v_local_date date;
  v_local_time time;
  v_win text;
  v_win_time time;
  v_req_id bigint;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT cfg.company_id, cfg.morning_enabled, cfg.morning_time,
           cfg.afternoon_enabled, cfg.afternoon_time,
           COALESCE(NULLIF(cfg.timezone_override,''), c.timezone, 'UTC') AS tz
      FROM public.savings_auto_collection_config cfg
      JOIN public.company c ON c.id = cfg.company_id
  LOOP
    v_tz := r.tz;
    v_local := now() AT TIME ZONE v_tz;
    v_local_date := v_local::date;
    v_local_time := v_local::time;

    -- Determine which window (if any) is due within the last 5 minutes
    v_win := NULL;
    IF r.morning_enabled AND v_local_time >= r.morning_time
       AND v_local_time < r.morning_time + interval '5 minutes' THEN
      v_win := 'morning'; v_win_time := r.morning_time;
    ELSIF r.afternoon_enabled AND v_local_time >= r.afternoon_time
       AND v_local_time < r.afternoon_time + interval '5 minutes' THEN
      v_win := 'afternoon'; v_win_time := r.afternoon_time;
    END IF;

    CONTINUE WHEN v_win IS NULL;

    -- Idempotent per (company, local business date, window)
    BEGIN
      INSERT INTO public.savings_auto_collection_dispatch(company_id, business_date, run_window)
      VALUES (r.company_id, v_local_date, v_win);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;

    SELECT net.http_post(
      url    := _webhook_url,
      headers:= jsonb_build_object('Content-Type','application/json','apikey', _apikey),
      body   := jsonb_build_object('window', v_win, 'business_date', v_local_date::text, 'company_id', r.company_id)
    ) INTO v_req_id;

    UPDATE public.savings_auto_collection_dispatch
       SET http_request_id = v_req_id
     WHERE company_id = r.company_id AND business_date = v_local_date AND run_window = v_win;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('dispatched', v_count);
END $fn$;

REVOKE ALL ON FUNCTION public.dispatch_savings_auto_collections(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_savings_auto_collections(text, text) TO service_role;
