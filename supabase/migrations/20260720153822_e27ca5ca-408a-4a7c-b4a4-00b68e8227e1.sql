
-- =========================================================
-- 1) Harden finalize_savings_hold_release
-- =========================================================
CREATE OR REPLACE FUNCTION public.finalize_savings_hold_release(
  _instance_id uuid,
  _decision text  -- retained for signature stability; authoritative decision
                  -- is re-derived from workflow_instance.status
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst    RECORD;
  v_uid     uuid := auth.uid();
  v_is_svc  boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_effective text;
BEGIN
  -- The workflow instance is the source of truth.
  SELECT id, company_id, transaction_type, status
    INTO v_inst
    FROM public.workflow_instance
   WHERE id = _instance_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow instance not found' USING ERRCODE = '42704';
  END IF;
  IF v_inst.transaction_type <> 'savings_hold_release' THEN
    RAISE EXCEPTION 'Workflow instance is not a savings_hold_release'
      USING ERRCODE = '42501';
  END IF;

  -- Only the workflow engine (called as a company member) or the service
  -- role may finalize. Direct client calls with no session are rejected.
  IF NOT v_is_svc THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_company_member(v_inst.company_id) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Derive the effective decision from the workflow instance's terminal
  -- state; ignore any conflicting _decision the caller supplied.
  v_effective := CASE v_inst.status::text
                   WHEN 'approved' THEN 'approved'
                   WHEN 'declined' THEN 'rejected'
                   WHEN 'cancelled' THEN 'rejected'
                   ELSE NULL
                 END;
  IF v_effective IS NULL THEN
    RAISE EXCEPTION 'Workflow instance has not reached a terminal state (status=%)',
      v_inst.status USING ERRCODE = '42501';
  END IF;

  IF v_effective = 'approved' THEN
    UPDATE public.savings_hold
       SET active = false,
           released_at = now(),
           released_by = (SELECT id FROM public.staff WHERE user_id = v_uid LIMIT 1),
           release_status = 'approved'
     WHERE release_workflow_instance_id = _instance_id
       AND company_id = v_inst.company_id
       AND release_status = 'pending';
  ELSE
    UPDATE public.savings_hold
       SET release_status = 'rejected'
     WHERE release_workflow_instance_id = _instance_id
       AND company_id = v_inst.company_id
       AND release_status = 'pending';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_savings_hold_release(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_savings_hold_release(uuid, text) TO authenticated;

-- =========================================================
-- 2) Harden request_savings_hold_release
-- =========================================================
CREATE OR REPLACE FUNCTION public.request_savings_hold_release(
  _hold_id uuid,
  _instance_id uuid,
  _reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_hold RECORD;
  v_inst RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id, company_id, active, release_status
    INTO v_hold
    FROM public.savings_hold
   WHERE id = _hold_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hold not found' USING ERRCODE = '42704';
  END IF;

  IF NOT public.is_company_member(v_hold.company_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_admin(v_hold.company_id)
     AND NOT public.has_permission(auth.uid(), 'savings.block.release', v_hold.company_id) THEN
    RAISE EXCEPTION 'Missing permission: savings.block.release' USING ERRCODE = '42501';
  END IF;

  IF NOT v_hold.active OR v_hold.release_status NOT IN ('none','rejected') THEN
    RAISE EXCEPTION 'Hold not eligible for release' USING ERRCODE = '42501';
  END IF;

  SELECT id, company_id, transaction_type, status
    INTO v_inst
    FROM public.workflow_instance
   WHERE id = _instance_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow instance not found' USING ERRCODE = '42704';
  END IF;
  IF v_inst.company_id <> v_hold.company_id
     OR v_inst.transaction_type <> 'savings_hold_release'
     OR v_inst.status::text <> 'pending' THEN
    RAISE EXCEPTION 'Workflow instance does not match this hold' USING ERRCODE = '42501';
  END IF;

  UPDATE public.savings_hold
     SET release_requested_by = (SELECT id FROM public.staff WHERE user_id = v_uid LIMIT 1),
         release_requested_at = now(),
         release_requested_reason = _reason,
         release_workflow_instance_id = _instance_id,
         release_status = 'pending'
   WHERE id = _hold_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_savings_hold_release(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_savings_hold_release(uuid, uuid, text) TO authenticated;

-- =========================================================
-- 3) Enforce every active block-type hold inside record_savings_txn
-- =========================================================
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
  v_is_debit    boolean;
  v_block_hit   text;
BEGIN
  IF _amount IS NULL OR _amount = 0 THEN
    RAISE EXCEPTION 'Amount must be non-zero';
  END IF;
  IF _txn_type NOT IN ('deposit','withdrawal','fee','interest','adjustment','transfer_in','transfer_out') THEN
    RAISE EXCEPTION 'Unsupported txn_type %', _txn_type;
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.savings_transaction
      WHERE account_id = _account_id AND idempotency_key = _idempotency_key LIMIT 1;
    IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;
  END IF;

  SELECT * INTO v_acct FROM public.savings_account
    WHERE id = _account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  v_company_id := v_acct.company_id;

  IF NOT public.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.assert_savings_txn_permission(v_company_id, _txn_type);

  IF v_acct.status = 'closed' THEN RAISE EXCEPTION 'Account is closed'; END IF;
  IF v_acct.status = 'fully_blocked' THEN RAISE EXCEPTION 'Account is fully blocked'; END IF;
  IF v_acct.status = 'frozen' THEN RAISE EXCEPTION 'Account is frozen'; END IF;

  v_is_debit := _txn_type IN ('withdrawal','fee','transfer_out');
  IF v_is_debit THEN
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

  -- Enforce active approved block-type holds. These are separate from the
  -- amount-based holds accounted for in savings_active_hold_amount().
  SELECT hold_type INTO v_block_hit
    FROM public.savings_hold
   WHERE account_id = _account_id
     AND active
     AND approval_state = 'approved'
     AND (expires_at IS NULL OR expires_at > now())
     AND (
       hold_type = 'full_block'
       OR (v_is_debit AND hold_type = 'debit_block')
       OR (NOT v_is_debit AND _txn_type <> 'interest' AND hold_type = 'credit_block')
     )
   LIMIT 1;
  IF v_block_hit IS NOT NULL THEN
    RAISE EXCEPTION 'Account has an active % hold; % is not permitted',
      v_block_hit, _txn_type USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_product FROM public.savings_product WHERE id = v_acct.product_id;
  v_holds := public.savings_active_hold_amount(_account_id);
  v_new_bal := COALESCE(v_acct.balance,0) + v_signed;
  v_new_avail := v_new_bal - v_holds;

  IF v_is_debit THEN
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
END $function$;
