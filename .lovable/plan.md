
# Multi-Tenant SaaS Conversion

Turn Mzizi Core from a single-org app into a SaaS where each signup creates their own **Company (workspace)** and all data (clients, loans, branches, staff, ledger, etc.) is scoped to that company. Users can invite teammates and manage their company's settings.

## What changes for the user

1. **Signup flow** — new users provide a Company name (+ currency/country). They become that company's **Owner**.
2. **Company switcher** — top-right of the header shows the current company; users belonging to multiple companies can switch.
3. **Team management** — new Admin → Team tab: invite users by email, assign role (owner / admin / loan_officer / accountant / viewer), remove members.
4. **Company Settings** — the existing General Settings (currency, FY end, country) become **per-company**, stored in DB (not localStorage). Add: company name, timezone, logo (optional later).
5. **All data isolated per company** — every list (clients, loans, groups, journal, payments, reports) automatically filtered to the active company. No cross-tenant leaks.

## Technical Section

### New tables

- `company` — `id, name, slug, currency, country, fy_end_month, fy_end_day, timezone, created_at, owner_user_id`
- `company_member` — `id, company_id, user_id, role (owner|admin|loan_officer|accountant|viewer), created_at`, unique `(company_id, user_id)`
- `company_invite` — `id, company_id, email, role, token, invited_by, expires_at, accepted_at`

### Schema migration (existing tables)

Add `company_id uuid not null references company(id) on delete cascade` to: `branch`, `client`, `loan`, `loan_product`, `lending_group`, `staff`, `journal_entry`, `posting`, `repayment`, `loan_installment`, `gl_account`. Backfill: create a default "Default Company" and assign all existing rows + all existing users as members (owner = first admin).

### RLS

Replace/augment every policy with `company_id in (select company_id from company_member where user_id = auth.uid())`. Add a `current_company_id()` SECURITY DEFINER helper that reads the user's active company from a session claim OR from a `user_active_company (user_id, company_id)` table (simpler — use table). Update `has_role` to `has_role(_user_id, _company_id, _role)`.

### Auth / signup

- New `handle_new_user` trigger: DO NOT auto-create staff/company. Signup UI collects company name → RPC `create_company_and_join(name, currency, country)` runs after auth, inserts company + company_member(owner) + default branch + seeds GL accounts + sets active company.
- Google OAuth users land on `/onboarding` if they have no company memberships.

### Server functions

- New `getCurrentCompany`, `listMyCompanies`, `switchCompany(companyId)`, `updateCompanySettings`, `inviteMember`, `acceptInvite(token)`, `listMembers`, `updateMemberRole`, `removeMember`.
- Every existing server fn in `src/lib/mzizi.functions.ts` gets a `.company_id` filter derived from `current_company_id()` (either via RLS automatically, or explicit `.eq("company_id", ctx.companyId)`).

### UI

- `/onboarding` route (create first company).
- `/auth` signup form: add Company name field.
- `AppShell`: company switcher dropdown replacing the static "Branch" pill (branch becomes a sub-selector).
- `admin.tsx`: new **Team** tab (invite + members list) and **Company** tab (name, currency, country, FY end, timezone) — replaces localStorage settings.
- `/invite/:token` route to accept invites.

### Route architecture

Add pathless layout `_authenticated/_company/` that ensures the user has an active company; else redirects to `/onboarding`. All existing authenticated pages move under it (or we resolve company in the shell and redirect there).

### Migration order

1. Create `company`, `company_member`, `user_active_company`, `company_invite` + grants + RLS.
2. Add `company_id` (nullable) to all domain tables + backfill Default Company + set NOT NULL.
3. Rewrite RLS policies for all domain tables to use company membership.
4. Update `handle_new_user`, add `create_company_and_join` RPC, add `current_company_id()`.
5. Server functions + UI (onboarding, switcher, team tab, company settings tab).
6. Remove localStorage general_settings; migrate to DB.

## Scope note

This is a substantial migration touching ~12 tables, ~all RLS policies, auth flow, and most UI pages. I'll do it in one coordinated change but wanted your sign-off first — especially on:

- **Roles** — keep the 5 roles listed above (owner/admin/loan_officer/accountant/viewer)?
- **Existing data** — OK to migrate all current data into one "Default Company" owned by the first existing admin user?
- **Company switcher** — one user can belong to multiple companies (recommended), or hard 1:1 user↔company?
