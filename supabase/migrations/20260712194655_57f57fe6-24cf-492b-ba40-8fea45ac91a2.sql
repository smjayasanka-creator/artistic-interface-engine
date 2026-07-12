
-- Security type & delegation authority for administration setup

CREATE TABLE public.security_type (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('movable','immovable')),
  kind text NOT NULL CHECK (kind IN ('machinery','vehicle','property','gold','deposit')),
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_type TO authenticated;
GRANT ALL ON public.security_type TO service_role;
ALTER TABLE public.security_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read security_type" ON public.security_type
  FOR SELECT USING (is_company_member(company_id));
CREATE POLICY "admins write security_type" ON public.security_type
  FOR ALL USING (is_company_admin(company_id)) WITH CHECK (is_company_admin(company_id));

CREATE TRIGGER security_type_set_updated_at
  BEFORE UPDATE ON public.security_type
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.delegation_authority (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  name text NOT NULL,
  security_type_id uuid NOT NULL REFERENCES public.security_type(id) ON DELETE RESTRICT,
  ltv_min numeric(6,2) NOT NULL DEFAULT 0,
  ltv_max numeric(6,2) NOT NULL DEFAULT 0,
  amount_min numeric(18,2) NOT NULL DEFAULT 0,
  amount_max numeric(18,2) NOT NULL DEFAULT 0,
  rate_min numeric(6,3) NOT NULL DEFAULT 0,
  rate_max numeric(6,3) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name),
  CHECK (ltv_min <= ltv_max),
  CHECK (amount_min <= amount_max),
  CHECK (rate_min <= rate_max)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delegation_authority TO authenticated;
GRANT ALL ON public.delegation_authority TO service_role;
ALTER TABLE public.delegation_authority ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read delegation_authority" ON public.delegation_authority
  FOR SELECT USING (is_company_member(company_id));
CREATE POLICY "admins write delegation_authority" ON public.delegation_authority
  FOR ALL USING (is_company_admin(company_id)) WITH CHECK (is_company_admin(company_id));

CREATE TRIGGER delegation_authority_set_updated_at
  BEFORE UPDATE ON public.delegation_authority
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
