
-- ================================================================
-- 1. teller_close table (persist cashier closing)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.teller_close (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branch(id) ON DELETE CASCADE,
  teller_id uuid NOT NULL REFERENCES auth.users(id),
  business_date date NOT NULL,
  expected_cash numeric(18,2) NOT NULL DEFAULT 0,
  counted_cash numeric(18,2) NOT NULL DEFAULT 0,
  variance numeric(18,2) GENERATED ALWAYS AS (counted_cash - expected_cash) STORED,
  denominations jsonb NOT NULL DEFAULT '[]'::jsonb,
  remarks text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','submitted','approved','rejected')),
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, teller_id, business_date)
);

CREATE INDEX IF NOT EXISTS teller_close_branch_date_idx
  ON public.teller_close (branch_id, business_date);

GRANT SELECT, INSERT, UPDATE ON public.teller_close TO authenticated;
GRANT ALL ON public.teller_close TO service_role;
ALTER TABLE public.teller_close ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read teller_close" ON public.teller_close
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "Teller manages own open close" ON public.teller_close
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(company_id)
    AND teller_id = auth.uid()
    AND status IN ('open','submitted')
  );

CREATE POLICY "Teller updates own open close" ON public.teller_close
  FOR UPDATE TO authenticated
  USING (teller_id = auth.uid() AND status IN ('open','submitted'))
  WITH CHECK (teller_id = auth.uid());

CREATE POLICY "Admin manages teller_close" ON public.teller_close
  FOR ALL TO authenticated
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE OR REPLACE FUNCTION public.tg_teller_close_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS teller_close_touch ON public.teller_close;
CREATE TRIGGER teller_close_touch
  BEFORE UPDATE ON public.teller_close
  FOR EACH ROW EXECUTE FUNCTION public.tg_teller_close_touch();

-- ---------- Teller close RPCs ----------
CREATE OR REPLACE FUNCTION public.submit_teller_close(
  _branch_id uuid,
  _business_date date,
  _expected numeric,
  _counted numeric,
  _denominations jsonb,
  _remarks text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE _company_id uuid; _id uuid;
BEGIN
  SELECT company_id INTO _company_id FROM public.branch WHERE id=_branch_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  INSERT INTO public.teller_close(
    company_id, branch_id, teller_id, business_date,
    expected_cash, counted_cash, denominations, remarks,
    status, submitted_by, submitted_at
  ) VALUES (
    _company_id, _branch_id, auth.uid(), _business_date,
    COALESCE(_expected,0), COALESCE(_counted,0),
    COALESCE(_denominations,'[]'::jsonb), _remarks,
    'submitted', auth.uid(), now()
  )
  ON CONFLICT (branch_id, teller_id, business_date) DO UPDATE
    SET expected_cash=EXCLUDED.expected_cash,
        counted_cash=EXCLUDED.counted_cash,
        denominations=EXCLUDED.denominations,
        remarks=EXCLUDED.remarks,
        status=CASE WHEN teller_close.status='approved' THEN teller_close.status ELSE 'submitted' END,
        submitted_at=now()
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.approve_teller_close(_id uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE _row public.teller_close%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.teller_close WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Teller close not found'; END IF;
  IF NOT (public.is_company_admin(_row.company_id)
       OR public.has_permission(auth.uid(),'eod.approve',_row.company_id)) THEN
    RAISE EXCEPTION 'Missing permission';
  END IF;
  IF _row.teller_id = auth.uid() AND NOT public.has_role(auth.uid(),'platform_admin') THEN
    RAISE EXCEPTION 'Dual control: approver must differ from teller';
  END IF;
  UPDATE public.teller_close
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        approved_by = auth.uid(),
        approved_at = now()
  WHERE id=_id;
END $$;

GRANT EXECUTE ON FUNCTION public.submit_teller_close(uuid,date,numeric,numeric,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_teller_close(uuid,boolean) TO authenticated;

-- ================================================================
-- 2. eod_run transition guard
-- ================================================================
CREATE OR REPLACE FUNCTION public.tg_eod_run_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pending_approval','in_progress','closed') THEN
      RAISE EXCEPTION 'Invalid initial eod_run status: %', NEW.status;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF OLD.status = 'completed' OR OLD.status = 'closed' THEN
    RAISE EXCEPTION 'eod_run % is terminal (%); cannot transition to %', OLD.id, OLD.status, NEW.status;
  END IF;
  IF NOT (
      (OLD.status='pending_approval' AND NEW.status IN ('in_progress','failed'))
   OR (OLD.status='in_progress'      AND NEW.status IN ('completed','failed'))
   OR (OLD.status='failed'           AND NEW.status IN ('in_progress'))
   OR (OLD.status='reopened'         AND NEW.status IN ('in_progress','completed','failed'))
  ) THEN
    RAISE EXCEPTION 'Invalid eod_run transition % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS eod_run_transition_guard ON public.eod_run;
CREATE TRIGGER eod_run_transition_guard
  BEFORE INSERT OR UPDATE OF status ON public.eod_run
  FOR EACH ROW EXECUTE FUNCTION public.tg_eod_run_transition();

-- Prevent moving branch.eod_locked_through backwards
CREATE OR REPLACE FUNCTION public.tg_branch_lock_monotonic()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.eod_locked_through IS NOT NULL
     AND OLD.eod_locked_through IS NOT NULL
     AND NEW.eod_locked_through < OLD.eod_locked_through THEN
    RAISE EXCEPTION 'branch.eod_locked_through cannot move backwards (% -> %)',
      OLD.eod_locked_through, NEW.eod_locked_through;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS branch_lock_monotonic ON public.branch;
CREATE TRIGGER branch_lock_monotonic
  BEFORE UPDATE OF eod_locked_through ON public.branch
  FOR EACH ROW EXECUTE FUNCTION public.tg_branch_lock_monotonic();

-- ================================================================
-- 3. Harden eod_precheck: warnings become blockers
-- ================================================================
CREATE OR REPLACE FUNCTION public.eod_precheck(_branch_id uuid, _business_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  _company_id uuid;
  _blockers jsonb := '[]'::jsonb;
  _warnings jsonb := '[]'::jsonb;
  _n int;
  _prev_lock date;
  _tz text;
  _local_date date;
BEGIN
  SELECT company_id, eod_locked_through
    INTO _company_id, _prev_lock
    FROM public.branch WHERE id=_branch_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF NOT (public.is_company_member(_company_id) OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT timezone INTO _tz FROM public.company WHERE id=_company_id;
  _local_date := (now() AT TIME ZONE COALESCE(_tz,'UTC'))::date;

  -- Future date guard
  IF _business_date >= _local_date THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','future_date','label','Business date must be before local today',
      'business_date',_business_date,'local_today',_local_date));
  END IF;

  -- Sequential date guard
  IF _prev_lock IS NOT NULL AND _business_date <> _prev_lock + 1 THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','non_sequential_date','label','Business date must be the day after last lock',
      'previous_lock',_prev_lock,'business_date',_business_date));
  END IF;

  -- Open / unapproved teller tills for the branch on this date
  SELECT count(*) INTO _n FROM public.teller_close tc
    WHERE tc.branch_id=_branch_id AND tc.business_date=_business_date
      AND tc.status <> 'approved';
  -- Also flag tellers who transacted today but never submitted a close.
  IF _n > 0 THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','open_teller_tills','count',_n,
      'label','Teller close(s) pending approval'));
  END IF;

  -- Unresolved variances (approved close still shows non-zero variance flagged rejected once)
  SELECT count(*) INTO _n FROM public.teller_close tc
    WHERE tc.branch_id=_branch_id AND tc.business_date=_business_date
      AND tc.status='rejected';
  IF _n > 0 THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','teller_variance_rejected','count',_n,
      'label','Rejected teller close(s) — resolve variance'));
  END IF;

  -- Pending / in-progress workflows for this company
  SELECT count(*) INTO _n FROM public.workflow_instance wi
    WHERE wi.company_id=_company_id AND wi.status IN ('pending','in_progress');
  IF _n > 0 THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','pending_workflows','count',_n,'label','Pending workflow instances'));
  END IF;

  -- Unposted journals on the business date
  SELECT count(*) INTO _n FROM public.journal_entry je
    WHERE je.branch_id=_branch_id AND je.entry_date=_business_date
      AND NOT EXISTS (SELECT 1 FROM public.posting p WHERE p.entry_id=je.id);
  IF _n > 0 THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','unposted_journals','count',_n,'label','Journal entries without postings'));
  END IF;

  -- Loans approved but not yet disbursed
  SELECT count(*) INTO _n FROM public.loan l
    WHERE l.branch_id=_branch_id AND l.status='approved';
  IF _n > 0 THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','inflight_disbursements','count',_n,'label','Approved loans awaiting disbursement'));
  END IF;

  -- FD pending activations (soft warning)
  SELECT count(*) INTO _n FROM public.fixed_deposit fd
    WHERE fd.branch_id=_branch_id AND fd.status='pending';
  IF _n > 0 THEN
    _warnings := _warnings || jsonb_build_array(jsonb_build_object(
      'code','pending_fd','count',_n,'label','Pending FD activations'));
  END IF;

  RETURN jsonb_build_object(
    'business_date',_business_date,
    'blockers',_blockers,
    'warnings',_warnings,
    'blocking', jsonb_array_length(_blockers) > 0,
    'checked_at', now()
  );
END $$;

-- ================================================================
-- 4. eod_initiate: allow resume of failed runs
-- ================================================================
CREATE OR REPLACE FUNCTION public.eod_initiate(_branch_id uuid, _business_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  _company_id uuid;
  _pre jsonb;
  _run_id uuid;
  _existing_status text;
  _steps jsonb;
BEGIN
  SELECT company_id INTO _company_id FROM public.branch WHERE id=_branch_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF NOT (public.is_company_member(_company_id) OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT (public.has_permission(auth.uid(),'eod.process',_company_id)
       OR public.is_company_admin(_company_id)
       OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Missing permission eod.process';
  END IF;

  _pre := public.eod_precheck(_branch_id, _business_date);
  IF COALESCE((_pre->>'blocking')::boolean,false) THEN
    RAISE EXCEPTION 'EOD blocked by pre-checks: %', _pre->'blockers';
  END IF;

  SELECT id, status INTO _run_id, _existing_status
    FROM public.eod_run WHERE branch_id=_branch_id AND business_date=_business_date FOR UPDATE;

  IF _run_id IS NOT NULL THEN
    IF _existing_status IN ('completed','closed') THEN
      RAISE EXCEPTION 'EOD already completed for % (%)', _business_date, _existing_status;
    END IF;
    IF _existing_status = 'failed' THEN
      -- Resume: reset failed steps to pending; keep completed ones.
      UPDATE public.eod_run
        SET status='pending_approval',
            pre_check=_pre,
            steps = (
              SELECT COALESCE(jsonb_agg(
                CASE WHEN s->>'status' = 'completed' THEN s
                     ELSE s - 'error' - 'ended_at' || jsonb_build_object('status','pending','error',NULL)
                END
              ), '[]'::jsonb)
              FROM jsonb_array_elements(steps) s
            )
      WHERE id=_run_id;
    END IF;
    RETURN _run_id;
  END IF;

  _steps := jsonb_build_array(
    jsonb_build_object('key','loan_accrual',    'label','Loan interest accrual',    'status','pending'),
    jsonb_build_object('key','fd_accrual',      'label','FD interest accrual',      'status','pending'),
    jsonb_build_object('key','penalty_charges', 'label','Penalty & overdue charges','status','pending'),
    jsonb_build_object('key','par_npa',         'label','PAR & NPA classification', 'status','pending'),
    jsonb_build_object('key','fd_maturity',     'label','FD maturity processing',   'status','pending'),
    jsonb_build_object('key','savings_interest','label','Savings interest posting', 'status','pending'),
    jsonb_build_object('key','gl_post',         'label','GL posting & balance',     'status','pending'),
    jsonb_build_object('key','trial_balance',   'label','Trial balance',            'status','pending'),
    jsonb_build_object('key','snapshots',       'label','EOD snapshots',            'status','pending'),
    jsonb_build_object('key','reports',         'label','Report generation',        'status','pending'),
    jsonb_build_object('key','rollover',        'label','Date rollover & lock',     'status','pending')
  );

  INSERT INTO public.eod_run (
    company_id, branch_id, business_date, status, steps, pre_check, warnings,
    initiated_by, initiated_at
  ) VALUES (
    _company_id, _branch_id, _business_date, 'pending_approval',
    _steps, _pre, COALESCE(_pre->'warnings','[]'::jsonb),
    auth.uid(), now()
  ) RETURNING id INTO _run_id;

  PERFORM public.emit_audit(_company_id,'eod.initiated','eod_run',_run_id, NULL,_pre,
    jsonb_build_object('branch_id',_branch_id,'business_date',_business_date));
  RETURN _run_id;
END $$;

-- ================================================================
-- 5. eod_finalize: require all steps completed for status=completed
-- ================================================================
CREATE OR REPLACE FUNCTION public.eod_finalize(_run_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  _r public.eod_run%ROWTYPE;
  _incomplete int;
BEGIN
  SELECT * INTO _r FROM public.eod_run WHERE id=_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF NOT (public.is_company_member(_r.company_id) OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT (public.has_permission(auth.uid(),'eod.process',_r.company_id)
       OR public.is_company_admin(_r.company_id)
       OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Missing permission eod.process';
  END IF;
  IF _status NOT IN ('completed','failed') THEN
    RAISE EXCEPTION 'Invalid finalize status: %', _status;
  END IF;

  IF _status = 'completed' THEN
    SELECT count(*) INTO _incomplete
      FROM jsonb_array_elements(_r.steps) s
      WHERE COALESCE(s->>'status','pending') <> 'completed';
    IF _incomplete > 0 THEN
      RAISE EXCEPTION 'Cannot complete run: % step(s) not completed', _incomplete;
    END IF;
  END IF;

  UPDATE public.eod_run
     SET status=_status, completed_at=now(),
         duration_ms = (EXTRACT(EPOCH FROM (now() - COALESCE(started_at, initiated_at, now())))*1000)::int
   WHERE id=_run_id;

  IF _status = 'completed' THEN
    UPDATE public.branch SET eod_locked_through=_r.business_date WHERE id=_r.branch_id;
    PERFORM public.ensure_eod_partitions((_r.business_date + INTERVAL '1 month')::date);
    PERFORM public.emit_domain_event(_r.company_id,'eod','completed','eod_run',_run_id,
      jsonb_build_object('branch_id',_r.branch_id,'business_date',_r.business_date),'{}'::jsonb,NULL);
  END IF;
  PERFORM public.emit_audit(_r.company_id,'eod.'||_status,'eod_run',_run_id,NULL,NULL,
    jsonb_build_object('branch_id',_r.branch_id,'business_date',_r.business_date));
END $$;

-- ================================================================
-- 6. Restrict record_step / save_reports to eod.process permission
-- ================================================================
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
  IF NOT (public.has_permission(auth.uid(),'eod.process',_r.company_id)
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
  IF NOT (public.has_permission(auth.uid(),'eod.process',_r.company_id)
       OR public.is_company_admin(_r.company_id)
       OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Missing permission eod.process';
  END IF;
  UPDATE public.eod_run SET reports=COALESCE(_reports,'{}'::jsonb) WHERE id=_run_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.eod_record_step(uuid,text,text,jsonb,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.eod_save_reports(uuid,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.eod_finalize(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eod_record_step(uuid,text,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eod_save_reports(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eod_finalize(uuid,text) TO authenticated;

-- ================================================================
-- 7. Snapshot writer used by the orchestrator (fixes fd column + loan double-count)
-- ================================================================
CREATE OR REPLACE FUNCTION public.eod_write_snapshots(_branch_id uuid, _business_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  _company_id uuid;
  _savings_count int := 0;
  _fd_count int := 0;
  _loan_count int := 0;
  _gl_count int := 0;
BEGIN
  SELECT company_id INTO _company_id FROM public.branch WHERE id=_branch_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF NOT (public.has_permission(auth.uid(),'eod.process',_company_id)
       OR public.is_company_admin(_company_id)
       OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Missing permission eod.process';
  END IF;

  -- SAVINGS
  WITH movements AS (
    SELECT sa.company_id, sa.branch_id, sa.id AS account_id,
      COALESCE(SUM(CASE WHEN st.txn_type IN ('deposit','opening') THEN st.amount ELSE 0 END),0) AS deposits,
      COALESCE(SUM(CASE WHEN st.txn_type IN ('withdrawal','closure') THEN st.amount ELSE 0 END),0) AS withdrawals,
      COALESCE(SUM(CASE WHEN st.txn_type='interest' THEN st.amount ELSE 0 END),0) AS interest,
      COALESCE(SUM(CASE WHEN st.txn_type='fee' THEN st.amount ELSE 0 END),0) AS fees,
      COALESCE(SUM(CASE WHEN st.txn_type='adjustment' THEN st.amount ELSE 0 END),0) AS adjustments,
      COUNT(st.id) AS txn_count
    FROM public.savings_account sa
    LEFT JOIN public.savings_transaction st
      ON st.account_id=sa.id AND st.txn_date=_business_date
    WHERE sa.branch_id=_branch_id
    GROUP BY sa.company_id, sa.branch_id, sa.id
  ),
  prior AS (
    SELECT DISTINCT ON (account_id) account_id, closing_balance
    FROM public.savings_eod_balance
    WHERE branch_id=_branch_id AND business_date<_business_date
    ORDER BY account_id, business_date DESC
  ),
  ins AS (
    INSERT INTO public.savings_eod_balance
      (company_id,branch_id,account_id,business_date,opening_balance,deposits,withdrawals,interest,fees,closing_balance,txn_count)
    SELECT m.company_id,m.branch_id,m.account_id,_business_date,
      COALESCE(p.closing_balance,0),m.deposits,m.withdrawals,m.interest,m.fees,
      COALESCE(p.closing_balance,0)+m.deposits-m.withdrawals+m.interest-m.fees+m.adjustments,
      m.txn_count
    FROM movements m LEFT JOIN prior p ON p.account_id=m.account_id
    ON CONFLICT (business_date,account_id) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO _savings_count FROM ins;

  -- FD (fix: use daily_amount, not amount)
  WITH base AS (
    SELECT fd.company_id, fd.branch_id, fd.id AS deposit_id, fd.principal, fd.status::text AS status
    FROM public.fixed_deposit fd
    WHERE fd.branch_id=_branch_id AND fd.value_date<=_business_date
      AND (fd.closed_at IS NULL OR fd.closed_at::date > _business_date)
  ),
  paid AS (
    SELECT ft.deposit_id, COALESCE(SUM(ft.amount),0) AS interest_paid
    FROM public.fd_transaction ft
    WHERE ft.txn_date<=_business_date AND ft.type='interest_payout'
    GROUP BY ft.deposit_id
  ),
  accrued AS (
    SELECT a.deposit_id, COALESCE(SUM(a.daily_amount),0) AS total
    FROM public.fd_accrual a WHERE a.accrual_date<=_business_date
    GROUP BY a.deposit_id
  ),
  ins AS (
    INSERT INTO public.fd_eod_balance
      (company_id,branch_id,deposit_id,business_date,principal,interest_accrued,interest_paid,status)
    SELECT b.company_id,b.branch_id,b.deposit_id,_business_date,
      b.principal, COALESCE(a.total,0), COALESCE(p.interest_paid,0), b.status
    FROM base b
    LEFT JOIN accrued a ON a.deposit_id=b.deposit_id
    LEFT JOIN paid p ON p.deposit_id=b.deposit_id
    ON CONFLICT (business_date,deposit_id) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO _fd_count FROM ins;

  -- LOANS (fix: allocated_principal, no double-count on disbursement date)
  WITH base AS (
    SELECT b.company_id, ln.branch_id, ln.id AS loan_id, ln.principal, ln.status::text AS status,
           ln.disbursed_at::date AS disb_date
    FROM public.loan ln
    JOIN public.branch b ON b.id=ln.branch_id
    WHERE ln.branch_id=_branch_id
      AND ln.disbursed_at IS NOT NULL
      AND ln.disbursed_at::date <= _business_date
      AND (ln.closed_at IS NULL OR ln.closed_at::date > _business_date)
  ),
  prior AS (
    SELECT DISTINCT ON (loan_id) loan_id, closing_principal
    FROM public.loan_eod_balance
    WHERE branch_id=_branch_id AND business_date<_business_date
    ORDER BY loan_id, business_date DESC
  ),
  disb AS (
    SELECT ln.id AS loan_id, ln.principal
    FROM public.loan ln
    WHERE ln.branch_id=_branch_id AND ln.disbursed_at::date=_business_date
  ),
  rep AS (
    SELECT r.loan_id, COALESCE(SUM(r.allocated_principal),0) AS principal_paid,
           COALESCE(SUM(r.allocated_interest),0) AS interest_paid,
           COALESCE(SUM(r.allocated_fees),0) AS fees_paid
    FROM public.repayment r
    WHERE r.received_at::date=_business_date
    GROUP BY r.loan_id
  ),
  ins AS (
    INSERT INTO public.loan_eod_balance
      (company_id,branch_id,loan_id,business_date,opening_principal,disbursed,principal_paid,
       interest_accrued,interest_paid,fees_paid,closing_principal,arrears,status)
    SELECT b.company_id,b.branch_id,b.loan_id,_business_date,
      -- On disbursement date opening = 0, else previous closing (fallback 0).
      CASE WHEN b.disb_date=_business_date THEN 0 ELSE COALESCE(p.closing_principal,0) END,
      COALESCE(d.principal,0),
      COALESCE(r.principal_paid,0),
      0,
      COALESCE(r.interest_paid,0),
      COALESCE(r.fees_paid,0),
      GREATEST(
        (CASE WHEN b.disb_date=_business_date THEN 0 ELSE COALESCE(p.closing_principal,0) END)
        + COALESCE(d.principal,0)
        - COALESCE(r.principal_paid,0), 0),
      0, b.status
    FROM base b
    LEFT JOIN prior p ON p.loan_id=b.loan_id
    LEFT JOIN disb  d ON d.loan_id=b.loan_id
    LEFT JOIN rep   r ON r.loan_id=b.loan_id
    ON CONFLICT (business_date,loan_id) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO _loan_count FROM ins;

  -- GL
  WITH today AS (
    SELECT p.account_id,
      COALESCE(SUM(p.debit),0) AS debit_total,
      COALESCE(SUM(p.credit),0) AS credit_total
    FROM public.posting p
    JOIN public.journal_entry je ON je.id=p.entry_id
    WHERE je.branch_id=_branch_id AND je.entry_date=_business_date
    GROUP BY p.account_id
  ),
  prior AS (
    SELECT DISTINCT ON (account_id) account_id, closing_balance
    FROM public.gl_eod_balance
    WHERE branch_id=_branch_id AND business_date<_business_date
    ORDER BY account_id, business_date DESC
  ),
  ins AS (
    INSERT INTO public.gl_eod_balance
      (company_id,branch_id,account_id,business_date,opening_balance,debit_total,credit_total,closing_balance)
    SELECT _company_id,_branch_id,ga.id,_business_date,
      COALESCE(pr.closing_balance,0),COALESCE(t.debit_total,0),COALESCE(t.credit_total,0),
      COALESCE(pr.closing_balance,0)+COALESCE(t.debit_total,0)-COALESCE(t.credit_total,0)
    FROM public.gl_account ga
    LEFT JOIN today t ON t.account_id=ga.id
    LEFT JOIN prior pr ON pr.account_id=ga.id
    WHERE ga.company_id=_company_id
      AND (t.account_id IS NOT NULL OR pr.account_id IS NOT NULL)
    ON CONFLICT (business_date,account_id,branch_id) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO _gl_count FROM ins;

  RETURN jsonb_build_object(
    'savings_accounts',_savings_count,
    'fd_deposits',_fd_count,
    'loans',_loan_count,
    'gl_accounts',_gl_count
  );
END $$;

GRANT EXECUTE ON FUNCTION public.eod_write_snapshots(uuid,date) TO authenticated;

-- ================================================================
-- 8. Legacy eod_close: turn into compat wrapper
-- ================================================================
CREATE OR REPLACE FUNCTION public.eod_close(_branch_id uuid, _business_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE _existing uuid; _snap jsonb; _company_id uuid;
BEGIN
  SELECT company_id INTO _company_id FROM public.branch WHERE id=_branch_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;

  SELECT id INTO _existing FROM public.eod_run
    WHERE branch_id=_branch_id AND business_date=_business_date;
  IF _existing IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy eod_close deprecated: use eod_initiate/orchestrator for run %', _existing;
  END IF;

  _snap := public.eod_write_snapshots(_branch_id, _business_date);

  INSERT INTO public.eod_run(
    company_id,branch_id,business_date,status,
    savings_accounts,fd_deposits,loans,gl_accounts,
    closed_by
  ) VALUES (
    _company_id,_branch_id,_business_date,'closed',
    COALESCE((_snap->>'savings_accounts')::int,0),
    COALESCE((_snap->>'fd_deposits')::int,0),
    COALESCE((_snap->>'loans')::int,0),
    COALESCE((_snap->>'gl_accounts')::int,0),
    auth.uid()
  ) RETURNING id INTO _existing;

  UPDATE public.branch SET eod_locked_through=_business_date WHERE id=_branch_id;
  RETURN _existing;
END $$;
