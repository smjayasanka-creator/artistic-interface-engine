
-- 1. New status value for the approval stage.
ALTER TYPE public.savings_account_status ADD VALUE IF NOT EXISTS 'pending_approval';

-- 2. Columns for held-until-funded opening intent + workflow linkage.
ALTER TABLE public.savings_account
  ADD COLUMN IF NOT EXISTS pending_opening_deposit numeric,
  ADD COLUMN IF NOT EXISTS pending_payment_method  text,
  ADD COLUMN IF NOT EXISTS pending_payment_details jsonb,
  ADD COLUMN IF NOT EXISTS opening_workflow_instance_id uuid
    REFERENCES public.workflow_instance(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.staff(id) ON DELETE SET NULL;

-- 3. submit_savings_account_opening — create shell account + start workflow.
CREATE OR REPLACE FUNCTION public.submit_savings_account_opening(
  _client_id uuid,
  _branch_id uuid,
  _product_id uuid,
  _opening_deposit numeric,
  _payment_method text DEFAULT NULL,
  _payment_details jsonb DEFAULT NULL,
  _channel text DEFAULT 'branch',
  _external_ref text DEFAULT NULL,
  _narration text DEFAULT NULL,
  _statement_preference text DEFAULT NULL,
  _communication_preference text DEFAULT NULL,
  _special_instructions text DEFAULT NULL,
  _holders jsonb DEFAULT '[]'::jsonb,
  _nominees jsonb DEFAULT '[]'::jsonb,
  _mandate jsonb DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_cid       uuid;
  v_staff     uuid;
  v_product   RECORD;
  v_acct_no   text;
  v_acct_id   uuid;
  v_holders   jsonb;
  v_sum       numeric;
  v_existing  uuid;
  v_wf_id     uuid;
  v_inst_id   uuid;
  v_status    text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT public.current_company_id() INTO v_cid;
  IF v_cid IS NULL THEN RAISE EXCEPTION 'No company' USING ERRCODE='42501'; END IF;

  IF NOT public.is_company_admin(v_cid)
     AND NOT public.has_permission(v_uid, 'savings.accounts.open', v_cid)
     AND NOT public.has_permission(v_uid, 'savings.open', v_cid) THEN
    RAISE EXCEPTION 'Missing permission: savings.accounts.open' USING ERRCODE='42501';
  END IF;

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
  IF COALESCE(_opening_deposit, 0) < COALESCE(v_product.min_opening_balance, 0) THEN
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

  SELECT id INTO v_wf_id
    FROM public.workflow_definition
    WHERE company_id = v_cid
      AND transaction_type = 'savings_account_opening'
      AND is_enabled = true
    LIMIT 1;

  -- Use dynamic cast so the migration works even though the enum value
  -- was created in the same transaction.
  v_status := CASE WHEN v_wf_id IS NOT NULL THEN 'pending_approval' ELSE 'pending_funding' END;

  SELECT public.next_contract_no(v_cid, _branch_id, _product_id, 1) INTO v_acct_no;

  EXECUTE format($ins$
    INSERT INTO public.savings_account (
      company_id, branch_id, product_id, client_id, account_no, currency,
      balance, available_balance, status,
      opened_by, opened_via,
      statement_preference, communication_preference, special_instructions,
      product_snapshot, external_ref,
      pending_opening_deposit, pending_payment_method, pending_payment_details,
      submitted_at, submitted_by
    ) VALUES (
      $1,$2,$3,$4,$5,$6,
      0, 0, %L::public.savings_account_status,
      $7, COALESCE($8,'branch'),
      $9,$10,$11,
      $12, COALESCE($13,$14),
      COALESCE($15,0), $16, $17,
      now(), $7
    ) RETURNING id
  $ins$, v_status)
  INTO v_acct_id
  USING
    v_cid, _branch_id, _product_id, _client_id, v_acct_no, v_product.currency,
    v_staff, _channel,
    _statement_preference, _communication_preference, _special_instructions,
    to_jsonb(v_product), _external_ref, _idempotency_key,
    _opening_deposit, _payment_method, _payment_details;

  INSERT INTO public.savings_account_holder (
    company_id, account_id, client_id, role, ownership_pct,
    full_name, nic, relation, is_signatory, signing_order
  )
  SELECT v_cid, v_acct_id,
    NULLIF(e->>'client_id','')::uuid,
    COALESCE(e->>'role','primary'),
    COALESCE((e->>'ownership_pct')::numeric, 0),
    e->>'full_name', e->>'nic', e->>'relation',
    COALESCE((e->>'is_signatory')::boolean, false),
    NULLIF(e->>'signing_order','')::int
  FROM jsonb_array_elements(v_holders) e;

  IF jsonb_array_length(COALESCE(_nominees,'[]'::jsonb)) > 0 THEN
    INSERT INTO public.savings_account_nominee (
      company_id, account_id, full_name, nic, relation, percentage, contact
    )
    SELECT v_cid, v_acct_id,
      e->>'full_name', e->>'nic', e->>'relation',
      COALESCE((e->>'percentage')::numeric, 0), e->>'contact'
    FROM jsonb_array_elements(_nominees) e;
  END IF;

  IF _mandate IS NOT NULL AND _mandate <> 'null'::jsonb THEN
    INSERT INTO public.savings_account_mandate (
      company_id, account_id, signing_rule, min_signatories, rule_details,
      effective_from, active, created_by
    ) VALUES (
      v_cid, v_acct_id,
      COALESCE(_mandate->>'signing_rule','single'),
      NULLIF(_mandate->>'min_signatories','')::int,
      _mandate->'rule_details',
      CURRENT_DATE, true, v_staff
    );
  END IF;

  IF v_wf_id IS NOT NULL THEN
    INSERT INTO public.workflow_instance (
      workflow_id, company_id, transaction_type, reference_id, reference_label,
      amount, initiated_by, current_step
    ) VALUES (
      v_wf_id, v_cid, 'savings_account_opening', v_acct_id,
      'Open savings ' || v_acct_no,
      COALESCE(_opening_deposit, 0), v_uid, 1
    ) RETURNING id INTO v_inst_id;

    UPDATE public.savings_account
       SET opening_workflow_instance_id = v_inst_id
     WHERE id = v_acct_id;
  END IF;

  RETURN (SELECT to_jsonb(s.*) FROM public.savings_account s WHERE id = v_acct_id);
END
$fn$;

GRANT EXECUTE ON FUNCTION public.submit_savings_account_opening(
  uuid, uuid, uuid, numeric, text, jsonb, text, text, text,
  text, text, text, jsonb, jsonb, jsonb, text
) TO authenticated;

-- 4. Finalize hook — called from workflow.actOnInstance for savings_account_opening.
CREATE OR REPLACE FUNCTION public.finalize_savings_account_opening(
  _instance_id uuid,
  _decision text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acct_id uuid;
BEGIN
  SELECT reference_id INTO v_acct_id
    FROM public.workflow_instance
    WHERE id = _instance_id
      AND transaction_type = 'savings_account_opening';
  IF v_acct_id IS NULL THEN RETURN; END IF;

  IF _decision = 'approved' THEN
    UPDATE public.savings_account
       SET status = 'pending_funding',
           approved_at = now()
     WHERE id = v_acct_id
       AND status::text = 'pending_approval';
  ELSIF _decision = 'rejected' THEN
    UPDATE public.savings_account
       SET status = 'closed',
           closed_on = CURRENT_DATE,
           closure_reason = COALESCE(closure_reason, 'Opening rejected via workflow')
     WHERE id = v_acct_id
       AND status::text = 'pending_approval';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.finalize_savings_account_opening(uuid, text) TO authenticated;
