
-- Allow service_role (system/scheduler) to bypass the human auth.uid() gate
-- on the three step-writing RPCs. Human callers still need eod.process.
CREATE OR REPLACE FUNCTION public.eod_record_step(
  _run_id uuid, _step_key text, _status text, _metrics jsonb, _error text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  _r public.eod_run%ROWTYPE;
  _steps jsonb; _idx int; _entry jsonb;
BEGIN
  SELECT * INTO _r FROM public.eod_run WHERE id=_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF current_user <> 'service_role' AND NOT (
       public.has_permission(auth.uid(),'eod.process',_r.company_id)
    OR public.is_company_admin(_r.company_id)
    OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Missing permission eod.process';
  END IF;

  _steps := _r.steps;
  FOR _idx IN 0 .. (jsonb_array_length(_steps) - 1) LOOP
    IF (_steps->_idx->>'key') = _step_key THEN
      _entry := _steps->_idx || jsonb_build_object(
        'status',_status,'metrics',COALESCE(_metrics,'{}'::jsonb),
        'error',_error,'ended_at',now()
      );
      IF _status='processing' THEN
        _entry := _entry || jsonb_build_object('started_at',now(),'ended_at',NULL,'error',NULL);
      END IF;
      _steps := jsonb_set(_steps, ARRAY[_idx::text], _entry);
      EXIT;
    END IF;
  END LOOP;
  UPDATE public.eod_run SET steps=_steps WHERE id=_run_id;
  INSERT INTO public.eod_step_log(run_id, step_key, status, actor_user_id, ended_at, metrics, error)
    VALUES (_run_id,_step_key,_status,auth.uid(),now(),COALESCE(_metrics,'{}'::jsonb),_error);
END $$;

CREATE OR REPLACE FUNCTION public.eod_save_reports(_run_id uuid, _reports jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE _r public.eod_run%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.eod_run WHERE id=_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF current_user <> 'service_role' AND NOT (
       public.has_permission(auth.uid(),'eod.process',_r.company_id)
    OR public.is_company_admin(_r.company_id)
    OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Missing permission eod.process';
  END IF;
  UPDATE public.eod_run SET reports=COALESCE(_reports,'{}'::jsonb) WHERE id=_run_id;
END $$;

CREATE OR REPLACE FUNCTION public.eod_finalize(_run_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE _r public.eod_run%ROWTYPE; _incomplete int;
BEGIN
  SELECT * INTO _r FROM public.eod_run WHERE id=_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF current_user <> 'service_role' AND NOT (
       public.has_permission(auth.uid(),'eod.process',_r.company_id)
    OR public.is_company_admin(_r.company_id)
    OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Missing permission eod.process';
  END IF;
  IF _status NOT IN ('completed','failed') THEN
    RAISE EXCEPTION 'Invalid finalize status: %', _status;
  END IF;
  IF _status='completed' THEN
    SELECT count(*) INTO _incomplete FROM jsonb_array_elements(_r.steps) s
      WHERE COALESCE(s->>'status','pending') <> 'completed';
    IF _incomplete > 0 THEN
      RAISE EXCEPTION 'Cannot complete run: % step(s) not completed', _incomplete;
    END IF;
  END IF;
  UPDATE public.eod_run
     SET status=_status, completed_at=now(),
         duration_ms=(EXTRACT(EPOCH FROM (now() - COALESCE(started_at, initiated_at, now())))*1000)::int
   WHERE id=_run_id;
  IF _status='completed' THEN
    UPDATE public.branch SET eod_locked_through=_r.business_date WHERE id=_r.branch_id;
    PERFORM public.ensure_eod_partitions((_r.business_date + INTERVAL '1 month')::date);
    PERFORM public.emit_domain_event(_r.company_id,'eod','completed','eod_run',_run_id,
      jsonb_build_object('branch_id',_r.branch_id,'business_date',_r.business_date),'{}'::jsonb,NULL);
  END IF;
  PERFORM public.emit_audit(_r.company_id,'eod.'||_status,'eod_run',_run_id,NULL,NULL,
    jsonb_build_object('branch_id',_r.branch_id,'business_date',_r.business_date));
END $$;

-- System-initiate: cron path — bypasses human auth check, skips dual-control approval.
CREATE OR REPLACE FUNCTION public.eod_system_initiate(_branch_id uuid, _business_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  _company_id uuid; _pre jsonb; _run_id uuid; _existing_status text; _steps jsonb;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'eod_system_initiate is service-role only';
  END IF;
  SELECT company_id INTO _company_id FROM public.branch WHERE id=_branch_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;

  _pre := public.eod_precheck(_branch_id,_business_date);
  IF COALESCE((_pre->>'blocking')::boolean,false) THEN
    RAISE EXCEPTION 'EOD blocked by pre-checks: %', _pre->'blockers';
  END IF;

  SELECT id,status INTO _run_id,_existing_status FROM public.eod_run
    WHERE branch_id=_branch_id AND business_date=_business_date FOR UPDATE;
  IF _run_id IS NOT NULL THEN
    IF _existing_status IN ('completed','closed') THEN
      RETURN _run_id; -- idempotent
    END IF;
    IF _existing_status='failed' THEN
      UPDATE public.eod_run SET status='in_progress', started_at=COALESCE(started_at,now()),
        pre_check=_pre,
        steps=(SELECT COALESCE(jsonb_agg(
          CASE WHEN s->>'status'='completed' THEN s
               ELSE s - 'error' - 'ended_at' || jsonb_build_object('status','pending','error',NULL) END
        ),'[]'::jsonb) FROM jsonb_array_elements(steps) s)
        WHERE id=_run_id;
    ELSIF _existing_status='pending_approval' THEN
      UPDATE public.eod_run SET status='in_progress', started_at=now() WHERE id=_run_id;
    END IF;
    RETURN _run_id;
  END IF;

  _steps := jsonb_build_array(
    jsonb_build_object('key','loan_accrual',   'label','Loan interest accrual',    'status','pending'),
    jsonb_build_object('key','fd_accrual',     'label','FD interest accrual',      'status','pending'),
    jsonb_build_object('key','penalty_charges','label','Penalty & overdue charges','status','pending'),
    jsonb_build_object('key','par_npa',        'label','PAR & NPA classification', 'status','pending'),
    jsonb_build_object('key','fd_maturity',    'label','FD maturity processing',   'status','pending'),
    jsonb_build_object('key','savings_interest','label','Savings interest posting','status','pending'),
    jsonb_build_object('key','gl_post',        'label','GL posting & balance',     'status','pending'),
    jsonb_build_object('key','trial_balance',  'label','Trial balance',            'status','pending'),
    jsonb_build_object('key','snapshots',      'label','EOD snapshots',            'status','pending'),
    jsonb_build_object('key','reports',        'label','Report generation',        'status','pending'),
    jsonb_build_object('key','rollover',       'label','Date rollover & lock',     'status','pending')
  );

  INSERT INTO public.eod_run(
    company_id,branch_id,business_date,status,steps,pre_check,warnings,started_at
  ) VALUES (
    _company_id,_branch_id,_business_date,'in_progress',_steps,_pre,
    COALESCE(_pre->'warnings','[]'::jsonb), now()
  ) RETURNING id INTO _run_id;

  PERFORM public.emit_audit(_company_id,'eod.system_initiated','eod_run',_run_id,NULL,_pre,
    jsonb_build_object('branch_id',_branch_id,'business_date',_business_date,'actor','system'));
  RETURN _run_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.eod_system_initiate(uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eod_system_initiate(uuid,date) TO service_role;
