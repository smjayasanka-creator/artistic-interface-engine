ALTER TABLE public.savings_product
  ADD COLUMN IF NOT EXISTS cash_account_id uuid REFERENCES public.gl_account(id),
  ADD COLUMN IF NOT EXISTS deposit_liability_account_id uuid REFERENCES public.gl_account(id),
  ADD COLUMN IF NOT EXISTS fee_income_account_id uuid REFERENCES public.gl_account(id),
  ADD COLUMN IF NOT EXISTS interest_expense_account_id uuid REFERENCES public.gl_account(id);