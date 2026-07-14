
CREATE TABLE public.loan_alco_rate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.loan_product(id) ON DELETE CASCADE,
  security_type_id uuid REFERENCES public.security_type(id) ON DELETE SET NULL,
  equipment_vehicle text,
  min_rate numeric(6,3) NOT NULL CHECK (min_rate >= 0 AND min_rate <= 100),
  max_rate numeric(6,3) NOT NULL CHECK (max_rate >= 0 AND max_rate <= 100),
  min_period_months integer NOT NULL CHECK (min_period_months >= 0),
  max_period_months integer NOT NULL CHECK (max_period_months >= min_period_months),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_rate >= min_rate)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_alco_rate TO authenticated;
GRANT ALL ON public.loan_alco_rate TO service_role;

ALTER TABLE public.loan_alco_rate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_alco_rate members read"
  ON public.loan_alco_rate FOR SELECT
  TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "loan_alco_rate admins manage"
  ON public.loan_alco_rate FOR ALL
  TO authenticated
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE TRIGGER trg_loan_alco_rate_updated_at
  BEFORE UPDATE ON public.loan_alco_rate
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX loan_alco_rate_company_product_idx
  ON public.loan_alco_rate(company_id, product_id) WHERE active;
