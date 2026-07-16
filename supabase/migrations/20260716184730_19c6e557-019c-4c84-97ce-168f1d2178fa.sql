ALTER TABLE public.loan_charge DROP CONSTRAINT IF EXISTS loan_charge_outside_supplier_chk;

ALTER TABLE public.loan_applied_charge
  ADD COLUMN IF NOT EXISTS supplier_client_id uuid NULL REFERENCES public.client(id);