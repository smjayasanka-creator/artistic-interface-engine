
ALTER TABLE public.loan_product
  ADD COLUMN IF NOT EXISTS principal_account_id uuid REFERENCES public.gl_account(id),
  ADD COLUMN IF NOT EXISTS cash_account_id uuid REFERENCES public.gl_account(id),
  ADD COLUMN IF NOT EXISTS interest_income_account_id uuid REFERENCES public.gl_account(id),
  ADD COLUMN IF NOT EXISTS fee_income_account_id uuid REFERENCES public.gl_account(id);

UPDATE public.loan_product SET
  principal_account_id = COALESCE(principal_account_id, (SELECT id FROM public.gl_account WHERE code = '1100' LIMIT 1)),
  cash_account_id = COALESCE(cash_account_id, (SELECT id FROM public.gl_account WHERE code = '1000' LIMIT 1)),
  interest_income_account_id = COALESCE(interest_income_account_id, (SELECT id FROM public.gl_account WHERE code = '4000' LIMIT 1));
