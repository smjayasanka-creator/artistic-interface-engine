
## Day End Process (EOD) Module — Plan

Builds on existing pieces already in the codebase: `public.eod_run`, `public.branch.eod_locked_through`, `enforce_eod_lock` trigger, `eod_close` RPC, and the cron worker at `src/routes/api/public/hooks/eod-close.ts`. This plan extends them into a full operator-visible module with pre-checks, per-step tracking, dual authorisation, and reports.

### 1. Database changes (single migration)

**Extend `public.eod_run`** with per-step tracking + dual authorisation:
- `steps jsonb` — array of `{ key, label, status: pending|processing|completed|failed|skipped, started_at, ended_at, error, metrics }`
- `initiated_by uuid` (maker), `approved_by uuid` (checker), `approved_at timestamptz`
- `status` enum extended: `pending_approval`, `in_progress`, `completed`, `failed`
- `warnings jsonb`, `pre_check_report jsonb`, `report_urls jsonb`

**New table `public.eod_step_log`** (append-only) — one row per step attempt with timestamps, actor, metrics, error, for the audit trail and retry history.

**New permission** `eod.process` + `eod.approve` in `permission` table; wired into `has_permission`.

**New RPCs (SECURITY DEFINER):**
- `eod_precheck(_branch_id, _business_date)` → jsonb of validation results (pending approvals, unposted journals, in-flight disbursements, unfinalised FD ops, incomplete savings txns).
- `eod_initiate(_branch_id, _business_date)` → creates `eod_run` in `pending_approval`, records maker, snapshots pre-check.
- `eod_approve_and_run(_run_id)` → checker only, must differ from maker, flips to `in_progress` and kicks the worker.
- `eod_retry_step(_run_id, _step_key)` → re-runs a single failed step.
- `eod_rollover(_branch_id, _business_date)` → sets `branch.eod_locked_through` and advances business date; already partially exists in `eod_close`, will be split out.

Each step becomes its own RPC so they can be retried individually:
`eod_step_accrue_loan_interest`, `eod_step_accrue_fd_interest`, `eod_step_penalty_charges`, `eod_step_par_npa`, `eod_step_fd_maturity`, `eod_step_savings_interest_posting`, `eod_step_gl_post_pending`, `eod_step_trial_balance`, `eod_step_generate_reports`.

RLS: only company members with `eod.process` (initiate) or `eod.approve` (approve); platform admin bypass.

### 2. Server functions (`src/lib/eod.functions.ts`)

Thin wrappers around the RPCs, all `.middleware([requireSupabaseAuth])`:
`runPreCheck`, `initiateEod`, `approveAndRunEod`, `retryEodStep`, `listEodRuns`, `getEodRun`, `getEodReports`.

### 3. Cron worker update (`src/routes/api/public/hooks/eod-close.ts`)

- Runs pre-check per branch. If clean AND branch has `auto_eod=true` flag (new `branch.auto_eod` boolean), auto-initiates + auto-approves via a system actor and executes.
- If warnings exist OR `auto_eod=false`, creates a `pending_approval` run and notifies branch manager instead of proceeding.

### 4. UI

New route `src/routes/_authenticated/eod.tsx` — **Day End Status Dashboard**:

- **Header:** current system/business date per branch, branch selector, `Run EOD` button (visible only with `eod.process`).
- **Pre-check panel:** live validation summary with red/amber/green chips per check; expandable lists (e.g. list unposted journals with links).
- **Step tracker:** vertical timeline of 9 steps with status pill, duration, and per-step metrics (rows accrued, entries posted, etc.). Failed steps get a `Retry` button (with `eod.process`).
- **Approval banner:** if run is `pending_approval`, shows maker + `Approve & Run` button (only to different user with `eod.approve`).
- **History tab:** table of past runs by date/branch with links to generated reports.
- **Reports tab:** download links for Trial Balance, Daily Txn Summary, Loan Portfolio, PAR/NPA, FD Maturity, GL Summary.

Nav entry added to `AppShell.tsx`.

### 5. Reports

Reports generated as JSON snapshots stored in `eod_run.report_urls` and rendered as printable tables from the dashboard (no PDF generation — reuses existing `reports.tsx` render styles).

### 6. Authorisation & audit

- Every RPC calls `emit_audit(...)` with `eod.*` action prefix.
- Dual-control enforced in `eod_approve_and_run`: raises if `approved_by = initiated_by`.
- All step executions logged to `eod_step_log`.

### 7. Rollover & locking

`eod_step_generate_reports` succeeding triggers `eod_rollover`, which:
- Sets `branch.eod_locked_through = business_date`.
- Existing `enforce_eod_lock` trigger already blocks back-dated postings.
- Emits `eod.completed` domain event → downstream notification.

### Technical notes

- No hardcoded GL accounts — reuses existing product GL mappings (`loan_product`, `fd_product`, `savings_product`).
- Idempotent: each step keyed by `(run_id, step_key)`; safe to retry.
- Partitions: `ensure_eod_partitions(business_date + 1 month)` called by rollover so next month's balance partitions exist.
- Backwards compatible: existing `eod_close` RPC preserved as a wrapper that calls the new step sequence in order.

### Out of scope (call out to user)

- Email/SMS notifications beyond in-app + existing domain event (can be added later via `notify.m-sme.com`).
- PDF report exports (JSON + printable HTML only for now).
- Company-wide EOD orchestration (this module operates per branch, matching current `branch.eod_locked_through` design).
