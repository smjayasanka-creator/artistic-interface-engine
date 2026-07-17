
-- =========================================================================
-- 1. Enums: add 'written_off' variants where useful
-- =========================================================================
DO $$ BEGIN
  ALTER TYPE public.installment_state ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- 2. write_off_loan
-- =========================================================================
CREATE OR REPLACE FUNCTION public.write_off_loan(
  _loan_id uuid,
  _reason text,
  _use_provision boolean DEFAULT false,
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _loan       public.loan%ROWTYPE;
  _company_id uuid;
  _product    public.loan_product%ROWTYPE;
  _cap_out    numeric(18,2) := 0;
  _int_out    numeric(18,2) := 0;
  _lines      jsonb := '[]'::jsonb;
  _entry_id   uuid;
  _principal_acct uuid;
  _accrued_acct   uuid;
  _susp_acct      uuid;
  _wo_expense_acct uuid;
BEGIN
  SELECT * INTO _loan FROM public.loan WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan % not found', _loan_id; END IF;

  SELECT b.company_id INTO _company_id FROM public.branch b WHERE b.id = _loan.branch_id;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF _loan.status = 'written_off' THEN
    RAISE EXCEPTION 'Loan is already written off';
  END IF;
  IF _loan.status NOT IN ('active','disbursed') THEN
    RAISE EXCEPTION 'Only active or disbursed loans can be written off (current: %)', _loan.status;
  END IF;

  SELECT * INTO _product FROM public.loan_product WHERE id = _loan.product_id;
  _principal_acct := _product.principal_account_id;
  _accrued_acct   := _product.accrued_interest_account_id;
  _susp_acct      := _product.suspended_interest_account_id;
  _wo_expense_acct := CASE WHEN _use_provision
                           THEN _product.loan_loss_provision_account_id
                           ELSE _product.bad_debt_expense_account_id END;

  IF _principal_acct IS NULL THEN
    RAISE EXCEPTION 'Loan product missing principal GL mapping';
  END IF;
  IF _wo_expense_acct IS NULL THEN
    RAISE EXCEPTION 'Loan product missing % GL mapping',
      CASE WHEN _use_provision THEN 'loan-loss provision' ELSE 'bad-debt expense' END;
  END IF;

  -- Outstanding capital & accrued interest (approximate from installments)
  SELECT COALESCE(SUM(principal_due - principal_paid), 0),
         COALESCE(SUM(interest_due  - interest_paid ), 0)
    INTO _cap_out, _int_out
    FROM public.loan_installment
   WHERE loan_id = _loan_id
     AND state <> 'cancelled';

  -- Build posting lines
  IF _int_out > 0 THEN
    IF _accrued_acct IS NULL OR _susp_acct IS NULL THEN
      RAISE EXCEPTION 'Cannot reverse accrued interest — accrued-interest or suspended-interest account not mapped';
    END IF;
    _lines := _lines || jsonb_build_array(
      jsonb_build_object('account_id', _susp_acct,    'debit', _int_out, 'credit', 0),
      jsonb_build_object('account_id', _accrued_acct, 'debit', 0,        'credit', _int_out)
    );
  END IF;
  IF _cap_out > 0 THEN
    _lines := _lines || jsonb_build_array(
      jsonb_build_object('account_id', _wo_expense_acct, 'debit', _cap_out, 'credit', 0),
      jsonb_build_object('account_id', _principal_acct,  'debit', 0,        'credit', _cap_out)
    );
  END IF;

  IF jsonb_array_length(_lines) >= 2 THEN
    _entry_id := public.post_entry_system(
      _company_id  => _company_id,
      _entry_date  => current_date,
      _reference   => 'LOAN-WO-' || COALESCE(_loan.contract_no, _loan.id::text),
      _description => 'Loan write-off · ' || COALESCE(_reason, ''),
      _lines       => _lines,
      _branch_id   => _loan.branch_id,
      _source_module => 'loan',
      _source_ref  => _loan_id,
      _idempotency_key => COALESCE(_idempotency_key, 'writeoff:' || _loan_id::text),
      _loan_id     => _loan_id
    );
  END IF;

  -- Cancel remaining installments and flip status
  UPDATE public.loan_installment
     SET state = 'cancelled'
   WHERE loan_id = _loan_id
     AND state <> 'cancelled'
     AND (principal_due - principal_paid + interest_due - interest_paid + fee_due - fee_paid) > 0;

  UPDATE public.loan
     SET status = 'written_off',
         closed_at = now()
   WHERE id = _loan_id;

  PERFORM public.emit_audit(
    _company_id, 'loan.written_off', 'loan', _loan_id,
    to_jsonb(_loan), NULL,
    jsonb_build_object('reason', _reason, 'capital_written', _cap_out,
                       'interest_reversed', _int_out, 'use_provision', _use_provision,
                       'entry_id', _entry_id)
  );

  RETURN _loan_id;
END $fn$;

REVOKE ALL ON FUNCTION public.write_off_loan(uuid, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_off_loan(uuid, text, boolean, text) TO authenticated;

-- =========================================================================
-- 3. reschedule_loan  (state-only; no GL)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reschedule_loan(
  _loan_id uuid,
  _new_installments jsonb,   -- [{seq, due_date, principal_due, interest_due, fee_due}]
  _reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _loan       public.loan%ROWTYPE;
  _company_id uuid;
  _row jsonb;
  _next_seq int;
BEGIN
  SELECT * INTO _loan FROM public.loan WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan % not found', _loan_id; END IF;
  SELECT b.company_id INTO _company_id FROM public.branch b WHERE b.id = _loan.branch_id;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF _loan.status NOT IN ('active','disbursed') THEN
    RAISE EXCEPTION 'Only active or disbursed loans can be rescheduled (current: %)', _loan.status;
  END IF;
  IF _new_installments IS NULL OR jsonb_typeof(_new_installments) <> 'array' OR jsonb_array_length(_new_installments) = 0 THEN
    RAISE EXCEPTION 'New installments array required';
  END IF;

  -- Cancel remaining upcoming installments (keep partially paid rows intact)
  UPDATE public.loan_installment
     SET state = 'cancelled'
   WHERE loan_id = _loan_id
     AND state IN ('upcoming')
     AND principal_paid = 0 AND interest_paid = 0 AND fee_paid = 0;

  SELECT COALESCE(MAX(seq), 0) + 1 INTO _next_seq FROM public.loan_installment WHERE loan_id = _loan_id;

  FOR _row IN SELECT * FROM jsonb_array_elements(_new_installments) LOOP
    INSERT INTO public.loan_installment(loan_id, seq, due_date, principal_due, interest_due, fee_due, state, is_manual)
    VALUES (
      _loan_id,
      _next_seq,
      (_row->>'due_date')::date,
      COALESCE((_row->>'principal_due')::numeric, 0),
      COALESCE((_row->>'interest_due')::numeric,  0),
      COALESCE((_row->>'fee_due')::numeric,       0),
      'upcoming',
      true
    );
    _next_seq := _next_seq + 1;
  END LOOP;

  PERFORM public.emit_audit(
    _company_id, 'loan.rescheduled', 'loan', _loan_id,
    NULL, _new_installments,
    jsonb_build_object('reason', _reason)
  );

  RETURN _loan_id;
END $fn$;

REVOKE ALL ON FUNCTION public.reschedule_loan(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_loan(uuid, jsonb, text) TO authenticated;

-- =========================================================================
-- 4. mark_savings_dormant  (state-only)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.mark_savings_dormant(_account_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE _acct public.savings_account%ROWTYPE;
BEGIN
  SELECT * INTO _acct FROM public.savings_account WHERE id = _account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Savings account % not found', _account_id; END IF;
  IF NOT public.is_company_member(_acct.company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF _acct.status <> 'active' THEN
    RAISE EXCEPTION 'Only active savings accounts can be marked dormant (current: %)', _acct.status;
  END IF;

  UPDATE public.savings_account SET status = 'dormant' WHERE id = _account_id;

  PERFORM public.emit_audit(_acct.company_id, 'savings.dormant', 'savings_account', _account_id,
    to_jsonb(_acct), NULL, '{}'::jsonb);
  RETURN _account_id;
END $fn$;

REVOKE ALL ON FUNCTION public.mark_savings_dormant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_savings_dormant(uuid) TO authenticated;

-- =========================================================================
-- 5. transfer_savings_to_unclaimed
-- =========================================================================
CREATE OR REPLACE FUNCTION public.transfer_savings_to_unclaimed(
  _account_id uuid,
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _acct    public.savings_account%ROWTYPE;
  _product public.savings_product%ROWTYPE;
  _entry_id uuid;
  _bal numeric(18,2);
  _liab_acct uuid;
  _uncl_acct uuid;
BEGIN
  SELECT * INTO _acct FROM public.savings_account WHERE id = _account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Savings account % not found', _account_id; END IF;
  IF NOT public.is_company_member(_acct.company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF _acct.status NOT IN ('dormant','frozen') THEN
    RAISE EXCEPTION 'Only dormant/frozen savings accounts can be transferred to unclaimed (current: %)', _acct.status;
  END IF;

  SELECT * INTO _product FROM public.savings_product WHERE id = _acct.product_id;
  _liab_acct := _product.deposit_liability_account_id;
  _uncl_acct := _product.unclaimed_deposit_liability_account_id;
  IF _liab_acct IS NULL OR _uncl_acct IS NULL THEN
    RAISE EXCEPTION 'Product missing deposit-liability or unclaimed-liability GL mapping';
  END IF;

  _bal := _acct.balance;
  IF _bal > 0 THEN
    _entry_id := public.post_entry_system(
      _company_id  => _acct.company_id,
      _entry_date  => current_date,
      _reference   => 'SAV-UNCL-' || _acct.account_no,
      _description => 'Transfer dormant balance to unclaimed deposits',
      _lines       => jsonb_build_array(
        jsonb_build_object('account_id', _liab_acct, 'debit', _bal, 'credit', 0),
        jsonb_build_object('account_id', _uncl_acct, 'debit', 0,    'credit', _bal)
      ),
      _branch_id   => _acct.branch_id,
      _source_module => 'savings',
      _source_ref  => _account_id,
      _idempotency_key => COALESCE(_idempotency_key, 'savings:unclaimed:' || _account_id::text)
    );
    UPDATE public.savings_account
       SET balance = 0, available_balance = 0
     WHERE id = _account_id;
  END IF;

  PERFORM public.emit_audit(_acct.company_id, 'savings.transferred_to_unclaimed', 'savings_account',
    _account_id, to_jsonb(_acct), NULL,
    jsonb_build_object('amount', _bal, 'entry_id', _entry_id));
  RETURN _account_id;
END $fn$;

REVOKE ALL ON FUNCTION public.transfer_savings_to_unclaimed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_savings_to_unclaimed(uuid, text) TO authenticated;
