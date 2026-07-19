
-- 1) Restrict direct writes to approval & status-history tables to privileged roles only.
--    Reads remain company-scoped.

DROP POLICY IF EXISTS "loan_application_approval company insert" ON public.loan_application_approval;
DROP POLICY IF EXISTS "loan_application_approval company update" ON public.loan_application_approval;
DROP POLICY IF EXISTS "loan_application_approval company delete" ON public.loan_application_approval;

DROP POLICY IF EXISTS "loan_application_status_history company insert" ON public.loan_application_status_history;
DROP POLICY IF EXISTS "loan_application_status_history company update" ON public.loan_application_status_history;
DROP POLICY IF EXISTS "loan_application_status_history company delete" ON public.loan_application_status_history;

CREATE POLICY "loan_application_approval privileged insert"
  ON public.loan_application_approval FOR INSERT TO authenticated
  WITH CHECK (
    public._app_row_company_ok(application_id) AND (
      public.has_permission(auth.uid(), 'loans.approve')
      OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.loan_application a
         WHERE a.id = application_id AND public.is_company_admin(a.company_id)
      )
    )
  );

CREATE POLICY "loan_application_status_history privileged insert"
  ON public.loan_application_status_history FOR INSERT TO authenticated
  WITH CHECK (
    public._app_row_company_ok(application_id) AND (
      public.has_permission(auth.uid(), 'loans.approve')
      OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.loan_application a
         WHERE a.id = application_id AND public.is_company_admin(a.company_id)
      )
    )
  );

-- No UPDATE/DELETE policies -> denied by default for authenticated (append-only trail).

-- 2) Atomic decision RPC.
CREATE OR REPLACE FUNCTION public.decide_loan_application(
  _application_id uuid,
  _decision text,
  _comment text DEFAULT NULL,
  _step_key text DEFAULT NULL,
  _workflow_instance_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _app       public.loan_application%ROWTYPE;
  _next      public.loan_application_status;
  _uid       uuid := auth.uid();
  _authorized boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF _decision NOT IN ('approve','reject','return') THEN
    RAISE EXCEPTION 'Invalid decision: %', _decision USING ERRCODE = '22023';
  END IF;

  -- Lock the row
  SELECT * INTO _app FROM public.loan_application
    WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application % not found', _application_id USING ERRCODE = 'P0002';
  END IF;

  -- Company membership
  IF NOT (public.is_company_member(_app.company_id)
          OR public.has_role(_uid, 'platform_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Forbidden: not a member of this company' USING ERRCODE = '42501';
  END IF;

  -- Authorization: loans.approve permission, company admin, or platform admin
  _authorized := public.has_permission(_uid, 'loans.approve')
              OR public.is_company_admin(_app.company_id)
              OR public.has_role(_uid, 'platform_admin'::public.app_role);
  IF NOT _authorized THEN
    RAISE EXCEPTION 'Forbidden: missing loans.approve permission' USING ERRCODE = '42501';
  END IF;

  -- SoD: creator cannot approve/reject own application (return is allowed)
  IF _decision IN ('approve','reject')
     AND _app.created_by IS NOT NULL
     AND _app.created_by = _uid
     AND NOT public.has_role(_uid, 'platform_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Segregation of duties: creator cannot decide own application' USING ERRCODE = '42501';
  END IF;

  -- Valid workflow statuses: submitted, under_review
  IF _app.status NOT IN ('submitted'::public.loan_application_status,
                         'under_review'::public.loan_application_status) THEN
    RAISE EXCEPTION 'Invalid status transition from % via %', _app.status, _decision
      USING ERRCODE = '22023';
  END IF;

  _next := CASE _decision
             WHEN 'approve' THEN 'approved'::public.loan_application_status
             WHEN 'reject'  THEN 'rejected'::public.loan_application_status
             ELSE                'under_review'::public.loan_application_status
           END;

  -- Insert approval trail
  INSERT INTO public.loan_application_approval(
    application_id, application_no, workflow_instance_id, step_key,
    decision, decided_by, comment
  ) VALUES (
    _app.id, _app.application_no, _workflow_instance_id, _step_key,
    _decision, _uid, _comment
  );

  -- Update master status
  UPDATE public.loan_application
     SET status = _next,
         decided_at = CASE WHEN _next IN ('approved','rejected') THEN now() ELSE decided_at END,
         updated_at = now()
   WHERE id = _app.id;

  -- Status history
  INSERT INTO public.loan_application_status_history(
    application_id, application_no, from_status, to_status, actor_id, reason
  ) VALUES (
    _app.id, _app.application_no, _app.status, _next, _uid, _comment
  );

  -- Audit
  PERFORM public.emit_audit(
    _app.company_id, 'loan_application.decision', 'loan_application', _app.id,
    jsonb_build_object('status', _app.status),
    jsonb_build_object('status', _next),
    jsonb_build_object(
      'decision', _decision,
      'comment', _comment,
      'step_key', _step_key,
      'workflow_instance_id', _workflow_instance_id
    )
  );

  RETURN jsonb_build_object('ok', true, 'status', _next);
END $fn$;

REVOKE ALL ON FUNCTION public.decide_loan_application(uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_loan_application(uuid, text, text, text, uuid) TO authenticated;
