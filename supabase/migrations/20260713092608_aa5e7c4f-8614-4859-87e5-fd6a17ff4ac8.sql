
-- Add ALCO rate columns to fd_product
ALTER TABLE public.fd_product
  ADD COLUMN IF NOT EXISTS standard_rate numeric(7,4),
  ADD COLUMN IF NOT EXISTS maximum_rate numeric(7,4),
  ADD COLUMN IF NOT EXISTS cbsl_max_rate numeric(7,4);

-- ALCO rate proposal header
CREATE TABLE IF NOT EXISTS public.alco_rate_proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  workflow_instance_id uuid REFERENCES public.workflow_instance(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','cancelled','applied')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  applied_at timestamptz,
  applied_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alco_rate_proposal_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.alco_rate_proposal(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.fd_product(id) ON DELETE CASCADE,
  old_standard_rate numeric(7,4),
  old_maximum_rate numeric(7,4),
  old_cbsl_max_rate numeric(7,4),
  new_standard_rate numeric(7,4),
  new_maximum_rate numeric(7,4),
  new_cbsl_max_rate numeric(7,4),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alco_rate_proposal TO authenticated;
GRANT ALL ON public.alco_rate_proposal TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alco_rate_proposal_item TO authenticated;
GRANT ALL ON public.alco_rate_proposal_item TO service_role;

ALTER TABLE public.alco_rate_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alco_rate_proposal_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alco_rate_proposal read" ON public.alco_rate_proposal
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "alco_rate_proposal write" ON public.alco_rate_proposal
  FOR ALL TO authenticated USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));

CREATE POLICY "alco_rate_proposal_item read" ON public.alco_rate_proposal_item
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.alco_rate_proposal p WHERE p.id = alco_rate_proposal_item.proposal_id AND public.is_company_member(p.company_id)
  ));
CREATE POLICY "alco_rate_proposal_item write" ON public.alco_rate_proposal_item
  FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM public.alco_rate_proposal p WHERE p.id = alco_rate_proposal_item.proposal_id AND public.is_company_member(p.company_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.alco_rate_proposal p WHERE p.id = alco_rate_proposal_item.proposal_id AND public.is_company_member(p.company_id)
  ));

CREATE TRIGGER trg_alco_proposal_updated BEFORE UPDATE ON public.alco_rate_proposal
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
