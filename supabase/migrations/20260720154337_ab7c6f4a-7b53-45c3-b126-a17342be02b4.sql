
CREATE OR REPLACE FUNCTION public.close_savings_account(
  _account_id uuid,
  _reason text,
  _payout_channel text DEFAULT 'branch',
  _external_ref text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_acct     RECORD;
  v_product  RECORD;
  v_fee      numeric;
  v_after    numeric;
  v_gl_cash  uuid;
  v_gl_liab  uuid;
  v_gl_fee   uuid;
  v_blocks   int;
  v_staff    uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_staff FROM public.staff WHERE user_id = v_uid LIMIT 1;

  SELECT * INTO v_acct FROM public.savings_account
    WHERE id = _account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF NOT public.is_company_member(v_acct.company_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  IF NOT public.is_company_admin(v_acct.company_id)
     AND NOT public.has_permission(v_uid, 'savings.close', v_acct.company_id)
     AND NOT public.has_permission(v_uid, 'savings.admin', v_acct.company_id) THEN
    RAISE EXCEPTION 'Missing permission: savings.close' USING ERRCODE='42501';
  END IF;

  IF v_acct.status::text = 'closed' THEN
    RETURN (SELECT to_jsonb(s.*) FROM public.savings_account s WHERE id = _account_id);
  END IF;

  SELECT COUNT(*) INTO v_blocks
    FROM public.savings_hold
   WHERE account_id = _account_id
     AND active
     AND approval_state = 'approved'
     AND (expires_at IS NULL OR expires_at > now());
  IF v_blocks > 0 THEN
    RAISE EXCEPTION 'Cannot close: account has % active hold(s) or block(s); release them first',
      v_blocks USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_product FROM public.savings_product WHERE id = v_acct.product_id;
  v_fee   := COALESCE(v_product.closure_fee, 0);
  v_after := COALESCE(v_acct.balance, 0) - v_fee;
  IF v_after < 0 THEN
    RAISE EXCEPTION 'Closure fee exceeds balance';
  END IF;

  IF v_fee > 0 THEN
    INSERT INTO public.savings_transaction (
      company_id, account_id, txn_type, channel, amount, running_balance,
      reference, narration, performed_by, idempotency_key
    ) VALUES (
      v_acct.company_id, _account_id, 'fee'::savings_txn_type,
      COALESCE(_payout_channel,'branch')::savings_channel,
      -v_fee, v_after, 'CLOSURE-FEE', 'Account closure fee', v_staff,
      'close:fee:' || _account_id::text
    );
  END IF;
  IF v_after > 0 THEN
    INSERT INTO public.savings_transaction (
      company_id, account_id, txn_type, channel, amount, running_balance,
      reference, external_ref, narration, performed_by, idempotency_key
    ) VALUES (
      v_acct.company_id, _account_id, 'closure'::savings_txn_type,
      COALESCE(_payout_channel,'branch')::savings_channel,
      -v_after, 0, 'CLOSURE-PAYOUT', _external_ref,
      'Final balance payout on closure', v_staff,
      'close:payout:' || _account_id::text
    );
  END IF;

  v_gl_cash := COALESCE(v_product.cash_account_id,
                        (SELECT id FROM public.gl_account WHERE code='1000' LIMIT 1));
  v_gl_liab := COALESCE(v_product.deposit_liability_account_id,
                        (SELECT id FROM public.gl_account WHERE code='2100' LIMIT 1));
  v_gl_fee  := COALESCE(v_product.fee_income_account_id,
                        (SELECT id FROM public.gl_account WHERE code='4100' LIMIT 1));

  IF v_fee > 0 THEN
    IF v_gl_liab IS NULL OR v_gl_fee IS NULL THEN
      RAISE EXCEPTION 'Savings product missing GL mapping (liability / fee income)';
    END IF;
    PERFORM public.post_entry(
      _entry_date := CURRENT_DATE,
      _reference := 'SAV-CLOSE-FEE-' || v_acct.account_no,
      _description := 'Savings closure fee · ' || v_acct.account_no,
      _lines := jsonb_build_array(
        jsonb_build_object('account_id', v_gl_liab, 'debit', v_fee, 'credit', 0),
        jsonb_build_object('account_id', v_gl_fee,  'debit', 0, 'credit', v_fee)
      ),
      _branch_id := v_acct.branch_id,
      _source_module := 'savings',
      _source_ref := _account_id,
      _idempotency_key := 'savings:close-fee:' || _account_id::text
    );
  END IF;
  IF v_after > 0 THEN
    IF v_gl_cash IS NULL OR v_gl_liab IS NULL THEN
      RAISE EXCEPTION 'Savings product missing GL mapping (cash / liability)';
    END IF;
    PERFORM public.post_entry(
      _entry_date := CURRENT_DATE,
      _reference := 'SAV-CLOSE-' || v_acct.account_no,
      _description := 'Savings closure payout · ' || v_acct.account_no,
      _lines := jsonb_build_array(
        jsonb_build_object('account_id', v_gl_liab, 'debit', v_after, 'credit', 0),
        jsonb_build_object('account_id', v_gl_cash, 'debit', 0, 'credit', v_after)
      ),
      _branch_id := v_acct.branch_id,
      _source_module := 'savings',
      _source_ref := _account_id,
      _idempotency_key := 'savings:close:' || _account_id::text
    );
  END IF;

  UPDATE public.savings_account
     SET status = 'closed',
         balance = 0,
         available_balance = 0,
         closed_on = CURRENT_DATE,
         closed_by = v_staff,
         closure_reason = _reason
   WHERE id = _account_id;

  RETURN (SELECT to_jsonb(s.*) FROM public.savings_account s WHERE id = _account_id);
END $function$;
