
ALTER TABLE public.savings_hold
  ADD COLUMN IF NOT EXISTS release_requested_by uuid,
  ADD COLUMN IF NOT EXISTS release_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_requested_reason text,
  ADD COLUMN IF NOT EXISTS release_workflow_instance_id uuid,
  ADD COLUMN IF NOT EXISTS release_status text NOT NULL DEFAULT 'none';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'savings_hold_release_status_chk'
  ) THEN
    ALTER TABLE public.savings_hold
      ADD CONSTRAINT savings_hold_release_status_chk
      CHECK (release_status IN ('none','pending','approved','rejected'));
  END IF;
END $$;

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
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.savings_hold
     SET release_requested_by = v_uid,
         release_requested_at = now(),
         release_requested_reason = _reason,
         release_workflow_instance_id = _instance_id,
         release_status = 'pending'
   WHERE id = _hold_id
     AND active = true
     AND release_status IN ('none','rejected');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hold not eligible for release';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.request_savings_hold_release(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_savings_hold_release(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_savings_hold_release(
  _instance_id uuid,
  _decision text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  IF _decision = 'approved' THEN
    UPDATE public.savings_hold
       SET active = false,
           released_at = now(),
           release_status = 'approved'
     WHERE release_workflow_instance_id = _instance_id
       AND release_status = 'pending';
  ELSE
    UPDATE public.savings_hold
       SET release_status = 'rejected'
     WHERE release_workflow_instance_id = _instance_id
       AND release_status = 'pending';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_savings_hold_release(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_savings_hold_release(uuid, text) TO authenticated;

-- Seed a default workflow for each company that lacks one.
DO $$
DECLARE
  r RECORD;
  v_wf uuid;
BEGIN
  FOR r IN
    SELECT c.id AS company_id
      FROM public.company c
     WHERE NOT EXISTS (
       SELECT 1 FROM public.workflow_definition wd
        WHERE wd.company_id = c.id
          AND wd.transaction_type = 'savings_hold_release'
     )
  LOOP
    INSERT INTO public.workflow_definition (company_id, name, transaction_type, is_enabled)
    VALUES (r.company_id, 'Savings hold release — Manager approval', 'savings_hold_release', true)
    RETURNING id INTO v_wf;

    INSERT INTO public.workflow_step (workflow_id, step_order, approver_kind, role, required_approvals)
    VALUES (v_wf, 1, 'role', 'branch_manager', 1);
  END LOOP;
END $$;
