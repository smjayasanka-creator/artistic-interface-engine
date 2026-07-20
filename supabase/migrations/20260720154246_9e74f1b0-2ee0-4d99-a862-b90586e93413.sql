
-- ============================================================
-- 1) Expand CHECK constraints to accept the UI's names.
-- ============================================================
ALTER TABLE public.savings_account_holder
  DROP CONSTRAINT IF EXISTS savings_account_holder_role_check;
ALTER TABLE public.savings_account_holder
  ADD  CONSTRAINT savings_account_holder_role_check
  CHECK (role = ANY (ARRAY[
    'primary','joint','guardian','minor','beneficiary','signatory',
    'minor_guardian','trustee','power_of_attorney'
  ]));

ALTER TABLE public.savings_account_mandate
  DROP CONSTRAINT IF EXISTS savings_account_mandate_signing_rule_check;
ALTER TABLE public.savings_account_mandate
  ADD  CONSTRAINT savings_account_mandate_signing_rule_check
  CHECK (signing_rule = ANY (ARRAY[
    'sole','single','any_one','either','all','jointly','any_two','custom'
  ]));

-- ============================================================
-- 2) Atomic account opening
-- ============================================================
CREATE OR REPLACE FUNCTION public.open_savings_account(
  _client_id  uuid,
  _branch_id  uuid,
  _product_id uuid,
  _opening_deposit numeric,
  _channel text DEFAULT 'branch',
  _external_ref text DEFAULT NULL,
  _narration text DEFAULT NULL,
  _statement_preference text DEFAULT NULL,
  _communication_preference text DEFAULT NULL,
  _special_instructions text DEFAULT NULL,
  _holders  jsonb DEFAULT '[]'::jsonb,
  _nominees jsonb DEFAULT '[]'::jsonb,
  _mandate  jsonb DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_cid       uuid;
  v_staff     uuid;
  v_product   RECORD;
  v_acct_no   text;
  v_acct_id   uuid;
  v_opening   numeric := COALESCE(_opening_deposit, 0);
  v_fee       numeric;
  v_open_bal  numeric;
  v_gl_cash   uuid;
  v_gl_liab   uuid;
  v_gl_fee    uuid;
  v_sum       numeric;
  v_holders   jsonb;
  v_existing  uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT public.current_company_id() INTO v_cid;
  IF v_cid IS NULL THEN RAISE EXCEPTION 'No company' USING ERRCODE='42501'; END IF;

  IF NOT public.is_company_admin(v_cid)
     AND NOT public.has_permission(v_uid, 'savings.accounts.open', v_cid)
     AND NOT public.has_permission(v_uid, 'savings.open', v_cid) THEN
    RAISE EXCEPTION 'Missing permission: savings.accounts.open'
      USING ERRCODE='42501';
  END IF;

  -- Idempotency: match on external_ref within company.
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.savings_account
      WHERE company_id = v_cid AND external_ref = _idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN (SELECT to_jsonb(s.*) FROM public.savings_account s WHERE id = v_existing);
    END IF;
  END IF;

  SELECT id INTO v_staff FROM public.staff WHERE user_id = v_uid LIMIT 1;

  SELECT * INTO v_product FROM public.savings_product WHERE id = _product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF v_product.company_id <> v_cid THEN RAISE EXCEPTION 'Product / company mismatch'; END IF;
  IF v_opening < COALESCE(v_product.min_opening_balance, 0) THEN
    RAISE EXCEPTION 'Opening deposit must be at least % %',
      v_product.min_opening_balance, v_product.currency;
  END IF;

  IF jsonb_array_length(COALESCE(_nominees, '[]'::jsonb)) > 0 THEN
    SELECT COALESCE(SUM((e->>'percentage')::numeric), 0) INTO v_sum
      FROM jsonb_array_elements(_nominees) e;
    IF ABS(v_sum - 100) > 0.01 THEN
      RAISE EXCEPTION 'Nominee percentages must sum to 100 (got %)', v_sum;
    END IF;
  END IF;

  v_holders := COALESCE(_holders, '[]'::jsonb);
  IF jsonb_array_length(v_holders) = 0 THEN
    v_holders := jsonb_build_array(
      jsonb_build_object(
        'client_id', _client_id, 'role', 'primary',
        'ownership_pct', 100, 'is_signatory', true, 'signing_order', 1
      )
    );
  END IF;
  SELECT COALESCE(SUM((e->>'ownership_pct')::numeric), 0) INTO v_sum
    FROM jsonb_array_elements(v_holders) e;
  IF ABS(v_sum - 100) > 0.01 THEN
    RAISE EXCEPTION 'Holder ownership must sum to 100%% (got %)', v_sum;
  END IF;

  SELECT public.next_contract_no(v_cid, _branch_id, _product_id, 1) INTO v_acct_no;

  v_fee      := COALESCE(v_product.opening_fee, 0);
  v_open_bal := v_opening - v_fee;

  INSERT INTO public.savings_account (
    company_id, branch_id, product_id, client_id, account_no, currency,
    balance, available_balance, status,
    opened_by, opened_via, approved_by, approved_at,
    statement_preference, communication_preference, special_instructions,
    product_snapshot, external_ref
  ) VALUES (
    v_cid, _branch_id, _product_id, _client_id, v_acct_no, v_product.currency,
    v_open_bal, v_open_bal, 'active',
    v_staff, COALESCE(_channel,'branch'), v_staff, now(),
    _statement_preference, _communication_preference, _special_instructions,
    to_jsonb(v_product), COALESCE(_external_ref, _idempotency_key)
  ) RETURNING id INTO v_acct_id;

  INSERT INTO public.savings_account_holder (
    company_id, account_id, client_id, role, ownership_pct,
    full_name, nic, relation, is_signatory, signing_order
  )
  SELECT v_cid, v_acct_id,
    NULLIF(e->>'client_id','')::uuid,
    COALESCE(e->>'role','primary'),
    COALESCE((e->>'ownership_pct')::numeric, 0),
    e->>'full_name', e->>'nic', e->>'relation',
    COALESCE((e->>'is_signatory')::boolean, true),
    NULLIF(e->>'signing_order','')::int
  FROM jsonb_array_elements(v_holders) e;

  IF jsonb_array_length(COALESCE(_nominees,'[]'::jsonb)) > 0 THEN
    INSERT INTO public.savings_account_nominee (
      company_id, account_id, full_name, nic, relation, percentage, contact
    )
    SELECT v_cid, v_acct_id,
      e->>'full_name', e->>'nic', e->>'relation',
      (e->>'percentage')::numeric, e->>'contact'
    FROM jsonb_array_elements(_nominees) e;
  END IF;

  IF _mandate IS NOT NULL AND _mandate <> 'null'::jsonb THEN
    INSERT INTO public.savings_account_mandate (
      company_id, account_id, signing_rule, min_signatories, rule_details,
      effective_from, active, created_by, approved_by, approved_at
    ) VALUES (
      v_cid, v_acct_id,
      COALESCE(_mandate->>'signing_rule','sole'),
      NULLIF(_mandate->>'min_signatories','')::int,
      _mandate->'rule_details',
      CURRENT_DATE, true, v_staff, v_staff, now()
    );
  END IF;

  IF v_opening > 0 THEN
    INSERT INTO public.savings_transaction (
      company_id, account_id, txn_type, channel, amount, running_balance,
      reference, external_ref, narration, performed_by, idempotency_key
    ) VALUES (
      v_cid, v_acct_id, 'opening'::savings_txn_type,
      COALESCE(_channel,'branch')::savings_channel,
      v_opening, v_opening, 'OPENING-DEPOSIT',
      _external_ref, COALESCE(_narration,'Account opening deposit'),
      v_staff, 'open:deposit:' || v_acct_id::text
    );
  END IF;
  IF v_fee > 0 THEN
    INSERT INTO public.savings_transaction (
      company_id, account_id, txn_type, channel, amount, running_balance,
      reference, narration, performed_by, idempotency_key
    ) VALUES (
      v_cid, v_acct_id, 'fee'::savings_txn_type,
      COALESCE(_channel,'branch')::savings_channel,
      -v_fee, v_open_bal, 'OPENING-FEE',
      'Account opening fee', v_staff,
      'open:fee:' || v_acct_id::text
    );
  END IF;

  v_gl_cash := COALESCE(v_product.cash_account_id,
                        (SELECT id FROM public.gl_account WHERE code='1000' LIMIT 1));
  v_gl_liab := COALESCE(v_product.deposit_liability_account_id,
                        (SELECT id FROM public.gl_account WHERE code='2100' LIMIT 1));
  v_gl_fee  := COALESCE(v_product.fee_income_account_id,
                        (SELECT id FROM public.gl_account WHERE code='4100' LIMIT 1));

  IF v_opening > 0 THEN
    IF v_gl_cash IS NULL OR v_gl_liab IS NULL THEN
      RAISE EXCEPTION 'Savings product missing GL mapping (cash / deposit liability)';
    END IF;
    PERFORM public.post_entry(
      _entry_date := CURRENT_DATE,
      _reference := 'SAV-OPEN-' || v_acct_no,
      _description := 'Savings opening deposit · ' || v_acct_no,
      _lines := jsonb_build_array(
        jsonb_build_object('account_id', v_gl_cash, 'debit', v_opening, 'credit', 0),
        jsonb_build_object('account_id', v_gl_liab, 'debit', 0, 'credit', v_opening)
      ),
      _branch_id := _branch_id,
      _source_module := 'savings',
      _source_ref := v_acct_id,
      _idempotency_key := 'savings:open:' || v_acct_id::text
    );
  END IF;
  IF v_fee > 0 THEN
    IF v_gl_liab IS NULL OR v_gl_fee IS NULL THEN
      RAISE EXCEPTION 'Savings product missing GL mapping (liability / fee income)';
    END IF;
    PERFORM public.post_entry(
      _entry_date := CURRENT_DATE,
      _reference := 'SAV-FEE-' || v_acct_no,
      _description := 'Savings opening fee · ' || v_acct_no,
      _lines := jsonb_build_array(
        jsonb_build_object('account_id', v_gl_liab, 'debit', v_fee, 'credit', 0),
        jsonb_build_object('account_id', v_gl_fee,  'debit', 0, 'credit', v_fee)
      ),
      _branch_id := _branch_id,
      _source_module := 'savings',
      _source_ref := v_acct_id,
      _idempotency_key := 'savings:open-fee:' || v_acct_id::text
    );
  END IF;

  RETURN (SELECT to_jsonb(s.*) FROM public.savings_account s WHERE id = v_acct_id);
END $function$;

REVOKE ALL ON FUNCTION public.open_savings_account(
  uuid,uuid,uuid,numeric,text,text,text,text,text,text,jsonb,jsonb,jsonb,text
) FROM public;
GRANT EXECUTE ON FUNCTION public.open_savings_account(
  uuid,uuid,uuid,numeric,text,text,text,text,text,text,jsonb,jsonb,jsonb,text
) TO authenticated;

-- ============================================================
-- 3) Atomic account closing
-- ============================================================
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
  v_staff    uuid;
  v_acct     RECORD;
  v_product  RECORD;
  v_fee      numeric;
  v_after    numeric;
  v_gl_cash  uuid;
  v_gl_liab  uuid;
  v_gl_fee   uuid;
  v_blocks   int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;

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
    -- Idempotent no-op if already closed.
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
  v_fee  := COALESCE(v_product.closure_fee, 0);
  v_after := Number_or_zero(v_acct.balance) - v_fee;
  -- inline: avoid helper
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
      -v_fee, v_after, 'CLOSURE-FEE', 'Account closure fee',
      (SELECT id FROM public.staff WHERE user_id = v_uid LIMIT 1),
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
      'Final balance payout on closure',
      (SELECT id FROM public.staff WHERE user_id = v_uid LIMIT 1),
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
         closed_by = (SELECT id FROM public.staff WHERE user_id = v_uid LIMIT 1),
         closure_reason = _reason
   WHERE id = _account_id;

  RETURN (SELECT to_jsonb(s.*) FROM public.savings_account s WHERE id = _account_id);
END $function$;

REVOKE ALL ON FUNCTION public.close_savings_account(uuid,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.close_savings_account(uuid,text,text,text,text) TO authenticated;
