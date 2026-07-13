ALTER TABLE public.fd_product
  ADD COLUMN capital_account_id uuid REFERENCES public.gl_account(id),
  ADD COLUMN interest_payable_account_id uuid REFERENCES public.gl_account(id),
  ADD COLUMN interest_expense_account_id uuid REFERENCES public.gl_account(id),
  ADD COLUMN wht_payable_account_id uuid REFERENCES public.gl_account(id),
  ADD COLUMN introducer_commission_account_id uuid REFERENCES public.gl_account(id),
  ADD COLUMN marketing_incentive_account_id uuid REFERENCES public.gl_account(id);