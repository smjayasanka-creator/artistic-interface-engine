
-- Evaluation section master (global; per-company overrides not needed at master level)
CREATE TABLE public.evaluation_section (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.company(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  component_name TEXT NOT NULL DEFAULT 'generic',
  display_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_section TO authenticated;
GRANT ALL ON public.evaluation_section TO service_role;
ALTER TABLE public.evaluation_section ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eval_section_read_global_or_own" ON public.evaluation_section
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = public.current_company_id());
CREATE POLICY "eval_section_write_admin" ON public.evaluation_section
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_company_admin(company_id))
  WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(company_id));

-- Product to section mapping
CREATE TABLE public.loan_product_evaluation_section (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  loan_product_id UUID NOT NULL REFERENCES public.loan_product(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.evaluation_section(id) ON DELETE CASCADE,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  enabled_fields JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loan_product_id, section_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_product_evaluation_section TO authenticated;
GRANT ALL ON public.loan_product_evaluation_section TO service_role;
ALTER TABLE public.loan_product_evaluation_section ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lpes_read_own" ON public.loan_product_evaluation_section
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
CREATE POLICY "lpes_write_admin" ON public.loan_product_evaluation_section
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_company_admin(company_id))
  WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(company_id));

-- Per-loan captured evaluation data
CREATE TABLE public.loan_evaluation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL REFERENCES public.loan(id) ON DELETE CASCADE UNIQUE,
  product_snapshot JSONB,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_evaluation TO authenticated;
GRANT ALL ON public.loan_evaluation TO service_role;
ALTER TABLE public.loan_evaluation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loan_eval_all_own_company" ON public.loan_evaluation
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- updated_at trigger (create helper if absent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_eval_section_updated BEFORE UPDATE ON public.evaluation_section
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_lpes_updated BEFORE UPDATE ON public.loan_product_evaluation_section
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_loan_eval_updated BEFORE UPDATE ON public.loan_evaluation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the four sections (global — company_id NULL)
INSERT INTO public.evaluation_section (company_id, code, name, description, component_name, display_order, fields) VALUES
(NULL, 'bdo', 'BDO Evaluation', 'Business Development Officer evaluation', 'generic', 10,
 '[
   {"key":"evaluation_remarks","label":"Evaluation Remarks","type":"textarea"},
   {"key":"customer_visit_date","label":"Customer Visit Date","type":"date"},
   {"key":"business_observation","label":"Business Observation","type":"textarea"},
   {"key":"character_assessment","label":"Character Assessment","type":"textarea"},
   {"key":"income_assessment","label":"Income Assessment","type":"textarea"},
   {"key":"recommendation","label":"Recommendation","type":"textarea"},
   {"key":"overall_score","label":"Overall Score","type":"number","optional":true}
 ]'::jsonb),
(NULL, 'employment', 'Employment Information', 'Employer & salary details', 'generic', 20,
 '[
   {"key":"employer","label":"Employer / Company Name","type":"text"},
   {"key":"designation","label":"Designation","type":"text"},
   {"key":"department","label":"Department","type":"text"},
   {"key":"employment_type","label":"Employment Type","type":"select","options":["Permanent","Contract","Temporary","Self-employed"]},
   {"key":"phone","label":"Phone Number","type":"text"},
   {"key":"service_period","label":"Service Period","type":"text"},
   {"key":"monthly_salary","label":"Monthly Salary","type":"number"},
   {"key":"employment_address","label":"Employment Address","type":"textarea"},
   {"key":"supervisor","label":"Supervisor Name","type":"text","optional":true}
 ]'::jsonb),
(NULL, 'existing_facility', 'Existing Facility Information', 'Existing loans held elsewhere (to be replaced by CRIB later)', 'generic', 30,
 '[
   {"key":"provider","label":"Existing Loan Provider","type":"text"},
   {"key":"facility_type","label":"Facility Type","type":"text"},
   {"key":"outstanding_balance","label":"Outstanding Balance","type":"number"},
   {"key":"monthly_installment","label":"Monthly Installment","type":"number"},
   {"key":"settlement_date","label":"Settlement Date","type":"date"},
   {"key":"status","label":"Loan Status","type":"select","options":["Active","Settled","Overdue"]},
   {"key":"remarks","label":"Remarks","type":"textarea"}
 ]'::jsonb),
(NULL, 'business', 'Business Information', 'Business & operations profile', 'generic', 40,
 '[
   {"key":"business_name","label":"Business Name","type":"text"},
   {"key":"registration_no","label":"Business Registration Number","type":"text"},
   {"key":"nature","label":"Nature of Business","type":"text"},
   {"key":"address","label":"Business Address","type":"textarea"},
   {"key":"contact","label":"Business Contact Number","type":"text"},
   {"key":"start_date","label":"Business Start Date","type":"date"},
   {"key":"years_operation","label":"Years in Operation","type":"number"},
   {"key":"monthly_sales","label":"Monthly Sales","type":"number"},
   {"key":"monthly_expenses","label":"Monthly Expenses","type":"number"},
   {"key":"monthly_profit","label":"Monthly Profit","type":"number"},
   {"key":"employees","label":"Number of Employees","type":"number"},
   {"key":"premises","label":"Business Premises","type":"select","options":["Owned","Rented"]},
   {"key":"assets","label":"Business Assets","type":"textarea"},
   {"key":"remarks","label":"Business Remarks","type":"textarea"}
 ]'::jsonb);
