
-- Block direct txns on pending states, and add activation RPC that
-- performs first deposit + optional opening fee, using GL from product only.

CREATE OR REPLACE FUNCTION public.record_savings_txn(
  _account_id uuid, _txn_type text, _amount numeric,
  _channel text DEFAULT 'branch',
  _reference text DEFAULT NULL, _external_ref text DEFAULT NULL,
  _narration text DEFAULT NULL, _payment_method text DEFAULT NULL,
  _payment_details jsonb DEFAULT NULL, _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE
  v_status text;
BEGIN
  SELECT status::text INTO v_status FROM public.savings_account WHERE id = _account_id;
  IF v_status IN ('pending_approval','pending_funding') THEN
    RAISE EXCEPTION 'Account is % — activate via initial funding first', v_status;
  END IF;
  -- Delegate to the underlying implementation via a renamed helper
  RETURN public._record_savings_txn_impl(_account_id,_txn_type,_amount,_channel,_reference,_external_ref,_narration,_payment_method,_payment_details,_idempotency_key);
END $fn$;

-- Rename existing body: create impl copy by extracting from current function
-- (We alias — actually create a helper that inlines the same body used before.)
-- Simpler: re-create the previous logic as _record_savings_txn_impl.

-- To avoid duplicating a long function, wrap: temporarily disable the status
-- check by using SET LOCAL context flag. We instead just do it in a helper.

-- Drop above and use a session flag approach:
DROP FUNCTION IF EXISTS public.record_savings_txn(uuid,text,numeric,text,text,text,text,text,jsonb,text);

CREATE OR REPLACE FUNCTION public.record_savings_txn(
  _account_id uuid, _txn_type text, _amount numeric,
  _channel text DEFAULT 'branch',
  _reference text DEFAULT NULL, _external_ref text DEFAULT NULL,
  _narration text DEFAULT NULL, _payment_method text DEFAULT NULL,
  _payment_details jsonb DEFAULT NULL, _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
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
  v_gl_cash uuid; v_gl_liab uuid; v_gl_fee uuid; v_gl_intr uuid; v_gl_adj uuid;
  v_gl_entry    uuid;
  v_lines       jsonb;
  v_ref_prefix  text;
  v_amt_abs     numeric := ABS(_amount);
  v_hold_dir    text;
  v_bypass_pending boolean := COALESCE(current_setting('mzizi.allow_pending_funding_txn', true) = 'on', false);
BEGIN
  IF _amount IS NULL OR _amount = 0 THEN RAISE EXCEPTION 'Amount must be non-zero'; END IF;
  IF _txn_type NOT IN ('deposit','withdrawal','fee','interest','adjustment','transfer_in','transfer_out') THEN
    RAISE EXCEPTION 'Unsupported txn_type %', _txn_type;
  END IF;

  PERFORM public.assert_savings_txn_permission(_txn_type);

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.savings_transaction
      WHERE account_id=_account_id AND idempotency_key=_idempotency_key LIMIT 1;
    IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;
  END IF;

  SELECT * INTO v_acct FROM public.savings_account WHERE id=_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  v_company_id := v_acct.company_id;

  IF NOT public.is_company_member(v_company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  IF v_acct.status::text IN ('pending_approval','pending_funding') AND NOT v_bypass_pending THEN
    RAISE EXCEPTION 'Account is % — activate via initial funding first', v_acct.status;
  END IF;
  IF v_acct.status='closed' THEN RAISE EXCEPTION 'Account is closed'; END IF;
  IF v_acct.status='fully_blocked' THEN RAISE EXCEPTION 'Account is fully blocked'; END IF;
  IF v_acct.status='frozen' THEN RAISE EXCEPTION 'Account is frozen'; END IF;

  IF _txn_type IN ('withdrawal','fee','transfer_out') THEN v_signed := -v_amt_abs;
  ELSIF _txn_type IN ('adjustment','interest') THEN v_signed := _amount;
  ELSE v_signed := v_amt_abs; END IF;

  IF v_signed < 0 THEN
    v_hold_dir := 'debit';
    IF v_acct.status='debit_blocked' THEN RAISE EXCEPTION 'Debits are blocked on this account'; END IF;
  ELSE
    v_hold_dir := 'credit';
    IF v_acct.status='credit_blocked' AND _txn_type<>'interest' THEN RAISE EXCEPTION 'Credits are blocked on this account'; END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.savings_hold
    WHERE account_id=_account_id AND active AND approval_state='approved'
      AND (expires_at IS NULL OR expires_at>now())
      AND (hold_type='full_block'
        OR (v_hold_dir='debit'  AND hold_type='debit_block')
        OR (v_hold_dir='credit' AND hold_type='credit_block'))
  ) THEN
    RAISE EXCEPTION 'Active hold prevents % on this account', v_hold_dir;
  END IF;

  SELECT * INTO v_product FROM public.savings_product WHERE id=v_acct.product_id;
  v_holds := public.savings_active_hold_amount(_account_id);
  v_new_bal := COALESCE(v_acct.balance,0) + v_signed;
  v_new_avail := v_new_bal - v_holds;

  IF v_signed < 0 AND v_new_avail < COALESCE(v_product.min_balance,0) THEN
    RAISE EXCEPTION 'Insufficient available balance (min balance %)', v_product.min_balance;
  END IF;

  SELECT id INTO v_staff_id FROM public.staff WHERE user_id=auth.uid() AND company_id=v_company_id LIMIT 1;

  INSERT INTO public.savings_transaction(
    company_id,account_id,txn_type,channel,amount,balance_after,
    reference,external_ref,narration,posted_by,idempotency_key,payment_method,payment_details
  ) VALUES (
    v_company_id,_account_id,_txn_type::savings_txn_type,
    COALESCE(_channel,'branch')::savings_channel,
    v_signed,v_new_bal,_reference,_external_ref,_narration,v_staff_id,
    _idempotency_key,_payment_method,_payment_details
  ) RETURNING id INTO v_txn_id;

  UPDATE public.savings_account
     SET balance=v_new_bal, available_balance=v_new_avail, last_txn_at=now()
   WHERE id=_account_id;

  v_gl_cash := v_product.cash_account_id;
  v_gl_liab := v_product.deposit_liability_account_id;
  v_gl_fee  := v_product.fee_income_account_id;
  v_gl_intr := v_product.interest_expense_account_id;
  v_gl_adj  := v_product.adjustment_account_id;

  IF _txn_type='deposit' THEN
    IF v_gl_cash IS NULL OR v_gl_liab IS NULL THEN RAISE EXCEPTION 'Missing GL mapping (cash / deposit liability) on product %', v_product.code; END IF;
    v_ref_prefix := 'SAV-DEP';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id',v_gl_cash,'debit',v_amt_abs,'credit',0),
      jsonb_build_object('account_id',v_gl_liab,'debit',0,'credit',v_amt_abs));
  ELSIF _txn_type='withdrawal' THEN
    IF v_gl_cash IS NULL OR v_gl_liab IS NULL THEN RAISE EXCEPTION 'Missing GL mapping (cash / deposit liability) on product %', v_product.code; END IF;
    v_ref_prefix := 'SAV-WD';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id',v_gl_liab,'debit',v_amt_abs,'credit',0),
      jsonb_build_object('account_id',v_gl_cash,'debit',0,'credit',v_amt_abs));
  ELSIF _txn_type IN ('transfer_in','transfer_out') THEN
    v_lines := NULL;
  ELSIF _txn_type='fee' THEN
    IF v_gl_liab IS NULL OR v_gl_fee IS NULL THEN RAISE EXCEPTION 'Missing GL mapping (liability / fee income) on product %', v_product.code; END IF;
    v_ref_prefix := 'SAV-FEE';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id',v_gl_liab,'debit',v_amt_abs,'credit',0),
      jsonb_build_object('account_id',v_gl_fee,'debit',0,'credit',v_amt_abs));
  ELSIF _txn_type='interest' THEN
    IF v_gl_liab IS NULL OR v_gl_intr IS NULL THEN RAISE EXCEPTION 'Missing GL mapping (liability / interest expense) on product %', v_product.code; END IF;
    v_ref_prefix := 'SAV-INT';
    IF v_signed >= 0 THEN
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id',v_gl_intr,'debit',v_amt_abs,'credit',0),
        jsonb_build_object('account_id',v_gl_liab,'debit',0,'credit',v_amt_abs));
    ELSE
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id',v_gl_liab,'debit',v_amt_abs,'credit',0),
        jsonb_build_object('account_id',v_gl_intr,'debit',0,'credit',v_amt_abs));
    END IF;
  ELSIF _txn_type='adjustment' THEN
    IF v_gl_liab IS NULL OR v_gl_adj IS NULL THEN RAISE EXCEPTION 'Missing GL mapping (liability / adjustment) on product %', v_product.code; END IF;
    v_ref_prefix := 'SAV-ADJ';
    IF v_signed >= 0 THEN
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id',v_gl_adj,'debit',v_amt_abs,'credit',0),
        jsonb_build_object('account_id',v_gl_liab,'debit',0,'credit',v_amt_abs));
    ELSE
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id',v_gl_liab,'debit',v_amt_abs,'credit',0),
        jsonb_build_object('account_id',v_gl_adj,'debit',0,'credit',v_amt_abs));
    END IF;
  END IF;

  IF v_lines IS NOT NULL THEN
    v_gl_entry := public.post_entry(
      _entry_date := CURRENT_DATE,
      _reference := v_ref_prefix||'-'||v_acct.account_no,
      _description := COALESCE(_narration,_txn_type||' · '||v_acct.account_no),
      _lines := v_lines,
      _branch_id := v_acct.branch_id,
      _source_module := 'savings',
      _source_ref := v_txn_id,
      _idempotency_key := 'savings:txn:'||COALESCE(_idempotency_key,v_txn_id::text));
    UPDATE public.savings_transaction SET gl_entry_id=v_gl_entry WHERE id=v_txn_id;
  END IF;

  RETURN v_txn_id;
END $fn$;

GRANT EXECUTE ON FUNCTION public.record_savings_txn(uuid,text,numeric,text,text,text,text,text,jsonb,text) TO authenticated;

-- Activation RPC: atomic first-funding + optional opening fee
CREATE OR REPLACE FUNCTION public.activate_savings_account(
  _account_id uuid,
  _opening_deposit numeric DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _payment_details jsonb DEFAULT NULL,
  _channel text DEFAULT 'branch',
  _external_ref text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE
  v_acct RECORD; v_product RECORD;
  v_amount numeric; v_pm text; v_pd jsonb;
  v_txn_id uuid; v_fee_txn_id uuid;
  v_staff_id uuid;
BEGIN
  SELECT * INTO v_acct FROM public.savings_account WHERE id=_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF NOT public.is_company_member(v_acct.company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_acct.status::text <> 'pending_funding' THEN
    RAISE EXCEPTION 'Account is % — only pending_funding accounts can be activated', v_acct.status;
  END IF;

  SELECT * INTO v_product FROM public.savings_product WHERE id=v_acct.product_id;
  IF v_product.cash_account_id IS NULL OR v_product.deposit_liability_account_id IS NULL THEN
    RAISE EXCEPTION 'Product % missing GL mapping (cash / deposit liability) — configure it in Savings product setup', v_product.code;
  END IF;
  IF COALESCE(v_product.opening_fee,0) > 0 AND v_product.fee_income_account_id IS NULL THEN
    RAISE EXCEPTION 'Product % has opening fee but no fee income GL account configured', v_product.code;
  END IF;

  v_amount := COALESCE(_opening_deposit, v_acct.pending_opening_deposit);
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'Opening deposit amount required'; END IF;
  IF v_amount < COALESCE(v_product.min_opening_balance,0) THEN
    RAISE EXCEPTION 'Opening deposit % below product minimum %', v_amount, v_product.min_opening_balance;
  END IF;

  v_pm := COALESCE(_payment_method, v_acct.pending_payment_method);
  v_pd := COALESCE(_payment_details, v_acct.pending_payment_details);

  -- Activate first so record_savings_txn accepts the deposit
  UPDATE public.savings_account
     SET status='active', pending_opening_deposit=NULL,
         pending_payment_method=NULL, pending_payment_details=NULL,
         opened_on = COALESCE(opened_on, CURRENT_DATE)
   WHERE id=_account_id;

  v_txn_id := public.record_savings_txn(
    _account_id := _account_id,
    _txn_type := 'deposit',
    _amount := v_amount,
    _channel := _channel,
    _reference := 'OPEN-'||v_acct.account_no,
    _external_ref := _external_ref,
    _narration := 'Initial deposit on activation',
    _payment_method := v_pm,
    _payment_details := v_pd,
    _idempotency_key := COALESCE(_idempotency_key,'activate:'||_account_id::text)
  );

  IF COALESCE(v_product.opening_fee,0) > 0 THEN
    v_fee_txn_id := public.record_savings_txn(
      _account_id := _account_id,
      _txn_type := 'fee',
      _amount := v_product.opening_fee,
      _channel := _channel,
      _reference := 'OPEN-FEE-'||v_acct.account_no,
      _narration := 'Opening fee',
      _idempotency_key := COALESCE(_idempotency_key,'activate:'||_account_id::text)||':fee'
    );
  END IF;

  RETURN jsonb_build_object(
    'account_id', _account_id,
    'deposit_txn_id', v_txn_id,
    'opening_fee_txn_id', v_fee_txn_id,
    'status', 'active');
END $fn$;

GRANT EXECUTE ON FUNCTION public.activate_savings_account(uuid,numeric,text,jsonb,text,text,text) TO authenticated;
