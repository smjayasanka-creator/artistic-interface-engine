# Savings Domain Overhaul — Phased Plan

This is large. I'll ship in sequenced phases, each independently buildable, tested, and reviewable. Every financial write becomes an atomic `SECURITY DEFINER` RPC. No existing modules touched outside Savings + shared helpers.

## Guiding rules (apply to every phase)

- Reuse: `savings.functions.ts`, `lifecycle.functions.ts`, `eod.functions.ts`, `api-ledger.server.ts`, `PaymentMethodPicker`, `clock-server`, audit helpers, existing RLS + `has_permission(_user_id,_permission,_company_id)`.
- Every financial RPC: `SECURITY DEFINER`, `SET search_path=public`, `SELECT ... FOR UPDATE`, numeric math, permission + company/branch check, idempotency key, subledger insert + balance update + balanced GL + audit — all in one transaction; structured JSON receipt.
- RLS: revoke direct INSERT/UPDATE from `authenticated` on `savings_transaction`, `savings_account.balance/available_balance/status`, new hold/block/accrual/WHT tables. Only RPCs write.
- Forward-only migrations. Preserve current design system (Card, FormGrid, PaymentMethodPicker, tokens). No visual rewrite.

---

## Phase 1 — Foundations (schema + permissions + RPC skeleton)

**Migrations**
- Extend `savings_account`: `available_balance numeric`, `uncleared_balance numeric`, `status` enum add `pending_funding`, `debit_blocked`, `credit_blocked`, `fully_blocked`; product/rate/fee/mandate snapshot columns; `opened_by`, `approved_by`.
- New tables (all with GRANTs + RLS scoped to `company_id` via `has_permission`):
  - `savings_account_holder` (role: primary/joint/guardian/minor, ownership_pct, signing_rule_ref)
  - `savings_account_mandate` (signing rule: sole/any_one/all/any_two/custom, rule_json)
  - `savings_account_nominee` (name, relation, pct — CHECK sum=100 via trigger)
  - `savings_hold` (type: hold/lien/debit_block/credit_block/full/legal/aml/deceased/customer/loan_lien/admin/temp, amount, expires_at, active, reason_code, doc_ref, created/approved/released_by, released_reason)
  - `savings_interest_accrual` (account_id, accrual_date, eligible_balance, rate, day_count, gross_interest, unique(account_id,accrual_date))
  - `savings_interest_posting` (period_start, period_end, gross, wht, net, rule_id, gl_entry_id)
  - `savings_wht_rule` (jurisdiction, tax_type, resident, entity_type, product_id nullable, effective_from/to, rate, threshold, exemption_type, exemption_ref, exemption_expiry, wht_gl_account_id)
  - `savings_loan_mandate` (see phase 5)
  - `savings_auto_collection_run` (company_id, business_date, window: morning/afternoon, started_at, completed_at, status, counts jsonb, unique(company_id,business_date,window))
  - `savings_auto_collection_result` (run_id, mandate_id, status, collected numeric, reason, loan_repayment_id, savings_txn_id)
- Permissions inserted into `permission` table: `savings.accounts.open|view`, `savings.deposit.post`, `savings.withdraw.post`, `savings.transfer.post`, `savings.block.create|approve|release`, `savings.mandate.manage`, `savings.automation.run`, `savings.interest.process`, `savings.wht.manage`, `savings.transaction.reverse|approve`, `savings.close`, `savings.admin`.
- RLS lockdown: revoke `INSERT,UPDATE` on `savings_transaction` from `authenticated`; column-level revoke on `savings_account.balance/available_balance/status`; only `service_role` + RPCs write.

**RPC skeletons** (bodies filled per later phase but signatures ship now):
`open_savings_account`, `post_savings_deposit`, `post_savings_withdrawal`, `post_savings_transfer`, `create_savings_hold`, `release_savings_hold`, `reverse_savings_transaction`, `accrue_savings_interest_daily`, `capitalize_savings_interest`, `execute_savings_loan_mandate`.

---

## Phase 2 — Guided account opening (4-step wizard)

- Route redesign: `/savings/new` becomes stepper (Customer → Product/Branch → Ownership/Nominee/Mandate → Review). Reuse `ClientSearchBar`; block when KYC/CDD/screening incomplete (query `client_risk_assessment`, `screening_config`). Deep-link to `/clients/$id`.
- Product step reads effective ALCO/product rate; override needs `savings.admin` + approval flag.
- Ownership step writes normalized `savings_account_holder`, `savings_account_nominee`, `savings_account_mandate`.
- Review calls `open_savings_account` RPC (atomic account# gen + snapshots + audit). If min deposit required → status `pending_funding`; funding via canonical deposit route activates account.

---

## Phase 3 — Deposit & Withdrawal transactions

- New route `/transactions/savings-deposit` (rename FD tiles to "Fixed Deposit Receipt" for clarity).
- Deposit UI: account picker, business date from server, amount + confirm, `PaymentMethodPicker`, depositor name, source-of-funds when > threshold, uncleared-cheque toggle, idempotency key, confirm modal, receipt.
- Rework `/transactions/savings-withdrawal` with confirm-amount, identity/mandate check, teller/branch, charges preview, limits + maker-checker threshold, receipt.
- Available balance formula in `post_savings_withdrawal` RPC: `ledger − active holds − uncleared − min_required`.
- All posting through RPCs; UI never writes `savings_transaction` directly.

---

## Phase 4 — Account Controls (holds & blocks)

- New route `/savings/controls` + `/savings/$id` "Holds and Blocks" tab.
- Maker creates via `create_savings_hold`; approver via `approve_savings_hold`; release via `release_savings_hold` (never delete). Prominent banner on account detail + transaction screens.

---

## Phase 5 — Loan Repayment Mandates + twice-daily automation

- Route `/savings/mandates` + tab on `/loans/$id`. `savings_loan_mandate` with priority, cap per run, min protected balance, consent ref, morning/afternoon times, timezone.
- Scheduler: pg_cron jobs per company (from `company.timezone`) call new TSS route `POST /api/public/hooks/savings-auto-collection` with anon apikey. Route derives current business date + window, inserts `savings_auto_collection_run` (unique key = exactly-once), loops eligible mandates calling `execute_savings_loan_mandate` RPC. RPC locks account+loan+installments, computes arrears via existing repayment allocator, deducts `min(arrears, cap, available)`, calls canonical `record_repayment` internally, links savings debit ↔ loan repayment ↔ GL, records result.
- Admin dashboard tile: runs, successes, partials, insufficient, blocked, totals, manual retry button (`savings.automation.run`).

---

## Phase 6 — Interest accrual, capitalization, WHT/AIT

- Product admin gains: basis, day-count, min-earn balance, accrual freq, cap freq, rounding, dormant treatment, expense GL, liability GL.
- Admin route `/admin/savings/wht` for effective-dated `savings_wht_rule` (maker-checker).
- EOD step calls `accrue_savings_interest_daily` per account (idempotent). Capitalization job (per product freq) calls `capitalize_savings_interest`: gross → resolve rule → WHT → net; posts DR interest expense / CR WHT payable / CR deposit liability; writes `savings_interest_posting`, generates customer tax certificate rows.
- Reports: accrual, capitalization, WHT deduction with IRD export template (configurable).

---

## Phase 7 — Reversals, transfers, adjustments, standing orders

- `post_savings_transfer` RPC (same-customer/cross-customer configurable).
- `reverse_savings_transaction` RPC (linked reversal txn + reversed GL, never edit/delete; dedupe check).
- Simple adjustments (credit/debit) with approval.
- Standing orders table + daily job hook (reuse scheduler).
- Approval queue route for pending large txns/reversals/blocks.

---

## Phase 8 — Account detail UI + navigation + reports

- `/savings/$id` with tabs: Overview, Transactions, Holds/Blocks, Loan Mandates, Interest/WHT, Holders/Nominees, Passbook/Documents, Audit.
- Sidebar restructure per spec (Savings / Transactions / Admin groupings).
- Reports added under Custom Reports registry: register, daily deposits/withdrawals, teller, savings TB reconciliation, accrual, WHT, dormant/unclaimed, blocked accounts, auto-deduction results, failed automations, reversed txns, large txns, passbook stock.

---

## Phase 9 — Tests + CI

- Vitest DB integration tests per section 13 of the spec (opening, KYC, joint validation, activation, deposit variants, available-balance, holds, concurrent withdrawals, idempotency, GL rollback, mandate validation, exactly-once scheduler, partial deduction, insufficient, interest math, effective WHT, reversal, cross-company reject, maker-checker, subledger-to-GL recon).
- Regression prompt file appended.
- CI must pass lint + typecheck + tests + build.

---

## Delivery cadence

I'll implement **Phase 1 first** (single migration + permission seeds + RPC signatures + RLS lockdown), verify build and no regressions, then proceed phase-by-phase, checking in after each. This keeps each change reviewable and lets you re-prioritize between phases (e.g. push interest/WHT ahead of transfers).

## Technical notes (may skip if non-technical)

- Uncleared cheque handling: `savings_transaction.clearing_status` + `uncleared_balance` column; withdrawal RPC excludes uncleared.
- Idempotency: `savings_transaction.idempotency_key` UNIQUE per company; RPCs return existing receipt on retry.
- Timezone-correct scheduling: pg_cron in UTC, route resolves `company.timezone` → local window; `savings_auto_collection_run` unique(company,date,window) is the exactly-once gate.
- Numeric everywhere (`numeric(20,4)` money, `numeric(9,6)` rates); no JS float in RPCs.
- Snapshots stored on `savings_account` at open time so retroactive product/rate edits don't rewrite history.

## Confirm before I start

1. **Phase 1 begins with a migration that revokes direct INSERT/UPDATE on `savings_transaction`.** Existing UI paths that still insert directly will start failing until Phase 3 lands. OK to sequence that way, or should I keep old paths working via a transitional grant and revoke at Phase 3?
2. Any regulatory constants you want me to seed as defaults (e.g. current LK WHT rate as effective-dated row) so reports aren't empty, or leave the table empty for you to configure?
3. Morning/afternoon default collection times — 10:00 and 15:00 company-local unless you say otherwise.

Reply "go" (or with changes) and I'll ship Phase 1.
