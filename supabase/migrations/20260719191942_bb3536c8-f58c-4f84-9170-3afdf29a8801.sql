
-- =====================================================================
-- Atomic + audited loan-application transitions
-- Forward-only migration.
-- =====================================================================

-- 1) Idempotency + workflow-step uniqueness --------------------------------

ALTER TABLE public.loan_application_status_history
  ADD COLUMN IF NOT EXISTS transition_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lash_transition
  ON public.loan_application_status_history(application_id, transition_key)
  WHERE transition_key IS NOT NULL;

ALTER TABLE public.loan_application_approval
  ADD COLUMN IF NOT EXISTS transition_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_laa_transition
  ON public.loan_application_approval(application_id, transition_key)
  WHERE transition_key IS NOT NULL;

-- Same workflow step cannot be decided twice for the same application
CREATE UNIQUE INDEX IF NOT EXISTS uq_laa_workflow_step
  ON public.loan_application_approval(application_id, workflow_instance_id, step_key)
  WHERE workflow_instance_id IS NOT NULL AND step_key IS NOT NULL;

-- 2) Terminal-state guard --------------------------------------------------
CREATE OR REPLACE FUNCTION public.loan_application_terminal_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('rejected'::public.loan_application_status,
                    'cancelled'::public.loan_application_status,
                    'disbursed'::public.loan_application_status) THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.officer_id IS DISTINCT FROM OLD.officer_id
       OR NEW.requested_principal IS DISTINCT FROM OLD.requested_principal
       OR NEW.requested_tenor_months IS DISTINCT FROM OLD.requested_tenor_months
       OR NEW.requested_rate_pct IS DISTINCT FROM OLD.requested_rate_pct
       OR NEW.frequency IS DISTINCT FROM OLD.frequency
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.channel IS DISTINCT FROM OLD.channel
       OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
      RAISE EXCEPTION
        'Application % is in terminal status % and cannot be modified',
        OLD.application_no, OLD.status
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_loan_application_terminal_guard ON public.loan_application;
CREATE TRIGGER trg_loan_application_terminal_guard
  BEFORE UPDATE ON public.loan_application
  FOR EACH ROW EXECUTE FUNCTION public.loan_application_terminal_guard();

-- 3) Permissions catalog ---------------------------------------------------
INSERT INTO public.permission(code, module, label, description, sort_order) VALUES
  ('loans.submit', 'Loans', 'Submit loan application', null, 21),
  ('loans.cancel', 'Loans', 'Cancel loan application', null, 27)
ON CONFLICT (code) DO NOTHING;

-- 4) Common helper: authorize + return snapshot ----------------------------
-- (Inline in each RPC to keep behaviour explicit and traceable.)

-- 5) submit_loan_application ----------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_loan_application(
  _application_id uuid,
  _transition_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _app        public.loan_application%ROWTYPE;
  _uid        uuid := auth.uid();
  _staff_br   uuid;
  _hist_id    uuid;
  _audit_id   uuid;
  _existing   uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501';
  END IF;
  IF _transition_key IS NULL OR length(trim(_transition_key)) = 0 THEN
    RAISE EXCEPTION 'Transition key required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _app FROM public.loan_application
    WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application % not found', _application_id USING ERRCODE='P0002';
  END IF;

  -- Idempotency replay
  SELECT id INTO _existing FROM public.loan_application_status_history
    WHERE application_id = _app.id AND transition_key = _transition_key LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'application_id', _app.id,
      'from_status',    _app.status,
      'to_status',      _app.status,
      'history_id',     _existing,
      'idempotent',     true
    );
  END IF;

  IF NOT (public.is_company_member(_app.company_id)
          OR public.has_role(_uid,'platform_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Cross-company access denied' USING ERRCODE='42501';
  END IF;

  IF NOT (public.has_permission(_uid,'loans.submit')
          OR public.has_permission(_uid,'loans.create')
          OR public.is_company_admin(_app.company_id)
          OR public.has_role(_uid,'platform_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to submit applications' USING ERRCODE='42501';
  END IF;

  -- Branch scope for non-admins
  IF NOT (public.is_company_admin(_app.company_id)
          OR public.has_role(_uid,'platform_admin'::public.app_role)) THEN
    SELECT branch_id INTO _staff_br FROM public.staff WHERE user_id = _uid LIMIT 1;
    IF _staff_br IS NOT NULL AND _staff_br <> _app.branch_id THEN
      RAISE EXCEPTION 'Cross-branch access denied' USING ERRCODE='42501';
    END IF;
  END IF;

  IF _app.status <> 'draft'::public.loan_application_status THEN
    RAISE EXCEPTION 'Cannot submit from status % (only draft)', _app.status USING ERRCODE='22023';
  END IF;

  -- Completeness validation
  IF _app.client_id  IS NULL THEN RAISE EXCEPTION 'Client is required'  USING ERRCODE='23502'; END IF;
  IF _app.product_id IS NULL THEN RAISE EXCEPTION 'Product is required' USING ERRCODE='23502'; END IF;
  IF COALESCE(_app.requested_principal,0)     <= 0 THEN RAISE EXCEPTION 'Principal must be > 0' USING ERRCODE='23514'; END IF;
  IF COALESCE(_app.requested_tenor_months,0)  <= 0 THEN RAISE EXCEPTION 'Tenor must be > 0'     USING ERRCODE='23514'; END IF;
  IF _app.requested_rate_pct IS NULL OR _app.requested_rate_pct <= 0 THEN
    RAISE EXCEPTION 'Interest rate must be > 0' USING ERRCODE='23514';
  END IF;
  IF _app.frequency IS NULL THEN
    RAISE EXCEPTION 'Repayment frequency is required' USING ERRCODE='23502';
  END IF;

  -- At least one applicant row
  IF NOT EXISTS (SELECT 1 FROM public.loan_application_applicant
                  WHERE application_id = _app.id) THEN
    RAISE EXCEPTION 'At least one applicant is required' USING ERRCODE='23514';
  END IF;

  -- Documents / evaluation / collateral: enforce when product declares them.
  -- Fall back to a soft check when the product config columns are absent.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='loan_product'
      AND column_name='requires_documents'
  ) THEN
    IF (SELECT COALESCE(requires_documents,false)
          FROM public.loan_product WHERE id = _app.product_id)
      AND NOT EXISTS (SELECT 1 FROM public.loan_application_document
                       WHERE application_id = _app.id) THEN
      RAISE EXCEPTION 'Required documents missing' USING ERRCODE='23514';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.loan_product_evaluation_section
              WHERE product_id = _app.product_id AND COALESCE(required,false))
     AND NOT EXISTS (SELECT 1 FROM public.loan_application_evaluation
                      WHERE application_id = _app.id) THEN
    RAISE EXCEPTION 'Evaluation not completed' USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='loan_product'
      AND column_name='requires_collateral'
  ) THEN
    IF (SELECT COALESCE(requires_collateral,false)
          FROM public.loan_product WHERE id = _app.product_id)
      AND NOT EXISTS (SELECT 1 FROM public.loan_application_collateral
                       WHERE application_id = _app.id) THEN
      RAISE EXCEPTION 'Collateral information required' USING ERRCODE='23514';
    END IF;
  END IF;

  -- Atomic writes
  UPDATE public.loan_application
     SET status = 'submitted'::public.loan_application_status,
         submitted_at = now(),
         updated_at   = now()
   WHERE id = _app.id;

  INSERT INTO public.loan_application_status_history(
    application_id, application_no, from_status, to_status,
    actor_id, reason, transition_key
  ) VALUES (
    _app.id, _app.application_no,
    _app.status, 'submitted'::public.loan_application_status,
    _uid, 'Submitted for review', _transition_key
  ) RETURNING id INTO _hist_id;

  SELECT public.emit_audit(
    _app.company_id, 'loan_application.submitted',
    'loan_application', _app.id,
    jsonb_build_object('status', _app.status),
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('transition_key', _transition_key)
  ) INTO _audit_id;

  RETURN jsonb_build_object(
    'application_id', _app.id,
    'from_status',    _app.status,
    'to_status',      'submitted',
    'history_id',     _hist_id,
    'audit_id',       _audit_id,
    'idempotent',     false
  );
END $fn$;

REVOKE ALL ON FUNCTION public.submit_loan_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_loan_application(uuid, text) TO authenticated;

-- 6) return_loan_application (under_review -> draft) -----------------------
CREATE OR REPLACE FUNCTION public.return_loan_application(
  _application_id uuid,
  _reason text,
  _transition_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _app       public.loan_application%ROWTYPE;
  _uid       uuid := auth.uid();
  _hist_id   uuid;
  _audit_id  uuid;
  _existing  uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
  IF _transition_key IS NULL OR length(trim(_transition_key))=0 THEN
    RAISE EXCEPTION 'Transition key required' USING ERRCODE='22023';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'A return reason (>=3 chars) is required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _app FROM public.loan_application
    WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application % not found', _application_id USING ERRCODE='P0002'; END IF;

  SELECT id INTO _existing FROM public.loan_application_status_history
    WHERE application_id = _app.id AND transition_key = _transition_key LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('application_id', _app.id, 'from_status', _app.status,
                              'to_status', _app.status, 'history_id', _existing,
                              'idempotent', true);
  END IF;

  IF NOT (public.is_company_member(_app.company_id)
          OR public.has_role(_uid,'platform_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Cross-company access denied' USING ERRCODE='42501';
  END IF;

  IF NOT (public.has_permission(_uid,'loans.approve')
          OR public.is_company_admin(_app.company_id)
          OR public.has_role(_uid,'platform_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to return applications' USING ERRCODE='42501';
  END IF;

  IF _app.status <> 'under_review'::public.loan_application_status THEN
    RAISE EXCEPTION 'Cannot return from status % (only under_review)', _app.status
      USING ERRCODE='22023';
  END IF;

  UPDATE public.loan_application
     SET status='draft'::public.loan_application_status,
         updated_at=now()
   WHERE id=_app.id;

  INSERT INTO public.loan_application_status_history(
    application_id, application_no, from_status, to_status,
    actor_id, reason, transition_key
  ) VALUES (
    _app.id, _app.application_no,
    _app.status, 'draft'::public.loan_application_status,
    _uid, _reason, _transition_key
  ) RETURNING id INTO _hist_id;

  SELECT public.emit_audit(
    _app.company_id, 'loan_application.returned',
    'loan_application', _app.id,
    jsonb_build_object('status', _app.status),
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('reason', _reason, 'transition_key', _transition_key)
  ) INTO _audit_id;

  RETURN jsonb_build_object(
    'application_id', _app.id, 'from_status', _app.status,
    'to_status', 'draft', 'history_id', _hist_id, 'audit_id', _audit_id,
    'idempotent', false
  );
END $fn$;

REVOKE ALL ON FUNCTION public.return_loan_application(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_loan_application(uuid, text, text) TO authenticated;

-- 7) cancel_loan_application ----------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_loan_application(
  _application_id uuid,
  _reason text,
  _transition_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _app       public.loan_application%ROWTYPE;
  _uid       uuid := auth.uid();
  _hist_id   uuid;
  _audit_id  uuid;
  _existing  uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
  IF _transition_key IS NULL OR length(trim(_transition_key))=0 THEN
    RAISE EXCEPTION 'Transition key required' USING ERRCODE='22023';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'A cancellation reason (>=3 chars) is required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _app FROM public.loan_application
    WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application % not found', _application_id USING ERRCODE='P0002'; END IF;

  SELECT id INTO _existing FROM public.loan_application_status_history
    WHERE application_id = _app.id AND transition_key = _transition_key LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('application_id', _app.id, 'from_status', _app.status,
                              'to_status', _app.status, 'history_id', _existing,
                              'idempotent', true);
  END IF;

  IF NOT (public.is_company_member(_app.company_id)
          OR public.has_role(_uid,'platform_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Cross-company access denied' USING ERRCODE='42501';
  END IF;

  IF NOT (public.has_permission(_uid,'loans.cancel')
          OR public.has_permission(_uid,'loans.approve')
          OR public.is_company_admin(_app.company_id)
          OR public.has_role(_uid,'platform_admin'::public.app_role)
          OR (_app.status = 'draft'::public.loan_application_status
              AND _app.created_by = _uid)) THEN
    RAISE EXCEPTION 'Not authorized to cancel this application' USING ERRCODE='42501';
  END IF;

  IF _app.status = 'disbursed'::public.loan_application_status THEN
    RAISE EXCEPTION 'A disbursed application cannot be cancelled' USING ERRCODE='42501';
  END IF;

  IF _app.status NOT IN (
    'draft'::public.loan_application_status,
    'submitted'::public.loan_application_status
  ) THEN
    RAISE EXCEPTION 'Cannot cancel from status % (only draft or submitted)', _app.status
      USING ERRCODE='22023';
  END IF;

  -- submitted->cancelled only allowed by an approver / company admin
  IF _app.status = 'submitted'::public.loan_application_status
     AND NOT (public.has_permission(_uid,'loans.approve')
              OR public.is_company_admin(_app.company_id)
              OR public.has_role(_uid,'platform_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only an approver may cancel a submitted application' USING ERRCODE='42501';
  END IF;

  UPDATE public.loan_application
     SET status='cancelled'::public.loan_application_status,
         updated_at=now()
   WHERE id=_app.id;

  INSERT INTO public.loan_application_status_history(
    application_id, application_no, from_status, to_status,
    actor_id, reason, transition_key
  ) VALUES (
    _app.id, _app.application_no,
    _app.status, 'cancelled'::public.loan_application_status,
    _uid, _reason, _transition_key
  ) RETURNING id INTO _hist_id;

  SELECT public.emit_audit(
    _app.company_id, 'loan_application.cancelled',
    'loan_application', _app.id,
    jsonb_build_object('status', _app.status),
    jsonb_build_object('status', 'cancelled'),
    jsonb_build_object('reason', _reason, 'transition_key', _transition_key)
  ) INTO _audit_id;

  RETURN jsonb_build_object(
    'application_id', _app.id, 'from_status', _app.status,
    'to_status', 'cancelled', 'history_id', _hist_id, 'audit_id', _audit_id,
    'idempotent', false
  );
END $fn$;

REVOKE ALL ON FUNCTION public.cancel_loan_application(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_loan_application(uuid, text, text) TO authenticated;

-- 8) decide_loan_application v2 (adds transition_key + structured result) --
DROP FUNCTION IF EXISTS public.decide_loan_application(uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.decide_loan_application(uuid, text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.decide_loan_application(
  _application_id uuid,
  _decision text,
  _comment text DEFAULT NULL,
  _step_key text DEFAULT NULL,
  _workflow_instance_id uuid DEFAULT NULL,
  _transition_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _app        public.loan_application%ROWTYPE;
  _next       public.loan_application_status;
  _uid        uuid := auth.uid();
  _decision_id uuid;
  _hist_id     uuid;
  _audit_id    uuid;
  _existing_h  uuid;
  _existing_d  uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;

  IF _decision NOT IN ('approve','reject','return') THEN
    RAISE EXCEPTION 'Invalid decision: %', _decision USING ERRCODE='22023';
  END IF;

  IF _decision = 'return' THEN
    IF _comment IS NULL OR length(trim(_comment)) < 3 THEN
      RAISE EXCEPTION 'A comment is required to return an application' USING ERRCODE='22023';
    END IF;
  END IF;

  SELECT * INTO _app FROM public.loan_application
    WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application % not found', _application_id USING ERRCODE='P0002'; END IF;

  -- Idempotent replay: same transition key already recorded
  IF _transition_key IS NOT NULL THEN
    SELECT id INTO _existing_h FROM public.loan_application_status_history
      WHERE application_id = _app.id AND transition_key = _transition_key LIMIT 1;
    SELECT id INTO _existing_d FROM public.loan_application_approval
      WHERE application_id = _app.id AND transition_key = _transition_key LIMIT 1;
    IF _existing_h IS NOT NULL OR _existing_d IS NOT NULL THEN
      RETURN jsonb_build_object(
        'application_id', _app.id,
        'from_status',    _app.status,
        'to_status',      _app.status,
        'history_id',     _existing_h,
        'decision_id',    _existing_d,
        'idempotent',     true
      );
    END IF;
  END IF;

  IF NOT (public.is_company_member(_app.company_id)
          OR public.has_role(_uid,'platform_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Cross-company access denied' USING ERRCODE='42501';
  END IF;

  IF NOT (public.has_permission(_uid,'loans.approve')
          OR public.is_company_admin(_app.company_id)
          OR public.has_role(_uid,'platform_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to decide applications' USING ERRCODE='42501';
  END IF;

  IF _decision IN ('approve','reject')
     AND _app.created_by IS NOT NULL AND _app.created_by = _uid
     AND NOT public.has_role(_uid,'platform_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Segregation of duties: creator cannot decide own application'
      USING ERRCODE='42501';
  END IF;

  IF _app.status NOT IN ('submitted'::public.loan_application_status,
                         'under_review'::public.loan_application_status) THEN
    RAISE EXCEPTION 'Cannot decide from status %', _app.status USING ERRCODE='22023';
  END IF;

  _next := CASE _decision
             WHEN 'approve' THEN 'approved'::public.loan_application_status
             WHEN 'reject'  THEN 'rejected'::public.loan_application_status
             WHEN 'return'  THEN 'draft'::public.loan_application_status
           END;

  -- Insert decision. Unique index (application_id, workflow_instance_id, step_key)
  -- guarantees the same workflow step cannot be decided twice.
  INSERT INTO public.loan_application_approval(
    application_id, application_no, workflow_instance_id, step_key,
    decision, decided_by, comment, transition_key
  ) VALUES (
    _app.id, _app.application_no, _workflow_instance_id, _step_key,
    _decision, _uid, _comment, _transition_key
  ) RETURNING id INTO _decision_id;

  UPDATE public.loan_application
     SET status = _next,
         decided_at = CASE WHEN _next IN ('approved','rejected') THEN now() ELSE decided_at END,
         updated_at = now()
   WHERE id = _app.id;

  INSERT INTO public.loan_application_status_history(
    application_id, application_no, from_status, to_status,
    actor_id, reason, transition_key
  ) VALUES (
    _app.id, _app.application_no, _app.status, _next, _uid, _comment, _transition_key
  ) RETURNING id INTO _hist_id;

  SELECT public.emit_audit(
    _app.company_id, 'loan_application.'||_decision,
    'loan_application', _app.id,
    jsonb_build_object('status', _app.status),
    jsonb_build_object('status', _next),
    jsonb_build_object(
      'decision', _decision, 'comment', _comment,
      'step_key', _step_key, 'workflow_instance_id', _workflow_instance_id,
      'transition_key', _transition_key
    )
  ) INTO _audit_id;

  RETURN jsonb_build_object(
    'application_id', _app.id,
    'from_status',    _app.status,
    'to_status',      _next,
    'history_id',     _hist_id,
    'decision_id',    _decision_id,
    'audit_id',       _audit_id,
    'idempotent',     false
  );
END $fn$;

REVOKE ALL ON FUNCTION public.decide_loan_application(uuid, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_loan_application(uuid, text, text, text, uuid, text) TO authenticated;
