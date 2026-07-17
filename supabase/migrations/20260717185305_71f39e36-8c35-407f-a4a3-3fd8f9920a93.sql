
-- 1. Extend eod_run --------------------------------------------------------
ALTER TABLE public.eod_run DROP CONSTRAINT IF EXISTS eod_run_status_check;

ALTER TABLE public.eod_run
  ADD COLUMN IF NOT EXISTS initiated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS initiated_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by  uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS steps        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS warnings     jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pre_check    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reports      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.eod_run
  ADD CONSTRAINT eod_run_status_check
  CHECK (status = ANY (ARRAY['pending_approval','in_progress','completed','failed','closed','reopened']));

DROP POLICY IF EXISTS "Members update own eod_run" ON public.eod_run;
CREATE POLICY "Members update own eod_run" ON public.eod_run
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

DROP POLICY IF EXISTS "Members insert own eod_run" ON public.eod_run;
CREATE POLICY "Members insert own eod_run" ON public.eod_run
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));

-- 2. branch.auto_eod flag --------------------------------------------------
ALTER TABLE public.branch
  ADD COLUMN IF NOT EXISTS auto_eod boolean NOT NULL DEFAULT false;

-- 3. eod_step_log ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eod_step_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid NOT NULL REFERENCES public.eod_run(id) ON DELETE CASCADE,
  step_key     text NOT NULL,
  status       text NOT NULL CHECK (status IN ('processing','completed','failed','skipped')),
  actor_user_id uuid,
  started_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz,
  duration_ms  integer,
  metrics      jsonb NOT NULL DEFAULT '{}'::jsonb,
  error        text
);

GRANT SELECT, INSERT ON public.eod_step_log TO authenticated;
GRANT ALL ON public.eod_step_log TO service_role;

ALTER TABLE public.eod_step_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read step log" ON public.eod_step_log;
CREATE POLICY "Members read step log" ON public.eod_step_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.eod_run r
    WHERE r.id = eod_step_log.run_id AND public.is_company_member(r.company_id)
  ));

DROP POLICY IF EXISTS "Members insert step log" ON public.eod_step_log;
CREATE POLICY "Members insert step log" ON public.eod_step_log
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.eod_run r
    WHERE r.id = eod_step_log.run_id AND public.is_company_member(r.company_id)
  ));

CREATE INDEX IF NOT EXISTS eod_step_log_run_idx ON public.eod_step_log(run_id, started_at);

-- 4. Permissions -----------------------------------------------------------
INSERT INTO public.permission (code, module, label, description, sort_order)
VALUES
  ('eod.process', 'operations', 'Run Day End', 'Initiate and retry day-end steps', 500),
  ('eod.approve', 'operations', 'Approve Day End', 'Approve pending day-end runs (checker)', 501)
ON CONFLICT (code) DO NOTHING;

-- 5. Pre-check function ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.eod_precheck(_branch_id uuid, _business_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _company_id uuid;
  _pending_approvals int;
  _unposted_journals int;
  _inflight_disb     int;
  _pending_fd        int;
  _warnings jsonb := '[]'::jsonb;
BEGIN
  SELECT company_id INTO _company_id FROM public.branch WHERE id = _branch_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Branch % not found', _branch_id; END IF;
  IF NOT (public.is_company_member(_company_id) OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT count(*) INTO _pending_approvals
    FROM public.workflow_instance wi
    WHERE wi.company_id = _company_id AND wi.status IN ('pending','in_progress');

  SELECT count(*) INTO _unposted_journals FROM public.journal_entry je
    WHERE je.branch_id = _branch_id
      AND je.entry_date = _business_date
      AND NOT EXISTS (SELECT 1 FROM public.posting p WHERE p.entry_id = je.id);

  SELECT count(*) INTO _inflight_disb FROM public.loan l
    WHERE l.branch_id = _branch_id AND l.status = 'approved';

  SELECT count(*) INTO _pending_fd FROM public.fixed_deposit fd
    WHERE fd.branch_id = _branch_id AND fd.status = 'pending';

  IF _pending_approvals > 0 THEN
    _warnings := _warnings || jsonb_build_array(jsonb_build_object('code','pending_approvals','count',_pending_approvals,
      'label','Pending workflow approvals'));
  END IF;
  IF _unposted_journals > 0 THEN
    _warnings := _warnings || jsonb_build_array(jsonb_build_object('code','unposted_journals','count',_unposted_journals,
      'label','Journal entries without postings'));
  END IF;
  IF _inflight_disb > 0 THEN
    _warnings := _warnings || jsonb_build_array(jsonb_build_object('code','inflight_disbursements','count',_inflight_disb,
      'label','Approved loans awaiting disbursement'));
  END IF;
  IF _pending_fd > 0 THEN
    _warnings := _warnings || jsonb_build_array(jsonb_build_object('code','pending_fd','count',_pending_fd,
      'label','Pending fixed deposit activations'));
  END IF;

  RETURN jsonb_build_object(
    'branch_id', _branch_id,
    'business_date', _business_date,
    'checks', jsonb_build_object(
      'pending_approvals', _pending_approvals,
      'unposted_journals', _unposted_journals,
      'inflight_disbursements', _inflight_disb,
      'pending_fd', _pending_fd
    ),
    'warnings', _warnings,
    'clean', (_warnings = '[]'::jsonb),
    'generated_at', now()
  );
END $$;

-- 6. Initiate --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eod_initiate(_branch_id uuid, _business_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _company_id uuid;
  _pre jsonb;
  _run_id uuid;
  _steps jsonb;
BEGIN
  SELECT company_id INTO _company_id FROM public.branch WHERE id = _branch_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Branch % not found', _branch_id; END IF;
  IF NOT (public.is_company_member(_company_id) OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT (public.has_permission(auth.uid(),'eod.process') OR public.is_company_admin(_company_id) OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Missing permission eod.process';
  END IF;

  SELECT id INTO _run_id FROM public.eod_run
    WHERE branch_id=_branch_id AND business_date=_business_date;
  IF _run_id IS NOT NULL THEN
    RAISE EXCEPTION 'A day-end run already exists for %', _business_date;
  END IF;

  _pre := public.eod_precheck(_branch_id, _business_date);

  _steps := jsonb_build_array(
    jsonb_build_object('key','loan_accrual',    'label','Loan interest accrual',     'status','pending'),
    jsonb_build_object('key','fd_accrual',      'label','FD interest accrual',       'status','pending'),
    jsonb_build_object('key','penalty_charges', 'label','Penalty & overdue charges', 'status','pending'),
    jsonb_build_object('key','par_npa',         'label','PAR & NPA classification',  'status','pending'),
    jsonb_build_object('key','fd_maturity',     'label','FD maturity processing',    'status','pending'),
    jsonb_build_object('key','savings_interest','label','Savings interest posting',  'status','pending'),
    jsonb_build_object('key','gl_post',         'label','GL posting & balance',      'status','pending'),
    jsonb_build_object('key','trial_balance',   'label','Trial balance',             'status','pending'),
    jsonb_build_object('key','reports',         'label','Report generation',         'status','pending'),
    jsonb_build_object('key','rollover',        'label','Date rollover & lock',      'status','pending')
  );

  INSERT INTO public.eod_run (
    company_id, branch_id, business_date, status, steps, pre_check, warnings,
    initiated_by, initiated_at
  ) VALUES (
    _company_id, _branch_id, _business_date, 'pending_approval', _steps, _pre,
    COALESCE(_pre->'warnings','[]'::jsonb), auth.uid(), now()
  ) RETURNING id INTO _run_id;

  PERFORM public.emit_audit(_company_id, 'eod.initiated', 'eod_run', _run_id, NULL, _pre,
    jsonb_build_object('branch_id', _branch_id, 'business_date', _business_date));

  RETURN _run_id;
END $$;

-- 7. Approve ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eod_approve_and_run(_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  IF _r.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Run not pending_approval (status=%)', _r.status;
  END IF;
  IF _r.initiated_by = auth.uid() AND NOT public.has_role(auth.uid(),'platform_admin') THEN
    RAISE EXCEPTION 'Dual control: approver must differ from initiator';
  END IF;

  UPDATE public.eod_run
     SET status='in_progress', approved_by=auth.uid(), approved_at=now(), started_at=now()
   WHERE id=_run_id;

  PERFORM public.emit_audit(_r.company_id, 'eod.approved', 'eod_run', _run_id, NULL, NULL,
    jsonb_build_object('branch_id', _r.branch_id, 'business_date', _r.business_date));
END $$;

-- 8. Step recording --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eod_record_step(
  _run_id uuid, _step_key text, _status text, _metrics jsonb, _error text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _r public.eod_run%ROWTYPE;
  _steps jsonb;
  _idx int;
  _entry jsonb;
BEGIN
  SELECT * INTO _r FROM public.eod_run WHERE id=_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run % not found', _run_id; END IF;
  IF NOT (public.is_company_member(_r.company_id) OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  _steps := _r.steps;
  FOR _idx IN 0 .. (jsonb_array_length(_steps) - 1) LOOP
    IF (_steps->_idx->>'key') = _step_key THEN
      _entry := _steps->_idx;
      _entry := _entry || jsonb_build_object(
        'status', _status,
        'metrics', COALESCE(_metrics,'{}'::jsonb),
        'error',   _error,
        'ended_at', now()
      );
      IF _status = 'processing' THEN
        _entry := _entry || jsonb_build_object('started_at', now(), 'ended_at', NULL, 'error', NULL);
      END IF;
      _steps := jsonb_set(_steps, ARRAY[_idx::text], _entry);
      EXIT;
    END IF;
  END LOOP;

  UPDATE public.eod_run SET steps=_steps WHERE id=_run_id;

  INSERT INTO public.eod_step_log(run_id, step_key, status, actor_user_id, ended_at, metrics, error)
    VALUES (_run_id, _step_key, _status, auth.uid(), now(), COALESCE(_metrics,'{}'::jsonb), _error);
END $$;

CREATE OR REPLACE FUNCTION public.eod_finalize(_run_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r public.eod_run%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.eod_run WHERE id=_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run % not found', _run_id; END IF;
  IF NOT (public.is_company_member(_r.company_id) OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.eod_run
     SET status=_status, completed_at=now(),
         duration_ms = (EXTRACT(EPOCH FROM (now() - COALESCE(started_at, initiated_at, now()))) * 1000)::int
   WHERE id=_run_id;

  IF _status = 'completed' THEN
    UPDATE public.branch SET eod_locked_through = _r.business_date WHERE id=_r.branch_id;
    PERFORM public.ensure_eod_partitions((_r.business_date + INTERVAL '1 month')::date);
    PERFORM public.emit_domain_event(_r.company_id, 'eod', 'completed', 'eod_run', _run_id,
      jsonb_build_object('branch_id', _r.branch_id, 'business_date', _r.business_date), '{}'::jsonb, NULL);
  END IF;

  PERFORM public.emit_audit(_r.company_id, 'eod.'||_status, 'eod_run', _run_id, NULL, NULL,
    jsonb_build_object('branch_id', _r.branch_id, 'business_date', _r.business_date));
END $$;

CREATE OR REPLACE FUNCTION public.eod_save_reports(_run_id uuid, _reports jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r public.eod_run%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.eod_run WHERE id=_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run % not found', _run_id; END IF;
  IF NOT (public.is_company_member(_r.company_id) OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.eod_run SET reports = COALESCE(_reports,'{}'::jsonb) WHERE id=_run_id;
END $$;
