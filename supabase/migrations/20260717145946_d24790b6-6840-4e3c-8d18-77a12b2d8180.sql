
-- Tier 1 (fx-policy): FX rate table with effective-dated history for revaluation & audit reproducibility.
CREATE TABLE public.fx_rate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric(18,8) NOT NULL CHECK (rate > 0),
  rate_type text NOT NULL DEFAULT 'mid' CHECK (rate_type IN ('mid','buy','sell','revaluation')),
  source text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_currency <> to_currency),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX fx_rate_lookup_idx ON public.fx_rate (company_id, from_currency, to_currency, rate_type, valid_from DESC);
CREATE UNIQUE INDEX fx_rate_active_uidx ON public.fx_rate (company_id, from_currency, to_currency, rate_type)
  WHERE valid_to IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fx_rate TO authenticated;
GRANT ALL ON public.fx_rate TO service_role;

ALTER TABLE public.fx_rate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read company FX rates"
  ON public.fx_rate FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "Company admins manage FX rates"
  ON public.fx_rate FOR ALL TO authenticated
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE TRIGGER trg_fx_rate_set_updated_at
  BEFORE UPDATE ON public.fx_rate
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
