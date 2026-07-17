
## Write-Off Module Redesign

### 1. Database (migration)

New table `public.loan_write_off`:
- `loan_id` (unique), `facility_no`, `client_id`, `company_id`, `branch_id`
- `write_off_date`, `reason`
- `principal_written_off`, `interest_written_off`, `charges_written_off`, `total_written_off`
- `principal_recovered`, `interest_recovered`, `charges_recovered`, `total_recovered`
- `is_fully_recovered` (bool), `created_by`, timestamps
- GRANTs to `authenticated`/`service_role`; RLS scoped by `is_company_member(company_id)`; only `is_company_admin` may insert/update.

New table `public.loan_write_off_recovery`:
- `write_off_id` FK, `recovery_date`, `amount`, `principal_portion`, `interest_portion`, `charges_portion`, `payment_method`, `reference`, `notes`, `created_by`
- Standard grants + RLS via parent's `company_id`.

Update `write_off_loan` RPC (or add a wrapper trigger) so that when it runs it also inserts the master row breaking down principal / interest / charges from the loan's outstanding installments.

New RPC `record_write_off_recovery(_write_off_id, _amount, _principal, _interest, _charges, _payment_method, _reference, _notes, _idempotency_key)` — inserts recovery row, updates parent totals, posts a GL entry (DR Cash / CR Bad Debt Recovery income) using the loan product's mapped accounts, marks `is_fully_recovered` when total_recovered ≥ total_written_off.

### 2. Frontend

**`/loans/write-off`** — becomes the full Write-Off workspace:
- Header + list of facilities eligible for write-off (status ∈ disbursed/active/overdue) with facility no, client, outstanding principal/interest/charges, quick "Write off" action opening the existing WriteOffModal (moved out of `LoanLifecycleActions`).
- Second section: master table of already written-off facilities with columns per spec (Facility, Date, Principal, Interest, Charges, Total, Recovered, Reason, actions: "Record collection", "View").
- "Record collection" opens a modal capturing recovery date/amount/allocation/payment method → calls `recordWriteOffRecovery`.

**Loan detail page (`loans.$id.tsx`)** — remove the write-off button from `LoanLifecycleActions` (keep Reschedule); leave a small link "Write off → available in Write-Off workspace" for discoverability.

**Transactions index (`transactions.index.tsx`)** — add new tile "Write-off Collection" (icon `HandCoins` or `Undo2`) linking to `/loans/write-off#collections` (or a dedicated `/transactions/write-off-collection` route that renders the master table + record-collection modal for quick access).

### 3. Server functions (`src/lib/lifecycle.functions.ts` or new `write-off.functions.ts`)

- `listWriteOffCandidates()` — loans eligible for write-off with balances.
- `listWriteOffs()` — master rows + recoveries summary.
- `recordWriteOffRecovery(...)` — calls the new RPC.

### 4. Files touched

- New migration.
- New: `src/lib/write-off.functions.ts`, `src/components/mzizi/WriteOffWorkspace.tsx`, `src/components/mzizi/RecordRecoveryModal.tsx`, `src/routes/_authenticated/transactions.write-off-collection.tsx`.
- Modified: `src/routes/_authenticated/loans.write-off.tsx` (full workspace), `src/components/mzizi/LoanLifecycleActions.tsx` (drop write-off), `src/routes/_authenticated/transactions.index.tsx` (add tile).

Confirm and I'll implement — migration first (needs your approval), then wire the UI.
