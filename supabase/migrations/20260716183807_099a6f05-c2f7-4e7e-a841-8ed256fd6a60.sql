ALTER TABLE public.loan_charge ALTER COLUMN charge_type DROP DEFAULT;
ALTER TABLE public.loan_charge ALTER COLUMN charge_type TYPE text;
DROP TYPE public.loan_charge_type;
CREATE TYPE public.loan_charge_type AS ENUM ('fixed','variable','manual');
ALTER TABLE public.loan_charge
  ALTER COLUMN charge_type TYPE public.loan_charge_type USING charge_type::public.loan_charge_type;
ALTER TABLE public.loan_charge ALTER COLUMN charge_type SET DEFAULT 'fixed';

ALTER TABLE public.loan_charge
  ADD COLUMN IF NOT EXISTS supplier_client_id uuid NULL REFERENCES public.client(id);

ALTER TABLE public.loan_charge
  DROP CONSTRAINT IF EXISTS loan_charge_outside_supplier_chk;
ALTER TABLE public.loan_charge
  ADD CONSTRAINT loan_charge_outside_supplier_chk
  CHECK (origin <> 'outside' OR supplier_client_id IS NOT NULL) NOT VALID;