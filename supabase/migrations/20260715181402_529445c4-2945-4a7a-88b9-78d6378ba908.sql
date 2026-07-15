-- ============================================================================
-- End-of-Day (EOD) Sub-Ledger Snapshots + GL Reconciliation Backbone
-- ============================================================================
-- Adds partitioned, append-only "as of date" balance tables per domain
-- (savings, FD, loans, GL) plus the atomic eod_close / eod_reopen RPCs and
-- the branch-level lock trigger that keeps closed periods immutable.

-- 1. Branch-level EOD lock -----------------------------------------------------
ALTER TABLE public.branch
  ADD COLUMN IF NOT EXISTS eod_locked_through DATE;

COMMENT ON COLUMN public.branch.eod_locked_through IS
  'Latest business_date fully closed for this branch. Journal entries with entry_date <= this value are rejected unless a company admin re-opens the period.';

-- 2. EOD run control table -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eod_run (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL,
  branch_id         UUID NOT NULL REFERENCES public.branch(id) ON DELETE CASCADE,
  business_date     DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('closed','reopened')),
  savings_accounts  INT  NOT NULL DEFAULT 0,
  fd_deposits       INT  NOT NULL DEFAULT 0,
  loans             INT  NOT NULL DEFAULT 0,
  gl_accounts       INT  NOT NULL DEFAULT 0,
  duration_ms       INT,
  note              TEXT,
  closed_by         UUID,
  closed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, business_date)
);

CREATE INDEX IF NOT EXISTS eod_run_company_date_idx
  ON public.eod_run (company_id, business_date DESC);

GRANT SELECT ON public.eod_run TO authenticated;
GRANT ALL    ON public.eod_run TO service_role;
ALTER TABLE public.eod_run ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own eod_run"
  ON public.eod_run FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- 3. Domain snapshot tables (partitioned by business_date, monthly) -----------

-- Savings ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.savings_eod_balance (
  company_id      UUID NOT NULL,
  branch_id       UUID NOT NULL,
  account_id      UUID NOT NULL,
  business_date   DATE NOT NULL,
  opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  deposits        NUMERIC(18,2) NOT NULL DEFAULT 0,
  withdrawals     NUMERIC(18,2) NOT NULL DEFAULT 0,
  interest        NUMERIC(18,2) NOT NULL DEFAULT 0,
  fees            NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  txn_count       INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_date, account_id)
) PARTITION BY RANGE (business_date);

CREATE INDEX IF NOT EXISTS savings_eod_company_date_idx
  ON public.savings_eod_balance (company_id, business_date DESC);
CREATE INDEX IF NOT EXISTS savings_eod_account_idx
  ON public.savings_eod_balance (account_id, business_date DESC);

GRANT SELECT ON public.savings_eod_balance TO authenticated;
GRANT ALL    ON public.savings_eod_balance TO service_role;
ALTER TABLE public.savings_eod_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read savings eod"
  ON public.savings_eod_balance FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- Fixed Deposits --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fd_eod_balance (
  company_id       UUID NOT NULL,
  branch_id        UUID NOT NULL,
  deposit_id       UUID NOT NULL,
  business_date    DATE NOT NULL,
  principal        NUMERIC(18,2) NOT NULL DEFAULT 0,
  accrued_interest NUMERIC(18,2) NOT NULL DEFAULT 0,
  interest_paid    NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_balance  NUMERIC(18,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_date, deposit_id)
) PARTITION BY RANGE (business_date);

CREATE INDEX IF NOT EXISTS fd_eod_company_date_idx
  ON public.fd_eod_balance (company_id, business_date DESC);
CREATE INDEX IF NOT EXISTS fd_eod_deposit_idx
  ON public.fd_eod_balance (deposit_id, business_date DESC);

GRANT SELECT ON public.fd_eod_balance TO authenticated;
GRANT ALL    ON public.fd_eod_balance TO service_role;
ALTER TABLE public.fd_eod_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read fd eod"
  ON public.fd_eod_balance FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- Loans -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_eod_balance (
  company_id        UUID NOT NULL,
  branch_id         UUID NOT NULL,
  loan_id           UUID NOT NULL,
  business_date     DATE NOT NULL,
  opening_principal NUMERIC(18,2) NOT NULL DEFAULT 0,
  disbursed         NUMERIC(18,2) NOT NULL DEFAULT 0,
  principal_paid    NUMERIC(18,2) NOT NULL DEFAULT 0,
  interest_accrued  NUMERIC(18,2) NOT NULL DEFAULT 0,
  interest_paid     NUMERIC(18,2) NOT NULL DEFAULT 0,
  fees_paid         NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_principal NUMERIC(18,2) NOT NULL DEFAULT 0,
  arrears           NUMERIC(18,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_date, loan_id)
) PARTITION BY RANGE (business_date);

CREATE INDEX IF NOT EXISTS loan_eod_company_date_idx
  ON public.loan_eod_balance (company_id, business_date DESC);
CREATE INDEX IF NOT EXISTS loan_eod_loan_idx
  ON public.loan_eod_balance (loan_id, business_date DESC);

GRANT SELECT ON public.loan_eod_balance TO authenticated;
GRANT ALL    ON public.loan_eod_balance TO service_role;
ALTER TABLE public.loan_eod_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read loan eod"
  ON public.loan_eod_balance FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- GL --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gl_eod_balance (
  company_id      UUID NOT NULL,
  branch_id       UUID NOT NULL,
  account_id      UUID NOT NULL,
  business_date   DATE NOT NULL,
  opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  debit_total     NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit_total    NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_date, account_id, branch_id)
) PARTITION BY RANGE (business_date);

CREATE INDEX IF NOT EXISTS gl_eod_company_date_idx
  ON public.gl_eod_balance (company_id, business_date DESC);
CREATE INDEX IF NOT EXISTS gl_eod_account_idx
  ON public.gl_eod_balance (account_id, business_date DESC);

GRANT SELECT ON public.gl_eod_balance TO authenticated;
GRANT ALL    ON public.gl_eod_balance TO service_role;
ALTER TABLE public.gl_eod_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read gl eod"
  ON public.gl_eod_balance FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- 4. Partition helper ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_eod_partitions(_month DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _start  DATE := date_trunc('month', _month)::date;
  _end    DATE := (date_trunc('month', _month) + interval '1 month')::date;
  _suffix TEXT := to_char(_start, 'YYYYMM');
  _tables TEXT[] := ARRAY['savings_eod_balance','fd_eod_balance','loan_eod_balance','gl_eod_balance'];
  _tbl    TEXT;
BEGIN
  FOREACH _tbl IN ARRAY _tables LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
      _tbl || '_' || _suffix, _tbl, _start, _end
    );
  END LOOP;
END $$;

-- Seed partitions: previous, current, next 2 months
SELECT public.ensure_eod_partitions((current_date - interval '1 month')::date);
SELECT public.ensure_eod_partitions(current_date);
SELECT public.ensure_eod_partitions((current_date + interval '1 month')::date);
SELECT public.ensure_eod_partitions((current_date + interval '2 months')::date);

-- 5. Entry-date lock trigger --------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_eod_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE _lock DATE;
BEGIN
  SELECT eod_locked_through INTO _lock FROM public.branch WHERE id = NEW.branch_id;
  IF _lock IS NOT NULL AND NEW.entry_date <= _lock THEN
    RAISE EXCEPTION 'Branch % is closed through % — cannot post entry dated %',
      NEW.branch_id, _lock, NEW.entry_date
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_journal_entry_eod_lock ON public.journal_entry;
CREATE TRIGGER trg_journal_entry_eod_lock
  BEFORE INSERT ON public.journal_entry
  FOR EACH ROW EXECUTE FUNCTION public.enforce_eod_lock();

-- 6. eod_close RPC ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eod_close(_branch_id UUID, _business_date DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run_id        UUID;
  _company_id    UUID;
  _t0            TIMESTAMPTZ := clock_timestamp();
  _savings_count INT := 0;
  _fd_count      INT := 0;
  _loan_count    INT := 0;
  _gl_count      INT := 0;
BEGIN
  SELECT company_id INTO _company_id FROM public.branch WHERE id = _branch_id;
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Branch % not found', _branch_id;
  END IF;

  -- Authorization: platform admin, company admin, or branch_manager
  IF NOT (
        public.has_role(auth.uid(), 'platform_admin'::public.app_role)
     OR public.is_company_admin(_company_id)
     OR public.has_role(auth.uid(), 'branch_manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden: EOD close requires admin or branch_manager';
  END IF;

  -- Idempotent: reuse existing run for this branch+date
  SELECT id INTO _run_id
    FROM public.eod_run
   WHERE branch_id = _branch_id AND business_date = _business_date;
  IF _run_id IS NOT NULL THEN
    RETURN _run_id;
  END IF;

  PERFORM public.ensure_eod_partitions(_business_date);

  -- ---------- SAVINGS ----------
  WITH movements AS (
    SELECT
      sa.company_id, sa.branch_id, sa.id AS account_id,
      COALESCE(SUM(CASE WHEN st.txn_type IN ('deposit','opening')     THEN st.amount ELSE 0 END), 0) AS deposits,
      COALESCE(SUM(CASE WHEN st.txn_type IN ('withdrawal','closure')  THEN st.amount ELSE 0 END), 0) AS withdrawals,
      COALESCE(SUM(CASE WHEN st.txn_type = 'interest'                  THEN st.amount ELSE 0 END), 0) AS interest,
      COALESCE(SUM(CASE WHEN st.txn_type = 'fee'                       THEN st.amount ELSE 0 END), 0) AS fees,
      COALESCE(SUM(CASE WHEN st.txn_type = 'adjustment'                THEN st.amount ELSE 0 END), 0) AS adjustments,
      COUNT(st.id) AS txn_count
    FROM public.savings_account sa
    LEFT JOIN public.savings_transaction st
      ON st.account_id = sa.id AND st.txn_date = _business_date
    WHERE sa.branch_id = _branch_id
    GROUP BY sa.company_id, sa.branch_id, sa.id
  ),
  prior AS (
    SELECT DISTINCT ON (account_id) account_id, closing_balance
      FROM public.savings_eod_balance
     WHERE branch_id = _branch_id AND business_date < _business_date
     ORDER BY account_id, business_date DESC
  ),
  ins AS (
    INSERT INTO public.savings_eod_balance
      (company_id, branch_id, account_id, business_date,
       opening_balance, deposits, withdrawals, interest, fees, closing_balance, txn_count)
    SELECT
      m.company_id, m.branch_id, m.account_id, _business_date,
      COALESCE(p.closing_balance, 0),
      m.deposits, m.withdrawals, m.interest, m.fees,
      COALESCE(p.closing_balance, 0) + m.deposits - m.withdrawals + m.interest - m.fees + m.adjustments,
      m.txn_count
    FROM movements m
    LEFT JOIN prior p ON p.account_id = m.account_id
    ON CONFLICT (business_date, account_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _savings_count FROM ins;

  -- ---------- FIXED DEPOSITS ----------
  WITH base AS (
    SELECT fd.company_id, fd.branch_id, fd.id AS deposit_id,
           fd.principal, fd.status::text AS status
      FROM public.fixed_deposit fd
     WHERE fd.branch_id  = _branch_id
       AND fd.value_date <= _business_date
       AND (fd.closed_at IS NULL OR fd.closed_at::date > _business_date)
  ),
  paid AS (
    SELECT ft.deposit_id, COALESCE(SUM(ft.amount), 0) AS interest_paid
      FROM public.fd_transaction ft
     WHERE ft.txn_date <= _business_date
       AND ft.type = 'interest_payout'
     GROUP BY ft.deposit_id
  ),
  accrued AS (
    SELECT a.deposit_id, COALESCE(SUM(a.amount), 0) AS total
      FROM public.fd_accrual a
     WHERE a.accrual_date <= _business_date
     GROUP BY a.deposit_id
  ),
  ins AS (
    INSERT INTO public.fd_eod_balance
      (company_id, branch_id, deposit_id, business_date,
       principal, accrued_interest, interest_paid, closing_balance, status)
    SELECT
      b.company_id, b.branch_id, b.deposit_id, _business_date,
      b.principal,
      COALESCE(a.total, 0),
      COALESCE(p.interest_paid, 0),
      b.principal + COALESCE(a.total, 0) - COALESCE(p.interest_paid, 0),
      b.status
    FROM base b
    LEFT JOIN accrued a ON a.deposit_id = b.deposit_id
    LEFT JOIN paid    p ON p.deposit_id = b.deposit_id
    ON CONFLICT (business_date, deposit_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _fd_count FROM ins;

  -- ---------- LOANS ----------
  WITH base AS (
    SELECT ln.company_id_branch AS company_id, ln.branch_id, ln.id AS loan_id,
           ln.principal, ln.status::text AS status
      FROM (
        SELECT ln.*, b.company_id AS company_id_branch
          FROM public.loan ln
          JOIN public.branch b ON b.id = ln.branch_id
      ) ln
     WHERE ln.branch_id = _branch_id
       AND ln.disbursed_at IS NOT NULL
       AND ln.disbursed_at::date <= _business_date
       AND (ln.closed_at IS NULL OR ln.closed_at::date > _business_date)
  ),
  prior AS (
    SELECT DISTINCT ON (loan_id) loan_id, closing_principal
      FROM public.loan_eod_balance
     WHERE branch_id = _branch_id AND business_date < _business_date
     ORDER BY loan_id, business_date DESC
  ),
  disb AS (
    SELECT ln.id AS loan_id, ln.principal
      FROM public.loan ln
     WHERE ln.branch_id = _branch_id
       AND ln.disbursed_at IS NOT NULL
       AND ln.disbursed_at::date = _business_date
  ),
  rep AS (
    SELECT r.loan_id, SUM(r.amount) AS paid
      FROM public.repayment r
     WHERE r.received_at::date = _business_date
     GROUP BY r.loan_id
  ),
  ins AS (
    INSERT INTO public.loan_eod_balance
      (company_id, branch_id, loan_id, business_date,
       opening_principal, disbursed, principal_paid,
       interest_accrued, interest_paid, fees_paid,
       closing_principal, arrears, status)
    SELECT
      b.company_id, b.branch_id, b.loan_id, _business_date,
      COALESCE(p.closing_principal, b.principal),
      COALESCE(d.principal, 0),
      COALESCE(r.paid, 0),
      0, 0, 0,
      GREATEST(COALESCE(p.closing_principal, b.principal)
               + COALESCE(d.principal, 0)
               - COALESCE(r.paid, 0), 0),
      0,
      b.status
    FROM base b
    LEFT JOIN prior p ON p.loan_id = b.loan_id
    LEFT JOIN disb  d ON d.loan_id = b.loan_id
    LEFT JOIN rep   r ON r.loan_id = b.loan_id
    ON CONFLICT (business_date, loan_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _loan_count FROM ins;

  -- ---------- GL ----------
  WITH today AS (
    SELECT p.account_id,
           COALESCE(SUM(p.debit),  0) AS debit_total,
           COALESCE(SUM(p.credit), 0) AS credit_total
      FROM public.posting p
      JOIN public.journal_entry je ON je.id = p.entry_id
     WHERE je.branch_id = _branch_id AND je.entry_date = _business_date
     GROUP BY p.account_id
  ),
  prior AS (
    SELECT DISTINCT ON (account_id) account_id, closing_balance
      FROM public.gl_eod_balance
     WHERE branch_id = _branch_id AND business_date < _business_date
     ORDER BY account_id, business_date DESC
  ),
  ins AS (
    INSERT INTO public.gl_eod_balance
      (company_id, branch_id, account_id, business_date,
       opening_balance, debit_total, credit_total, closing_balance)
    SELECT
      _company_id, _branch_id, ga.id, _business_date,
      COALESCE(pr.closing_balance, 0),
      COALESCE(t.debit_total,  0),
      COALESCE(t.credit_total, 0),
      COALESCE(pr.closing_balance, 0) + COALESCE(t.debit_total, 0) - COALESCE(t.credit_total, 0)
    FROM public.gl_account ga
    LEFT JOIN today t  ON t.account_id  = ga.id
    LEFT JOIN prior pr ON pr.account_id = ga.id
    WHERE ga.company_id = _company_id
      AND (t.account_id IS NOT NULL OR pr.account_id IS NOT NULL)
    ON CONFLICT (business_date, account_id, branch_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _gl_count FROM ins;

  -- Record the run + advance the lock
  INSERT INTO public.eod_run (
    company_id, branch_id, business_date, status,
    savings_accounts, fd_deposits, loans, gl_accounts,
    duration_ms, closed_by
  ) VALUES (
    _company_id, _branch_id, _business_date, 'closed',
    _savings_count, _fd_count, _loan_count, _gl_count,
    (EXTRACT(EPOCH FROM clock_timestamp() - _t0) * 1000)::INT,
    auth.uid()
  ) RETURNING id INTO _run_id;

  UPDATE public.branch
     SET eod_locked_through = GREATEST(COALESCE(eod_locked_through, _business_date), _business_date)
   WHERE id = _branch_id;

  PERFORM public.emit_domain_event(
    _company_id, 'ledger', 'eod_closed', 'branch', _branch_id,
    jsonb_build_object(
      'business_date', _business_date,
      'run_id', _run_id,
      'counts', jsonb_build_object(
        'savings', _savings_count, 'fd', _fd_count,
        'loans', _loan_count, 'gl', _gl_count
      )
    ),
    '{}'::jsonb,
    'eod:' || _branch_id::text || ':' || _business_date::text
  );

  RETURN _run_id;
END $$;

REVOKE ALL ON FUNCTION public.eod_close(UUID, DATE) FROM public;
GRANT EXECUTE ON FUNCTION public.eod_close(UUID, DATE) TO authenticated;

-- 7. eod_reopen RPC (admin-only, audited) --------------------------------------
CREATE OR REPLACE FUNCTION public.eod_reopen(_branch_id UUID, _business_date DATE, _reason TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _company_id UUID;
BEGIN
  SELECT company_id INTO _company_id FROM public.branch WHERE id = _branch_id;
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Branch % not found', _branch_id;
  END IF;
  IF NOT (public.has_role(auth.uid(), 'platform_admin'::public.app_role)
       OR public.is_company_admin(_company_id)) THEN
    RAISE EXCEPTION 'Forbidden: EOD reopen requires company admin';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Reopen requires a written reason (>= 5 chars)';
  END IF;

  UPDATE public.eod_run
     SET status = 'reopened', note = _reason
   WHERE branch_id = _branch_id AND business_date = _business_date;

  UPDATE public.branch
     SET eod_locked_through = (_business_date - 1)
   WHERE id = _branch_id
     AND eod_locked_through >= _business_date;

  PERFORM public.emit_audit(
    _company_id, 'ledger.eod_reopened', 'branch', _branch_id,
    NULL,
    jsonb_build_object('business_date', _business_date, 'reason', _reason),
    '{}'::jsonb
  );
END $$;

REVOKE ALL ON FUNCTION public.eod_reopen(UUID, DATE, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.eod_reopen(UUID, DATE, TEXT) TO authenticated;
