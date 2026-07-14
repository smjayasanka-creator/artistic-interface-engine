## Change

Remove the **Cash / Bank account** mapping from the savings product form. Cash GL selection will happen at transaction time (deposit/withdrawal), not at product setup.

## Scope

**Frontend only** — `src/components/mzizi/SavingsProductsTab.tsx`:
- Remove the `cash_account_id` field from the `EMPTY` defaults and the edit-modal state hydration.
- Remove the "Cash / Bank account" `FormField` from the GL mapping section (keep Deposit liability, Fee income, Interest expense).
- Update the helper text under "GL account mapping" to drop the "1000 cash" reference.
- Drop `cash_account_id` from the `ProductRow` type used in this component.

## Not changing

- DB column `savings_product.cash_account_id` stays (harmless, keeps existing data). Existing values are simply no longer editable from this form.
- Server function `upsertSavingsProduct` is untouched — omitted field just won't be sent/updated.
- Transaction-time cash account resolution is already handled elsewhere and is not modified here.
