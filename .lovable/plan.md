## Change

Add a **segment** classification to savings products: **Normal Savings**, **Minor Savings**, **Senior Savings**, **Fixed Savings**, **Transaction Account**. When creating a savings account, the user picks a segment first, then only sees products in that segment.

## Backend

Migration on `savings_product`:
- Add `segment text not null default 'normal'` with a check constraint restricting to `normal | minor | senior | fixed | transaction`.
- Backfill existing rows to `'normal'`.
- Index `(company_id, segment, active)`.

Server functions (`src/lib/savings.functions.ts`):
- `listSavingsProducts` — include `segment` in the returned columns.
- `upsertSavingsProduct` — accept `segment` in the Zod input validator (default `'normal'`) and persist it.

## Frontend

**Savings products form** (`src/components/mzizi/SavingsProductsTab.tsx`):
- Add a required **Segment** dropdown to the product modal.
- Show segment as a column in the product list.

**New savings account page** (`src/routes/_authenticated/savings.new.tsx`):
- Add a **Segment** selector above the product picker.
- Filter the product dropdown to active products matching the selected segment.
- Segment is derived from the chosen product — nothing new is written to `savings_account`.

## Not changing

- `savings_account` schema, GL mapping, and transactions are untouched.
- Existing products default to "Normal Savings" and can be reclassified via the edit form.
