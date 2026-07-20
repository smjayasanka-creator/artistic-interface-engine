
-- Phase 4: Savings holds with workflow-linked release
ALTER TABLE public.savings_hold
  ADD COLUMN IF NOT EXISTS release_requested_by uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS release_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_requested_reason text,
  ADD COLUMN IF NOT EXISTS release_workflow_instance_id uuid REFERENCES public.workflow_instance(id),
  ADD COLUMN IF NOT EXISTS release_status text NOT NULL DEFAULT 'none'
    CHECK (release_status IN ('none','pending','approved','rejected'));

-- Register the workflow transaction type for hold release (idempotent)
INSERT INTO public.workflow_definition (company_id, name, transaction_type, description, is_enabled)
SELECT c.id, 'Savings Hold Release (default)', 'savings_hold_release',
       'Approval workflow for releasing savings account holds/blocks', true
FROM public.company c
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_definition w
  WHERE w.company_id = c.id AND w.transaction_type = 'savings_hold_release'
);

-- Insert a single default step for each newly created definition
INSERT INTO public.workflow_step (workflow_id, step_order, name, approver_kind, role, required_approvals, sla_action)
SELECT w.id, 1, 'Manager approval', 'role', 'branch_manager', 1, 'flag'
FROM public.workflow_definition w
WHERE w.transaction_type = 'savings_hold_release'
  AND NOT EXISTS (SELECT 1 FROM public.workflow_step s WHERE s.workflow_id = w.id);

-- RPC: request release (sets release_status = pending; workflow instance id set by caller)
CREATE OR REPLACE FUNCTION public.request_savings_hold_release(
  _hold_id uuid,
  _instance_id uuid,
  _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_staff uuid;
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.savings_hold WHERE id = _hold_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'hold not found'; END IF;
  IF NOT (public.is_company_admin(v_company)
          OR public.has_permission(v_uid,'savings.block.release',v_company)) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;
  SELECT id INTO v_staff FROM public.staff WHERE user_id = v_uid AND company_id = v_company LIMIT 1;

  UPDATE public.savings_hold
     SET release_status = 'pending',
         release_requested_by = v_staff,
         release_requested_at = now(),
         release_requested_reason = _reason,
         release_workflow_instance_id = _instance_id
   WHERE id = _hold_id
     AND active = true
     AND release_status IN ('none','rejected');
  IF NOT FOUND THEN RAISE EXCEPTION 'hold not eligible for release request'; END IF;
END;$$;

REVOKE ALL ON FUNCTION public.request_savings_hold_release(uuid,uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_savings_hold_release(uuid,uuid,text) TO authenticated;

-- RPC: finalise release after workflow completion (called by workflow engine)
CREATE OR REPLACE FUNCTION public.finalize_savings_hold_release(
  _instance_id uuid,
  _decision text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hold_id uuid;
  v_company uuid;
  v_staff uuid;
BEGIN
  SELECT id, company_id INTO v_hold_id, v_company
    FROM public.savings_hold
   WHERE release_workflow_instance_id = _instance_id
   FOR UPDATE;
  IF v_hold_id IS NULL THEN RETURN; END IF;
  SELECT id INTO v_staff FROM public.staff WHERE user_id = v_uid AND company_id = v_company LIMIT 1;

  IF _decision = 'approved' THEN
    UPDATE public.savings_hold
       SET active = false,
           release_status = 'approved',
           released_by = v_staff,
           released_at = now()
     WHERE id = v_hold_id;
  ELSE
    UPDATE public.savings_hold
       SET release_status = 'rejected'
     WHERE id = v_hold_id;
  END IF;
END;$$;

REVOKE ALL ON FUNCTION public.finalize_savings_hold_release(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_savings_hold_release(uuid,text) TO authenticated;
