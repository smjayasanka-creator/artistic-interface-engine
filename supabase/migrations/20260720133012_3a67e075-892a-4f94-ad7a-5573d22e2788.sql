
-- Phase 3: atomic savings deposit / withdrawal / reversal

CREATE OR REPLACE FUNCTION public.savings_active_hold_amount(_account_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0)::numeric
    FROM public.savings_hold
   WHERE account_id = _account_id
     AND active
     AND approval_state = 'approved'
     AND hold_type IN ('amount_hold','lien','loan_lien','legal')
     AND (expires_at IS NULL OR expires_at > now());
$$;
GRANT EXECUTE ON FUNCTION public.savings_active_hold_amount(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_savings_txn(
  _account_id uuid,
  _txn_type text,
  _amount numeric,
  _channel text DEFAULT 'branch',
  _reference text DEFAULT NULL,
  _external_ref text DEFAULT NULL,
  _narration text DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _payment_details jsonb DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acct        RECORD;
  v_product     RECORD;
  v_staff_id    uuid;
  v_company_id  uuid;
  v_signed      numeric;
  v_new_bal     numeric;
  v_new_avail   numeric;
  v_holds       numeric;
  v_txn_id      uuid;
  v_existing_id uuid;
  v_gl_cash     uuid;
  v_gl_liab     uuid;
  v_gl_fee      uuid;
  v_gl_intr     uuid;
  v_lines       jsonb;
  v_ref_prefix  text;
  v_amt_abs     numeric := ABS(_amount);
BEGIN
  IF _amount IS NULL OR _amount = 0 THEN
    RAISE EXCEPTION 'Amount must be non-zero';
  END IF;
  IF _txn_type NOT IN ('deposit','withdrawal','fee','interest','adjustment','transfer_in','transfer_out') THEN
    RAISE EXCEPTION 'Unsupported txn_type %', _txn_type;
  END IF;

  -- idempotency short-circuit
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.savings_transaction
      WHERE account_id = _account_id AND idempotency_key = _idempotency_key LIMIT 1;
    IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;
  END IF;

  -- lock account row
  SELECT * INTO v_acct FROM public.savings_account
    WHERE id = _account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  v_company_id := v_acct.company_id;

  IF NOT public.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_acct.status = 'closed' THEN RAISE EXCEPTION 'Account is closed'; END IF;
  IF v_acct.status = 'fully_blocked' THEN RAISE EXCEPTION 'Account is fully blocked'; END IF;
  IF v_acct.status = 'frozen' THEN RAISE EXCEPTION 'Account is frozen'; END IF;

  -- signed amount and status-based block checks
  IF _txn_type IN ('withdrawal','fee','transfer_out') THEN
    v_signed := -v_amt_abs;
    IF v_acct.status IN ('debit_blocked') THEN
      RAISE EXCEPTION 'Debits are blocked on this account';
    END IF;
  ELSE
    v_signed := v_amt_abs;
    IF v_acct.status IN ('credit_blocked') AND _txn_type <> 'interest' THEN
      RAISE EXCEPTION 'Credits are blocked on this account';
    END IF;
  END IF;

  SELECT * INTO v_product FROM public.savings_product WHERE id = v_acct.product_id;
  v_holds := public.savings_active_hold_amount(_account_id);
  v_new_bal := COALESCE(v_acct.balance,0) + v_signed;
  v_new_avail := v_new_bal - v_holds;

  IF _txn_type IN ('withdrawal','fee','transfer_out') THEN
    IF v_new_bal < COALESCE(v_product.min_balance,0) THEN
      RAISE EXCEPTION 'Balance would fall below product minimum (%)', v_product.min_balance;
    END IF;
    IF v_new_avail < 0 THEN
      RAISE EXCEPTION 'Insufficient available balance (holds: %)', v_holds;
    END IF;
  END IF;

  SELECT id INTO v_staff_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.savings_transaction (
    company_id, account_id, txn_type, channel, amount, running_balance,
    reference, external_ref, narration, performed_by, idempotency_key,
    payment_method, payment_details
  ) VALUES (
    v_company_id, _account_id, _txn_type::savings_txn_type, COALESCE(_channel,'branch')::savings_channel,
    v_signed, v_new_bal, _reference, _external_ref, _narration, v_staff_id, _idempotency_key,
    _payment_method, _payment_details
  ) RETURNING id INTO v_txn_id;

  UPDATE public.savings_account
     SET balance = v_new_bal,
         available_balance = v_new_avail,
         last_txn_at = now()
   WHERE id = _account_id;

  -- GL posting via kernel
  v_gl_cash := COALESCE(v_product.cash_account_id, (SELECT id FROM public.gl_account WHERE code='1000' LIMIT 1));
  v_gl_liab := COALESCE(v_product.deposit_liability_account_id, (SELECT id FROM public.gl_account WHERE code='2100' LIMIT 1));
  v_gl_fee  := COALESCE(v_product.fee_income_account_id, (SELECT id FROM public.gl_account WHERE code='4100' LIMIT 1));
  v_gl_intr := COALESCE(v_product.interest_expense_account_id, (SELECT id FROM public.gl_account WHERE code='5100' LIMIT 1));

  IF _txn_type = 'deposit' OR _txn_type = 'transfer_in' THEN
    IF v_gl_cash IS NULL OR v_gl_liab IS NULL THEN
      RAISE EXCEPTION 'Missing GL mapping (cash / deposit liability) for product';
    END IF;
    v_ref_prefix := 'SAV-DEP';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_gl_cash, 'debit', v_amt_abs, 'credit', 0),
      jsonb_build_object('account_id', v_gl_liab, 'debit', 0, 'credit', v_amt_abs)
    );
  ELSIF _txn_type = 'withdrawal' OR _txn_type = 'transfer_out' THEN
    IF v_gl_cash IS NULL OR v_gl_liab IS NULL THEN
      RAISE EXCEPTION 'Missing GL mapping (cash / deposit liability) for product';
    END IF;
    v_ref_prefix := 'SAV-WD';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_gl_liab, 'debit', v_amt_abs, 'credit', 0),
      jsonb_build_object('account_id', v_gl_cash, 'debit', 0, 'credit', v_amt_abs)
    );
  ELSIF _txn_type = 'fee' THEN
    IF v_gl_liab IS NULL OR v_gl_fee IS NULL THEN
      RAISE EXCEPTION 'Missing GL mapping (liability / fee income)';
    END IF;
    v_ref_prefix := 'SAV-FEE';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_gl_liab, 'debit', v_amt_abs, 'credit', 0),
      jsonb_build_object('account_id', v_gl_fee,  'debit', 0, 'credit', v_amt_abs)
    );
  ELSIF _txn_type = 'interest' THEN
    IF v_gl_liab IS NULL OR v_gl_intr IS NULL THEN
      RAISE EXCEPTION 'Missing GL mapping (liability / interest expense)';
    END IF;
    v_ref_prefix := 'SAV-INT';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_gl_intr, 'debit', v_amt_abs, 'credit', 0),
      jsonb_build_object('account_id', v_gl_liab, 'debit', 0, 'credit', v_amt_abs)
    );
  END IF;

  IF v_lines IS NOT NULL THEN
    PERFORM public.post_entry(
      _entry_date := CURRENT_DATE,
      _reference := v_ref_prefix || '-' || v_acct.account_no,
      _description := COALESCE(_narration, _txn_type || ' · ' || v_acct.account_no),
      _lines := v_lines,
      _branch_id := v_acct.branch_id,
      _source_module := 'savings',
      _source_ref := v_txn_id,
      _idempotency_key := 'savings:txn:' || COALESCE(_idempotency_key, v_txn_id::text)
    );
  END IF;

  RETURN v_txn_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_savings_txn(uuid,text,numeric,text,text,text,text,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_savings_txn(
  _txn_id uuid,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_orig       RECORD;
  v_new_type   text;
  v_new_txn    uuid;
BEGIN
  SELECT * INTO v_orig FROM public.savings_transaction WHERE id = _txn_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT public.is_company_member(v_orig.company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_orig.reversed_by_txn_id IS NOT NULL THEN RAISE EXCEPTION 'Already reversed'; END IF;
  IF v_orig.txn_type::text = 'reversal' THEN RAISE EXCEPTION 'Cannot reverse a reversal'; END IF;

  -- invert
  IF v_orig.amount > 0 THEN v_new_type := 'withdrawal';
  ELSE v_new_type := 'deposit'; END IF;

  v_new_txn := public.record_savings_txn(
    _account_id := v_orig.account_id,
    _txn_type := v_new_type,
    _amount := ABS(v_orig.amount),
    _channel := v_orig.channel::text,
    _reference := 'REV ' || COALESCE(v_orig.reference, v_orig.id::text),
    _external_ref := v_orig.external_ref,
    _narration := 'Reversal: ' || _reason,
    _payment_method := v_orig.payment_method,
    _payment_details := v_orig.payment_details,
    _idempotency_key := 'reverse:' || v_orig.id::text
  );

  UPDATE public.savings_transaction
     SET reversed_by_txn_id = v_new_txn
   WHERE id = v_orig.id;
  UPDATE public.savings_transaction
     SET reverses_txn_id = v_orig.id,
         txn_type = 'reversal'
   WHERE id = v_new_txn;

  RETURN v_new_txn;
END $$;
GRANT EXECUTE ON FUNCTION public.reverse_savings_txn(uuid,text) TO authenticated;
