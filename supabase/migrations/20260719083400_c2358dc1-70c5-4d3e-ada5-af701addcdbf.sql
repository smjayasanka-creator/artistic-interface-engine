CREATE OR REPLACE FUNCTION public.eod_approve_and_run(_run_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _r public.eod_run%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.eod_run WHERE id=_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run % not found', _run_id; END IF;
  IF NOT (public.is_company_member(_r.company_id) OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT (public.has_permission(auth.uid(),'eod.approve') OR public.is_company_admin(_r.company_id) OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Missing permission eod.approve';
  END IF;
  IF _r.status = 'in_progress' OR _r.status = 'completed' THEN
    RETURN; -- idempotent
  END IF;
  IF _r.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Run not pending_approval (status=%)', _r.status;
  END IF;
  -- Dual control: initiator ≠ approver, EXCEPT for company admins / platform admins
  -- (needed for company-wide manual runs and scheduled auto day-end).
  IF _r.initiated_by = auth.uid()
     AND NOT public.is_company_admin(_r.company_id)
     AND NOT public.has_role(auth.uid(),'platform_admin') THEN
    RAISE EXCEPTION 'Dual control: approver must differ from initiator';
  END IF;

  UPDATE public.eod_run
     SET status='in_progress', approved_by=auth.uid(), approved_at=now(), started_at=now()
   WHERE id=_run_id;

  PERFORM public.emit_audit(_r.company_id, 'eod.approved', 'eod_run', _run_id, NULL, NULL,
    jsonb_build_object('branch_id', _r.branch_id, 'business_date', _r.business_date));
END $function$;