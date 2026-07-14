
DO $$ BEGIN
  CREATE TYPE public.savings_charge_frequency AS ENUM ('one_time','monthly','annual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.savings_charge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount >= 0),
  frequency public.savings_charge_frequency NOT NULL DEFAULT 'one_time',
  income_account_id uuid NOT NULL REFERENCES public.gl_account(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX savings_charge_company_active_idx ON public.savings_charge(company_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_charge TO authenticated;
GRANT ALL ON public.savings_charge TO service_role;

ALTER TABLE public.savings_charge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view savings charges"
  ON public.savings_charge FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "Admins can manage savings charges"
  ON public.savings_charge FOR ALL TO authenticated
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE TRIGGER savings_charge_set_updated_at
  BEFORE UPDATE ON public.savings_charge
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.savings_charge_product (
  charge_id uuid NOT NULL REFERENCES public.savings_charge(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.savings_product(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (charge_id, product_id)
);
CREATE INDEX savings_charge_product_product_idx ON public.savings_charge_product(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_charge_product TO authenticated;
GRANT ALL ON public.savings_charge_product TO service_role;

ALTER TABLE public.savings_charge_product ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view savings charge products"
  ON public.savings_charge_product FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.savings_charge c WHERE c.id = charge_id AND public.is_company_member(c.company_id)));

CREATE POLICY "Admins can manage savings charge products"
  ON public.savings_charge_product FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.savings_charge c WHERE c.id = charge_id AND public.is_company_admin(c.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.savings_charge c WHERE c.id = charge_id AND public.is_company_admin(c.company_id)));
