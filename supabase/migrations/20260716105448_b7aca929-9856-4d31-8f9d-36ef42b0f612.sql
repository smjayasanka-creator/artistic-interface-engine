
-- Enums
DO $$ BEGIN
  CREATE TYPE public.loan_charge_origin AS ENUM ('inhouse','outside');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.loan_charge_type AS ENUM ('fixed','variable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- loan_charge
CREATE TABLE public.loan_charge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  name text NOT NULL,
  origin public.loan_charge_origin NOT NULL DEFAULT 'inhouse',
  charge_type public.loan_charge_type NOT NULL DEFAULT 'fixed',
  amount numeric(18,4) NOT NULL DEFAULT 0,
  receivable_account_id uuid NOT NULL REFERENCES public.gl_account(id),
  credit_account_id uuid NOT NULL REFERENCES public.gl_account(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX loan_charge_company_idx ON public.loan_charge(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_charge TO authenticated;
GRANT ALL ON public.loan_charge TO service_role;

ALTER TABLE public.loan_charge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_charge company read"
  ON public.loan_charge FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "loan_charge company write"
  ON public.loan_charge FOR ALL TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

CREATE TRIGGER loan_charge_updated
  BEFORE UPDATE ON public.loan_charge
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- loan_charge_product link
CREATE TABLE public.loan_charge_product (
  charge_id uuid NOT NULL REFERENCES public.loan_charge(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.loan_product(id) ON DELETE CASCADE,
  PRIMARY KEY (charge_id, product_id)
);
CREATE INDEX loan_charge_product_product_idx ON public.loan_charge_product(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_charge_product TO authenticated;
GRANT ALL ON public.loan_charge_product TO service_role;

ALTER TABLE public.loan_charge_product ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_charge_product company read"
  ON public.loan_charge_product FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loan_charge lc
    WHERE lc.id = charge_id AND public.is_company_member(lc.company_id)
  ));

CREATE POLICY "loan_charge_product company write"
  ON public.loan_charge_product FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loan_charge lc
    WHERE lc.id = charge_id AND public.is_company_member(lc.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loan_charge lc
    WHERE lc.id = charge_id AND public.is_company_member(lc.company_id)
  ));
