
-- ============ ENUMS ============
CREATE TYPE public.fd_payout_option AS ENUM ('monthly','at_maturity');
CREATE TYPE public.fd_penalty_type AS ENUM ('rate_reduction','reprice_minus_margin');
CREATE TYPE public.fd_maturity_instruction AS ENUM ('payout','renew_principal','renew_principal_interest');
CREATE TYPE public.fd_status AS ENUM ('pending','active','matured','prematurely_closed','renewed');
CREATE TYPE public.fd_txn_type AS ENUM ('opening','interest_payout','premature_closure','maturity_payout','renewal');

-- ============ fd_product ============
CREATE TABLE public.fd_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  min_amount numeric(18,2) NOT NULL DEFAULT 0,
  max_amount numeric(18,2),
  allow_monthly boolean NOT NULL DEFAULT true,
  allow_at_maturity boolean NOT NULL DEFAULT true,
  penalty_type public.fd_penalty_type NOT NULL DEFAULT 'rate_reduction',
  penalty_value numeric(6,3) NOT NULL DEFAULT 1.000,
  wht_rate numeric(6,3) NOT NULL DEFAULT 5.000,
  auto_renewal_default public.fd_maturity_instruction NOT NULL DEFAULT 'payout',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fd_product TO authenticated;
GRANT ALL ON public.fd_product TO service_role;
ALTER TABLE public.fd_product ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fd_product company members read"  ON public.fd_product FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "fd_product admins write"          ON public.fd_product FOR ALL   TO authenticated USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));
CREATE TRIGGER trg_fd_product_updated BEFORE UPDATE ON public.fd_product FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ fd_rate_tier ============
CREATE TABLE public.fd_rate_tier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.fd_product(id) ON DELETE CASCADE,
  tenure_months integer NOT NULL CHECK (tenure_months > 0),
  annual_rate numeric(7,4) NOT NULL CHECK (annual_rate >= 0),
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.fd_rate_tier (product_id, tenure_months, effective_from);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fd_rate_tier TO authenticated;
GRANT ALL ON public.fd_rate_tier TO service_role;
ALTER TABLE public.fd_rate_tier ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fd_rate_tier read"  ON public.fd_rate_tier FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.fd_product p WHERE p.id = product_id AND public.is_company_member(p.company_id)));
CREATE POLICY "fd_rate_tier write" ON public.fd_rate_tier FOR ALL   TO authenticated USING (EXISTS (SELECT 1 FROM public.fd_product p WHERE p.id = product_id AND public.is_company_admin(p.company_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.fd_product p WHERE p.id = product_id AND public.is_company_admin(p.company_id)));

-- ============ fd_number_seq ============
CREATE TABLE public.fd_number_seq (
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  period text NOT NULL,   -- YYYYMM
  last_no integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, period)
);
GRANT SELECT, INSERT, UPDATE ON public.fd_number_seq TO authenticated;
GRANT ALL ON public.fd_number_seq TO service_role;
ALTER TABLE public.fd_number_seq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fd_number_seq members" ON public.fd_number_seq FOR ALL TO authenticated USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));

CREATE OR REPLACE FUNCTION public.next_fd_certificate_no(_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _period text; _next int;
BEGIN
  _period := to_char(now(), 'YYYYMM');
  INSERT INTO public.fd_number_seq (company_id, period, last_no)
    VALUES (_company_id, _period, 1)
    ON CONFLICT (company_id, period)
    DO UPDATE SET last_no = public.fd_number_seq.last_no + 1
  RETURNING last_no INTO _next;
  RETURN 'FD-' || _period || '-' || lpad(_next::text, 5, '0');
END $$;

-- ============ fixed_deposit ============
CREATE TABLE public.fixed_deposit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_no text NOT NULL UNIQUE,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branch(id),
  client_id uuid NOT NULL REFERENCES public.client(id),
  product_id uuid NOT NULL REFERENCES public.fd_product(id),
  principal numeric(18,2) NOT NULL CHECK (principal > 0),
  rate_at_booking numeric(7,4) NOT NULL,
  wht_rate_at_booking numeric(6,3) NOT NULL,
  tenure_months integer NOT NULL CHECK (tenure_months > 0),
  payout_option public.fd_payout_option NOT NULL,
  settlement_account uuid REFERENCES public.gl_account(id),
  maturity_instruction public.fd_maturity_instruction NOT NULL,
  value_date date NOT NULL,
  maturity_date date NOT NULL,
  status public.fd_status NOT NULL DEFAULT 'pending',
  parent_fd_id uuid REFERENCES public.fixed_deposit(id),
  created_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  closed_at timestamptz,
  close_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.fixed_deposit (company_id, status);
CREATE INDEX ON public.fixed_deposit (maturity_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_deposit TO authenticated;
GRANT ALL ON public.fixed_deposit TO service_role;
ALTER TABLE public.fixed_deposit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fd read"    ON public.fixed_deposit FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "fd insert"  ON public.fixed_deposit FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "fd update"  ON public.fixed_deposit FOR UPDATE TO authenticated USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "fd delete admin" ON public.fixed_deposit FOR DELETE TO authenticated USING (public.is_company_admin(company_id));
CREATE TRIGGER trg_fd_updated BEFORE UPDATE ON public.fixed_deposit FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ fd_interest_schedule ============
CREATE TABLE public.fd_interest_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id uuid NOT NULL REFERENCES public.fixed_deposit(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  due_date date NOT NULL,
  gross_interest numeric(18,2) NOT NULL,
  wht_amount numeric(18,2) NOT NULL,
  net_interest numeric(18,2) NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  paid_date date,
  UNIQUE (deposit_id, seq)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fd_interest_schedule TO authenticated;
GRANT ALL ON public.fd_interest_schedule TO service_role;
ALTER TABLE public.fd_interest_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fd_sched all" ON public.fd_interest_schedule FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fixed_deposit d WHERE d.id = deposit_id AND public.is_company_member(d.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fixed_deposit d WHERE d.id = deposit_id AND public.is_company_member(d.company_id)));

-- ============ fd_accrual ============
CREATE TABLE public.fd_accrual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id uuid NOT NULL REFERENCES public.fixed_deposit(id) ON DELETE CASCADE,
  accrual_date date NOT NULL,
  daily_amount numeric(18,4) NOT NULL,
  cumulative_amount numeric(18,4) NOT NULL,
  UNIQUE (deposit_id, accrual_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fd_accrual TO authenticated;
GRANT ALL ON public.fd_accrual TO service_role;
ALTER TABLE public.fd_accrual ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fd_accr all" ON public.fd_accrual FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fixed_deposit d WHERE d.id = deposit_id AND public.is_company_member(d.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fixed_deposit d WHERE d.id = deposit_id AND public.is_company_member(d.company_id)));

-- ============ fd_transaction ============
CREATE TABLE public.fd_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id uuid NOT NULL REFERENCES public.fixed_deposit(id) ON DELETE CASCADE,
  type public.fd_txn_type NOT NULL,
  amount numeric(18,2) NOT NULL,
  txn_date date NOT NULL,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fd_transaction TO authenticated;
GRANT ALL ON public.fd_transaction TO service_role;
ALTER TABLE public.fd_transaction ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fd_txn all" ON public.fd_transaction FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fixed_deposit d WHERE d.id = deposit_id AND public.is_company_member(d.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fixed_deposit d WHERE d.id = deposit_id AND public.is_company_member(d.company_id)));

-- ============ fd_nominee ============
CREATE TABLE public.fd_nominee (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id uuid NOT NULL REFERENCES public.fixed_deposit(id) ON DELETE CASCADE,
  name text NOT NULL,
  nic text,
  relationship text,
  percentage numeric(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fd_nominee TO authenticated;
GRANT ALL ON public.fd_nominee TO service_role;
ALTER TABLE public.fd_nominee ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fd_nom all" ON public.fd_nominee FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fixed_deposit d WHERE d.id = deposit_id AND public.is_company_member(d.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fixed_deposit d WHERE d.id = deposit_id AND public.is_company_member(d.company_id)));
