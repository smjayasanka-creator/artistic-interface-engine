# Configurable Loan Evaluation Sections

Make the Loan Evaluation page render only the sections enabled for the selected loan product, driven by two new configuration tables managed from Administration.

## Data model (new migration)

**`public.evaluation_section`** — master catalogue of available sections
- `code` (unique, e.g. `bdo`, `employment`, `existing_facility`, `business`)
- `name`, `description`
- `component_name` (React component key)
- `display_order`, `active`
- `fields` JSONB — array of `{ key, label, type, optional }` describing the fields inside the section (used to render the form dynamically and to power the "enabled fields" checklist on the mapping screen)

Seeded with the four sections from the spec (BDO Evaluation, Employment, Existing Facility, Business), each with its full field list. Future sections (Guarantor, Collateral, CRIB, etc.) can be inserted later without code changes.

**`public.loan_product_evaluation_section`** — per-product mapping
- `loan_product_id` → `loan_product.id`
- `section_id` → `evaluation_section.id`
- `is_visible` (default true), `is_mandatory` (default false)
- `display_order`
- `enabled_fields` JSONB — array of field keys enabled for this product (null = all fields)
- Unique on `(loan_product_id, section_id)`

**`public.loan_evaluation`** — per-loan captured evaluation data
- `loan_id` (unique) → `loan.id`
- `product_snapshot` JSONB — snapshot of the mapping active when the application was created (so existing applications retain their config)
- `data` JSONB — `{ [sectionCode]: { [fieldKey]: value } }`

All three tables: standard `company_id` scoping, GRANTs, RLS with company-scoped policies, `updated_at` trigger.

## Server functions

`src/lib/evaluation.functions.ts`:
- `listEvaluationSections()` — master list (admin)
- `getProductEvaluationConfig({ loan_product_id })` — mapping rows joined with sections
- `upsertProductEvaluationConfig({ loan_product_id, sections: [...] })` — replace mapping
- `getLoanEvaluation({ loan_id })` — returns `{ sections, data }` using snapshot if present, else current product config
- `saveLoanEvaluation({ loan_id, data })` — validates that all mandatory sections/fields are filled; on first save, writes `product_snapshot`

## Administration UI

New tab under `admin.tsx` group "Loan": **Loan Product Evaluation** (`src/components/mzizi/LoanProductEvaluationTab.tsx`)
- Left: list of loan products
- Right: for the selected product, a table of all sections with toggles: Visible, Mandatory, Display order, plus an expandable per-section field checklist (Enabled / Mandatory per field)
- "Save configuration" persists via `upsertProductEvaluationConfig`

## Loan Evaluation page

`src/components/mzizi/LoanEvaluation.tsx` — generic renderer
- Calls `getLoanEvaluation({ loan_id })`
- Iterates enabled sections in display order
- For each section, renders a `<EvaluationSection>` with fields from metadata (input types: text, textarea, number, date, select, currency)
- Validation: only visible sections; mandatory flag enforced
- Save button calls `saveLoanEvaluation`

Wire into `loans.$id.tsx` where evaluation currently lives (replace any hardcoded evaluation blocks with `<LoanEvaluation loanId={id} />`). Hidden sections are neither rendered nor validated.

## Snapshot behaviour
- On first save of a loan's evaluation, snapshot the current product config into `loan_evaluation.product_snapshot`.
- Subsequent loads for that loan use the snapshot, so mid-flight config changes don't disrupt in-progress applications. New applications always use the latest config.

## Future extensibility
Adding a new section (Guarantor, Collateral, CRIB, etc.) = insert a row into `evaluation_section` with its field metadata; it becomes assignable in Administration immediately, no code change. If a section needs a bespoke component beyond the generic renderer, register it by `component_name` in a small component registry map inside `LoanEvaluation.tsx`.

## Files touched
- New migration (tables + grants + RLS + seed rows for 4 sections)
- New: `src/lib/evaluation.functions.ts`
- New: `src/components/mzizi/LoanProductEvaluationTab.tsx`
- New: `src/components/mzizi/LoanEvaluation.tsx`
- Edit: `src/routes/_authenticated/admin.tsx` (register new tab under Loan group)
- Edit: `src/routes/_authenticated/loans.$id.tsx` (mount `<LoanEvaluation />`)
