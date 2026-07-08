
# Mzizi Core — Full Build Plan

A microfinance core banking app for loan officers: 10 screens + modals, backed by Lovable Cloud (Postgres + auth), with a double-entry ledger at the heart of it. Design faithfully recreated from the `.dc.html` prototype (teal `#0f766e`, IBM Plex Sans/Mono, dense operations-console layout).

## Phase 1 — Backend (Lovable Cloud)

Enable Cloud, then ship the schema adapted from `schema.sql` (Postgres-friendly, RLS-safe).

**Tables (public schema, RLS on, GRANTs to authenticated/service_role):**
- `branch`, `staff` (staff linked to `auth.users`)
- `app_role` enum + `user_roles` table + `has_role()` security-definer fn (roles: `loan_officer`, `branch_manager`, `admin`)
- `client` (KYC + status), `group` (`grp`), `group_member`
- `loan_product`, `loan`, `loan_transition`, `installment`
- `savings_account`, `savings_txn`
- `gl_account` (chart of accounts, seeded), `journal_entry`, `posting` (deferred trigger enforces DR=CR)
- `payment` (repayments)
- `audit_log`
- Views: `v_account_balance`, `v_loan_outstanding`, `v_savings_balance`, `v_par_aging`

**RLS model:** all reads/writes gated to authenticated staff. Admin-only for `branch`/`staff` writes and `gl_account`. Officers can post repayments and create draft/submitted loans; branch managers can approve.

**Seed data (migration):** one branch (Kawangware), one demo staff (Amina Okoth linked to first admin signup via trigger), a handful of clients/groups/loans/installments, and the standard chart of accounts. Also seed a few pending approvals so the dashboard has content.

## Phase 2 — Auth

- Cloud Auth: email/password + Google.
- `/auth` route (sign in + sign up).
- Integration-managed `_authenticated` gate protects all app routes.
- Trigger on `auth.users` insert → create `staff` row + assign default `loan_officer` role (first signup gets `admin`).
- Top-bar user chip + sign-out.

## Phase 3 — Design system

- Install `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`.
- Update `src/styles.css` with tokens from the README (teal primary, rail dark `#0c1f24`, semantic status/risk/debit/credit colors, radii, shadows). All semantic — no hardcoded hex in components.
- Shared primitives: `Card`, `Kpi`, `Badge` (status/risk), `Money` (mono), `Avatar` (initials + color), `ProgressBar`, `Toast`, `Modal`.

## Phase 4 — Shell & routes

Persistent shell: 232px dark rail + 60px top bar + scroll area. All routes under `_authenticated`.

```text
_authenticated/route.tsx        (managed gate)
_authenticated/layout.tsx       (rail + topbar + Outlet)
  index.tsx                     → /dashboard redirect
  dashboard.tsx                 → screen 1
  clients.index.tsx             → screen 2
  clients.$id.tsx               → screen 3 (Client 360)
  loans.index.tsx               → screen 4
  loans.new.tsx                 → screen 5 (wizard)
  collections.tsx               → screen 6
  groups.index.tsx              → screen 7
  groups.$id.tsx                → group detail
  reports.tsx                   → screen 8
  ledger.tsx                    → screen 9
  admin.tsx                     → screen 10 (branch_manager+ only)
auth.tsx                        (public)
```

## Phase 5 — Screens (server functions + TanStack Query)

All data access through `createServerFn` + `requireSupabaseAuth`. Loader pattern: `ensureQueryData` → `useSuspenseQuery`. Money as strings from Postgres numeric, formatted with `Intl.NumberFormat('en-KE', { style:'currency', currency:'KES' })`.

Screen-by-screen (matches README composition exactly — same KPI counts, column layouts, card structures, badge colors, progress bars):

1. **Dashboard** — 5 KPI cards, PAR aging bars + today's meetings row, pending approvals table with Approve/Decline. Approve triggers `approved → disbursed` transition + disbursement journal entry via a server fn.
2. **Clients** — filter chips + table + `New client` KYC modal (creates `pending_kyc` client).
3. **Client 360** — header, 4 stats, active loan card w/ progress + installment schedule, activity timeline.
4. **Loans** — full portfolio table with inline progress bars, overdue highlighting.
5. **New application wizard** — 3-step (Client / Product+amount / Review) → creates `draft`→`submitted` loan and enqueues approval.
6. **Collections** — dark gradient hero (today's total + target progress), 2-col groups-due / recorded-today feed, Record repayment modal that posts a balanced journal entry.
7. **Groups** — 2-col group cards with PAR badge and mini-stats.
8. **Reports & analytics** — 2 bar charts (disbursement, PAR trend) + portfolio-by-product table.
9. **General ledger** — account filter chips + journal table (debit red / credit teal, mono) with totals row.
10. **Administration** — branch summary card + staff table (gated to `branch_manager`/`admin`).

Global modals: **Record repayment**, **New client/KYC**, bottom-center **toast**.

## Phase 6 — Ledger correctness

Business events are wrapped in server-side RPCs that write balanced journal entries:
- `post_disbursement(loan_id)` — DR Loans receivable / CR Cash
- `post_repayment(loan_id, amount, channel)` — DR Cash / CR Loans receivable + CR Interest income
- `post_savings_deposit(account_id, amount, channel)` — DR Bank float / CR Member savings

The `posting`-balance trigger from `schema.sql` guarantees each entry is balanced before commit. Balances always read from the `v_*` views.

## Phase 7 — SEO / metadata

Real `head()` on `__root.tsx`: title "Mzizi Core — Microfinance Operations", description, og/twitter. Each authenticated screen keeps a route-specific title.

## Technical Notes

- **Stack:** TanStack Start (existing), TanStack Query, Lovable Cloud (Supabase under the hood).
- **Money:** Postgres `NUMERIC(18,2)`; strings on the wire; formatted at the edge with `Intl.NumberFormat`. Never `number`.
- **Approvals badge** in nav rail derived from live pending-loan count (Query).
- **Toast** via a simple context + portal (no shadcn Sonner dependency needed but fine to use).
- **Charts** in Reports built with plain divs (matches prototype's explicit-pixel bar style — no Recharts needed).
- **Icons:** Lucide, stroke-matched to the prototype's SVGs.
- **Not in scope for v1:** offline PWA, mobile field app, M-Pesa live integration (channel captured but not connected), CSV export, multi-branch switcher (single branch), i18n.

## Deliverable order

1. Enable Cloud → run schema migration + seed
2. Auth (`/auth` + role trigger) + `_authenticated` gate
3. Design tokens + fonts + shared primitives
4. Shell (rail + topbar) with nav
5. Dashboard end-to-end (proves the data pattern)
6. Remaining screens
7. Modals + toast + ledger RPCs wired to Approve/Repayment
8. Metadata + polish pass

I'll implement this straight through once you approve. This is a large plan; expect multiple turns.
