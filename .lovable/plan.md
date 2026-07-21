
# Day-End Orchestration — Corrective Plan

The project currently has two divergent day-end paths (manual JS orchestrator vs. legacy `eod_close` RPC hit by cron). This plan collapses them into one, closes the safety gaps in the numbered list, and adds regression coverage.

## 1. Canonical orchestrator

Create one server module `src/lib/eod-orchestrator.server.ts` that owns the full day-end lifecycle for a `(branch_id, business_date)`:

```text
pre-check → (pending_approval) → approve → in_progress
        → run steps sequentially (resumable)
        → validate trial balance
        → write snapshots
        → advance eod_locked_through
        → completed | failed
```

Both entry points call it:

- Manual: `runBranchEod({ branchId, businessDate, actor: 'user', userId })` from the existing `runCompanyEod` server function.
- Scheduled: `/api/public/hooks/eod-close` calls the same orchestrator with `actor: 'system'` and a signed cron token.

The legacy `eod_close` Postgres function becomes a thin compatibility wrapper that raises `deprecated` if called outside the new hook, so no other caller can silently use the old path.

## 2. eod_run lifecycle

One row per `(branch_id, business_date)` (existing unique index). Valid transitions enforced by a Postgres trigger `eod_run_transition_guard`:

```text
NULL              → pending_approval | in_progress
pending_approval  → in_progress | failed
in_progress       → completed | failed
failed            → in_progress   (resume/retry)
completed         → (terminal)
```

Resume/retry re-enters `in_progress` on the same row; steps already `completed` are skipped, `failed`/`pending` steps re-run. No more "reject if run exists".

## 3. Steps + authorization

Steps executed in order, each recorded in `eod_step_log` with `status`, `error`, `duration_ms`, `attempts`:

1. `precheck` (blocking checks — see §4)
2. `loan_accrual` — call existing `record_loan_accrual` RPC per active loan
3. `loan_penalty_par` — penalty posting + PAR/NPA bucket update
4. `fd_accrual` — `principal × (annualRatePct / 100) ÷ dayCount` (fix requirement 12)
5. `fd_maturity` — call existing FD maturity RPC
6. `savings_interest_accrual` — call `run_savings_interest_accrual`
7. `savings_capitalization` — call `run_savings_interest_capitalization` (period-end only)
8. `gl_post` — flush any pending journals from the day
9. `trial_balance_check` — sum debits/credits, fail if `|Δ| > tolerance`
10. `snapshots` — write `savings_eod_balance`, `fd_eod_balance`, `loan_eod_balance`, `gl_eod_balance`
11. `lock_branch` — advance `branch.eod_locked_through` (never backwards, sequential dates only)

`eod_record_step`, `eod_finalize`, `eod_save_reports` become `SECURITY DEFINER` and reject non-orchestrator callers via a session GUC (`app.eod_orchestrator = 'on'`) set only inside the orchestrator transaction. Ordinary users lose direct EXECUTE.

## 4. Blocking pre-checks (all hard fails)

- Any teller/till still open for the branch on that date
- Unresolved teller cash variance
- Pending workflow instances tied to that branch (loan/savings approvals, hold releases)
- Unposted journals or incomplete disbursements
- Prior business date not yet closed (sequential)
- Business date is not in the future (company timezone)

Warnings become errors — no more `skipped` on real failures.

## 5. Teller / cashier closing

New table `teller_close`:

```text
teller_close(
  id, company_id, branch_id, business_date, teller_id,
  expected_cash, counted_cash, variance,
  denominations jsonb,     -- [{denom: 5000, count: 12}, ...]
  remarks, status (open|submitted|approved|rejected),
  submitted_by, submitted_at, approved_by, approved_at
)
```

RPCs `open_teller_till`, `submit_teller_close`, `approve_teller_close`. EOD refuses to run unless every teller for the branch has an `approved` close for the business date.

## 6. Automatic scheduling

Rewrite the pg_cron dispatcher to run every 15 min and, for each company:

- Skip if `company.auto_eod_enabled = false`.
- Compute the company-local time using `company.timezone` (not UTC).
- If local time ≥ `company.auto_eod_time` and today's local previous-business-date run hasn't completed:
  - For each branch with `branch.auto_eod = true`, invoke the hook once (idempotent).

Business date = previous calendar day in `company.timezone`.

## 7. Snapshot correctness

Loan snapshot uses `allocated_principal` from `repayment` (not gross paid). On disbursement date, opening principal is 0; disbursed amount is added once via the disbursement journal, not counted twice.

## 8. UI

Rebuild the Admin → Day End tab (and remove the `/eod` redirect stub):

- Branch list with current status, locked-through, last run.
- Pre-check panel (each check pass/fail with reason).
- Pending approval banner + Approve/Reject (maker-checker preserved).
- Per-step progress list with duration and full error text.
- **Retry failed step** and **Resume run** buttons.
- Company-wide "Run day-end" (unchanged UX, new backend).
- Audit history (initiator, approver, timestamps, transitions).

## 9. Tests

New `src/lib/__tests__/eod-orchestrator.test.ts` covering:

manual run · scheduled run parity · maker-checker enforced · open till blocks · unbalanced TB blocks · failed-step resume · idempotent re-run · snapshot rows exist for all four tables · GL balance within tolerance · timezone resolution (non-UTC company) · sequential date enforcement · `eod_locked_through` never goes backwards · FD accrual formula · loan snapshot uses `allocated_principal`.

Plus a `regression-eod-defects.test.ts` with one guard per numbered requirement above.

## Technical notes

### Migrations (in order)

1. `eod_run_transition_guard` trigger + drop stale statuses.
2. `teller_close` table + RLS + RPCs.
3. `eod_close` compatibility wrapper; revoke direct EXECUTE on `eod_record_step`/`eod_finalize`/`eod_save_reports` from `authenticated`; add `SECURITY DEFINER` variants gated by GUC.
4. Fix `fd_accrual` legacy column reference (`amount` → `principal`) or drop if unused.
5. Snapshot upsert functions using `allocated_principal`.

### Code

- `src/lib/eod-orchestrator.server.ts` — new; owns the state machine.
- `src/lib/eod.functions.ts` — thin RPC/HTTP-facing wrappers; delegate to orchestrator.
- `src/routes/api/public/hooks/eod-close.ts` — call orchestrator with system actor; verify cron signature.
- `src/routes/api/public/hooks/eod-dispatch.ts` — new 15-min cron dispatcher, timezone-aware.
- `src/components/mzizi/EodTab.tsx` — expanded UI per §8.
- Delete `src/routes/_authenticated/eod.tsx` redirect stub, replace with real page or keep redirect to Admin tab (choose redirect to keep single source of truth).

### Out of scope

- No changes to loan/savings/FD business math beyond the FD-accrual fix and snapshot-source fix.
- No changes to existing workflow engine internals (only new EOD workflow definitions if maker-checker needs one).

## Rollout

1. Migrations + orchestrator + tests (green build gate).
2. Switch cron hook to orchestrator.
3. Ship new UI.
4. Remove/compat-wrap legacy `eod_close`.

This is a large multi-file change. Approve the plan and I'll execute in that order.
