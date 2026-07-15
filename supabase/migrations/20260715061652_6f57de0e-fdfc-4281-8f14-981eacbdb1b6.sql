CREATE TABLE public.screening_config (
  company_id uuid PRIMARY KEY REFERENCES public.company(id) ON DELETE CASCADE,
  tier1_min_score numeric(6,2) NOT NULL DEFAULT 60,
  tier2_min_score numeric(6,2) NOT NULL DEFAULT 85,
  auto_escalate_direct boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screening_config TO authenticated;
GRANT ALL ON public.screening_config TO service_role;
ALTER TABLE public.screening_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "screening_config company members" ON public.screening_config
  FOR ALL TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));
CREATE TRIGGER trg_screening_config_updated BEFORE UPDATE ON public.screening_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();