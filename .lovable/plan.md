
# Loan Application Data Model

Separate loan **origination** (pre-disbursement) from **loan servicing** (post-disbursement). Origination lives in a new `loan_application_*` family. The existing `loan` table stays as the operational system of record, populated at disbursement.

## Answers we're building against
- Back-fill: synthetic application rows for every existing loan.
- Cutover: copy-on-disburse — new `loan` row is created when disbursement completes, linked by `application_no`.
- Sub-tables: all 12.
- Numbering: single global sequence, `AP` + 6-digit zero-padded (`AP000001`).

---

## 1. Schema (migration)

### 1.1 Global sequence + generator

```sql
CREATE SEQUENCE public.loan_application_no_seq START 1;

CREATE OR REPLACE FUNCTION public.next_loan_application_no()
RETURNS text LANGUAGE sql VOLATILE SET search_path=public AS $$
  SELECT 'AP' || lpad(nextval('public.loan_application_no_seq')::text, 6, '0');
$$;
```

### 1.2 Master

```
loan_application
  id, application_no (unique, default next_loan_application_no())
  company_id, branch_id, client_id, product_id
  requested_principal, requested_tenor_months, currency
  purpose, channel, status  -- draft|submitted|under_review|approved|rejected|disbursed|cancelled
  submitted_at, decided_at, disbursed_at
  loan_id (nullable, set on disburse)
  created_by, created_at, updated_at
```

### 1.3 Related tables (all keyed by `application_id uuid → loan_application.id`, plus a denormalized `application_no` for reporting joins)

| Table | Purpose |
|---|---|
| `loan_application_applicant` | Snapshot of applicant + co-applicants at submission time |
| `loan_application_evaluation` | Rows keyed to `evaluation_section` (replaces current `loan_evaluation` writes for new apps) |
| `loan_application_employment` | Employer, position, income, tenure |
| `loan_application_business` | Business name, sector, turnover, ownership |
| `loan_application_existing_facility` | Other lenders, outstanding, monthly commitment |
| `loan_application_guarantor` | Guarantor party + coverage |
| `loan_application_collateral` | Security type + dynamic fields (mirrors current securities JSON) |
| `loan_application_document` | Attachments: type, file_name, storage_path, uploaded_by, uploaded_at, version |
| `loan_application_approval` | Workflow instance link, per-step decisions |
| `loan_application_note` | Free-text notes/remarks with author + timestamp |
| `loan_application_status_history` | Every status change with actor, from/to, reason |

Every table:
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;`
- RLS: `is_company_member(company_id)` for read/write; `is_company_admin` for delete on non-master rows only. **Master `loan_application` is delete-blocked once `status <> 'draft'`** (trigger) — enforces retention.
- `updated_at` trigger via existing `set_updated_at()`.

### 1.4 Retention trigger

```sql
CREATE TRIGGER trg_loan_application_no_delete
BEFORE DELETE ON public.loan_application
FOR EACH ROW EXECUTE FUNCTION public.loan_application_block_delete();
```
Blocks delete unless `status='draft'` and no child rows exist.

### 1.5 `loan` linkage

Add `application_id uuid REFERENCES loan_application(id)` and `application_no text` to `public.loan`. Index both.

---

## 2. Back-fill (same migration, after DDL)

For every existing `loan`:
1. Insert a `loan_application` row with `status='disbursed'`, `disbursed_at = loan.disbursed_at`, snapshot of principal/tenor/purpose, new `application_no` from the global sequence.
2. Copy any existing `loan_evaluation` rows into `loan_application_evaluation`.
3. Copy `loan_security` rows into `loan_application_collateral`.
4. Copy `loan_applied_charge` metadata into a `loan_application_note` summary (charges themselves stay on `loan`).
5. Update `loan.application_id` / `loan.application_no` with the new IDs.

Wrapped in a single `DO` block so it's atomic with the DDL.

---

## 3. Copy-on-disburse RPC

New `public.disburse_loan_from_application(_application_id, _payment_channel, ...)`:
1. Verify status `= 'approved'` and workflow complete.
2. Insert into `loan` with values copied from application + child tables (charges, securities).
3. Set `loan_application.status='disbursed'`, `loan_id`, `disbursed_at`.
4. Post GL entry via `post_entry_system` (unchanged).
5. Append `loan_application_status_history` row.

Existing `disburse_loan` RPC becomes a thin wrapper that resolves the application by `loan.application_id` and calls the new function — no behavior change for callers that already pass `loan_id`.

---

## 4. Server functions (`src/lib/loan-application.functions.ts`)

- `createLoanApplication` (draft)
- `updateLoanApplication`
- `submitLoanApplication` (draft → submitted, kicks approval workflow)
- `listLoanApplications` (with status filter)
- `getLoanApplication` (master + all children)
- `addApplicationDocument` / `deleteApplicationDocument`
- `addApplicationNote`
- `recordApplicationDecision` (used by workflow)
- `disburseApplication` (calls new RPC)

All use `requireSupabaseAuth` middleware and RLS-scoped queries.

---

## 5. UI changes

Minimal — keep the visual layout of `loans.new.tsx` and `loans.$id.tsx`:
- `loans.new.tsx` writes to `loan_application` + children instead of `loan`. On disburse it triggers `disburseApplication`.
- `loans.$id.tsx` reads from `loan` post-disbursement; adds an "Application" tab showing the retained origination record (read-only) linked by `application_no`.
- `LoanEvaluation.tsx` targets `loan_application_evaluation` when an application context is present, `loan_evaluation` otherwise (back-compat for already-disbursed loans).
- Approvals list keys on `application_no` for pre-disbursement items; on `loan.reference` for post.

No new pages, no design changes.

---

## 6. Rollout order (single migration + code batch)

1. Migration: DDL for all 12 tables + sequence + generator + trigger + `loan` FK columns + back-fill + `disburse_loan_from_application` RPC. Regenerated types afterward.
2. New `loan-application.functions.ts`.
3. Refactor `loans.new.tsx`, `loans.$id.tsx`, `LoanEvaluation.tsx`, disbursement page, approvals page to use application IDs.
4. Typecheck.

## Out of scope (call out for later)
- Version comparison UI for evaluation snapshots.
- Application → application clone (re-application).
- Migration of write-off / reschedule records into origination history (they belong to servicing).
