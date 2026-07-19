
ALTER TABLE public.workflow_instance
  ADD COLUMN IF NOT EXISTS chain_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_wfinst_chain_snapshot
  ON public.workflow_instance ((chain_snapshot IS NOT NULL));

-- Server-side helper: build a workflow instance from a resolved delegation chain.
-- Requires the caller to be an authenticated company member (loans belong to a branch, RLS on loan enforces).
CREATE OR REPLACE FUNCTION public.start_dynamic_loan_workflow(_loan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _company_id uuid;
  _loan record;
  _resolved jsonb;
  _steps jsonb;
  _rule_id uuid;
  _wf_id uuid;
  _label text;
  _instance_id uuid;
BEGIN
  SELECT l.id, l.principal, l.contract_no, b.company_id AS c_id
    INTO _loan
    FROM public.loan l
    JOIN public.branch b ON b.id = l.branch_id
   WHERE l.id = _loan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan % not found', _loan_id; END IF;
  _company_id := _loan.c_id;

  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;

  _resolved := public.resolve_loan_approval_chain(_loan_id);
  _steps    := COALESCE(_resolved->'steps','[]'::jsonb);
  _rule_id  := NULLIF(_resolved->>'rule_id','')::uuid;

  IF _rule_id IS NULL OR jsonb_array_length(_steps) = 0 THEN
    RETURN jsonb_build_object('fallback', true, 'reason', 'no_matching_rule');
  END IF;

  -- Reuse the company's loan_approval workflow_definition as the anchor row
  -- (workflow_id is NOT NULL). Create a disabled placeholder if none exists.
  SELECT id INTO _wf_id
    FROM public.workflow_definition
   WHERE company_id = _company_id AND transaction_type = 'loan_approval'
   LIMIT 1;
  IF _wf_id IS NULL THEN
    INSERT INTO public.workflow_definition(company_id, name, transaction_type, description, is_enabled)
    VALUES (_company_id, 'Loan approval (dynamic)', 'loan_approval',
            'Placeholder for dynamic delegation chains', false)
    RETURNING id INTO _wf_id;
  END IF;

  _label := 'Loan ' || COALESCE(_loan.contract_no, substr(_loan_id::text,1,8));

  INSERT INTO public.workflow_instance(
    workflow_id, company_id, transaction_type, reference_id, reference_label,
    amount, initiated_by, current_step, applied_rule_id, chain_snapshot
  ) VALUES (
    _wf_id, _company_id, 'loan_approval', _loan_id, _label,
    _loan.principal, auth.uid(), 1, _rule_id, _steps
  )
  RETURNING id INTO _instance_id;

  RETURN jsonb_build_object(
    'ok', true,
    'instance_id', _instance_id,
    'applied_rule_id', _rule_id,
    'steps', _steps
  );
END $$;

GRANT EXECUTE ON FUNCTION public.start_dynamic_loan_workflow(uuid) TO authenticated;
