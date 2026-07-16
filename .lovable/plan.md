## What changes

Loan charges get an optional **Capitalize** setting. When a capitalizable charge is applied to a loan, the user can toggle it on. If on, the charge is **not collected upfront** and **not added to the disbursement amount** — but it **is added to the amortization base** so the customer's rentals slightly increase. On each due rental, the capital portion attributable to capitalized charges is reclassified from the *Capitalized-charges receivable* GL to the normal *Loan receivable* GL.

## Database (one migration)

`public.loan_charge`
- add `capitalize boolean not null default false`
- add `capitalized_receivable_account_id uuid null references gl_account(id)` — asset GL debited at disbursement for capitalized amounts; credited as rentals fall due.
- CHECK: when `capitalize = true`, `capitalized_receivable_account_id` must be set.

`public.loan_applied_charge`
- add `capitalize boolean not null default false` — records the per-loan decision.

## Charge setup — `LoanChargesTab.tsx`

In the charge modal:
- New checkbox **Capitalize to loan capital**.
- When on, show a required **Capitalized-charges receivable ledger** dropdown (asset GLs).
- Grid gets a small "Cap." indicator column.

`upsertLoanCharge` / `listLoanCharges` server fns extended with the two new fields (Zod validated; capitalized receivable required when `capitalize=true`).

## Loan creation — `loans.new.tsx`

For each product-mapped charge that has `capitalize=true` on the master, show an extra **Capitalize** toggle next to the row (default on; disabled/unchecked for non-capitalizable charges — behavior unchanged for those).

Summary strip near the schedule shows:
- Disbursement amount (= principal, unchanged)
- Capitalized charges total
- **Amortization base** = principal + capitalized total

Schedule generator receives `principal + capitalizedTotal` as its principal, so:
- Rentals reflect the higher base
- Interest is computed on the combined base
- Disbursement/loan amount displayed to customer is still the raw principal

`submitApplication` persists each applied charge with its `capitalize` flag. Non-capitalized charges behave exactly as today (unchanged).

## Ledger reclass (schema + hook, not RPC internals)

The per-rental reclass entry
```
DR  loan receivable        (capital-portion-of-charges)
CR  capitalized receivable (capital-portion-of-charges)
```
belongs inside the accrual/rental-due posting logic. Since `record_repayment` / accrual are hardened Postgres RPCs owned by the backend, this migration lays down the accounts and per-loan `capitalize` flag they need; the actual reclass posting is a follow-up when the accrual RPC is next revised. The front-end passes the data through so nothing else needs to change when that RPC is updated.

## Not changing

- Disbursement amount / how disbursement is posted.
- Non-capitalized charge flow (upfront collect).
- `loan.principal` column value — it stays as the disbursed principal; the schedule math uses the augmented base internally without altering the stored principal.
- `disburse_loan` / `record_repayment` RPC bodies (they live in the backend and are out of scope for this frontend-facing change).

## Files touched

- new migration under `supabase/migrations/`
- `src/lib/loan-charges.functions.ts`
- `src/components/mzizi/LoanChargesTab.tsx`
- `src/lib/mzizi.functions.ts` (extend `submitApplication` input to accept `capitalize` per applied charge)
- `src/routes/_authenticated/loans.new.tsx` (per-charge capitalize toggle + amortization base wiring)
