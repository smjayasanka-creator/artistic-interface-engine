
CREATE TABLE public.loan_alco_rate_proposal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.loan_product(id) ON DELETE CASCADE,
  security_type_id UUID REFERENCES public.security_type(id) ON DELETE SET NULL,
  equipment_vehicle TEXT,
  min_rate NUMERIC(6,3) NOT NULL,
  max_rate NUMERIC(6,3) NOT NULL,
  min_period_months INTEGER NOT NULL,
  max_period_months INTEGER NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','declined','cancelled')),
  workflow_instance_id UUID REFERENCES public.workflow_instance(id) ON DELETE SET NULL,
  created_by UUID NOT NULL,
  applied_at TIMESTAMPTZ,
  applied_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_alco_rate_proposal TO authenticated;
GRANT ALL ON public.loan_alco_rate_proposal TO service_role;

ALTER TABLE public.loan_alco_rate_proposal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_alco_rate_proposal_company_read"
  ON public.loan_alco_rate_proposal FOR SELECT
  TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "loan_alco_rate_proposal_company_write"
  ON public.loan_alco_rate_proposal FOR ALL
  TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

CREATE TRIGGER update_loan_alco_rate_proposal_updated_at
  BEFORE UPDATE ON public.loan_alco_rate_proposal
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_loan_alco_rate_proposal_company_status
  ON public.loan_alco_rate_proposal(company_id, status, created_at DESC);
