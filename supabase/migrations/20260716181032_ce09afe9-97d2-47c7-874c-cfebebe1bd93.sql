ALTER TABLE public.loan_charge
  ADD COLUMN IF NOT EXISTS capitalize boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capitalized_receivable_account_id uuid REFERENCES public.gl_account(id);

ALTER TABLE public.loan_charge
  DROP CONSTRAINT IF EXISTS loan_charge_capitalize_account_chk;
ALTER TABLE public.loan_charge
  ADD CONSTRAINT loan_charge_capitalize_account_chk
  CHECK (capitalize = false OR capitalized_receivable_account_id IS NOT NULL);

ALTER TABLE public.loan_applied_charge
  ADD COLUMN IF NOT EXISTS capitalize boolean NOT NULL DEFAULT false;