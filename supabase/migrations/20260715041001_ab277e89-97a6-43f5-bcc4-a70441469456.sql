
-- ============================================================================
-- Risk profiling scheme
-- ============================================================================

CREATE TYPE public.risk_band_level AS ENUM ('low','medium','high');
CREATE TYPE public.risk_applies_to AS ENUM ('both','individual','corporate');

CREATE TABLE public.risk_factor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  applies_to public.risk_applies_to NOT NULL DEFAULT 'both',
  multi_select boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_factor TO authenticated;
GRANT ALL ON public.risk_factor TO service_role;
ALTER TABLE public.risk_factor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risk_factor company members" ON public.risk_factor
  FOR ALL TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));
CREATE TRIGGER trg_risk_factor_updated BEFORE UPDATE ON public.risk_factor
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.risk_option (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factor_id uuid NOT NULL REFERENCES public.risk_factor(id) ON DELETE CASCADE,
  label text NOT NULL,
  band public.risk_band_level NOT NULL DEFAULT 'low',
  score numeric(10,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.risk_option (factor_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_option TO authenticated;
GRANT ALL ON public.risk_option TO service_role;
ALTER TABLE public.risk_option ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risk_option via factor" ON public.risk_option
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.risk_factor f WHERE f.id = risk_option.factor_id AND public.is_company_member(f.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.risk_factor f WHERE f.id = risk_option.factor_id AND public.is_company_member(f.company_id)));
CREATE TRIGGER trg_risk_option_updated BEFORE UPDATE ON public.risk_option
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.risk_band (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  band public.risk_band_level NOT NULL,
  min_pct numeric(6,2) NOT NULL,
  max_pct numeric(6,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, band)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_band TO authenticated;
GRANT ALL ON public.risk_band TO service_role;
ALTER TABLE public.risk_band ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risk_band company members" ON public.risk_band
  FOR ALL TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));
CREATE TRIGGER trg_risk_band_updated BEFORE UPDATE ON public.risk_band
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.client_risk_assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.client(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  total_score numeric(12,2) NOT NULL,
  max_score numeric(12,2) NOT NULL,
  pct numeric(6,2) NOT NULL,
  band public.risk_band_level NOT NULL,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  assessed_by uuid,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.client_risk_assessment (company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_risk_assessment TO authenticated;
GRANT ALL ON public.client_risk_assessment TO service_role;
ALTER TABLE public.client_risk_assessment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_risk_assessment company members" ON public.client_risk_assessment
  FOR ALL TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));
CREATE TRIGGER trg_cra_updated BEFORE UPDATE ON public.client_risk_assessment
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Seed function (idempotent — only seeds if the company has no factors yet)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_default_risk_scheme(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fid uuid;
  existing int;
BEGIN
  SELECT count(*) INTO existing FROM public.risk_factor WHERE company_id = _company_id;
  IF existing > 0 THEN RETURN; END IF;

  -- Bands
  INSERT INTO public.risk_band (company_id, band, min_pct, max_pct) VALUES
    (_company_id, 'low', 0, 40),
    (_company_id, 'medium', 40.01, 55),
    (_company_id, 'high', 55.01, 100)
  ON CONFLICT (company_id, band) DO NOTHING;

  -- 1. Client Category
  INSERT INTO public.risk_factor(company_id, code, label, applies_to, multi_select, sort_order)
    VALUES (_company_id, 'client_category', 'Client Category', 'both', false, 1)
    RETURNING id INTO fid;
  INSERT INTO public.risk_option(factor_id, label, band, score, sort_order) VALUES
    (fid, 'Individual', 'low', 2, 1),
    (fid, 'Corporate', 'high', 5, 2);

  -- 2. Product Type (multi-select)
  INSERT INTO public.risk_factor(company_id, code, label, applies_to, multi_select, sort_order)
    VALUES (_company_id, 'product_type', 'Product Type', 'both', true, 2)
    RETURNING id INTO fid;
  INSERT INTO public.risk_option(factor_id, label, band, score, sort_order) VALUES
    (fid, 'Savings/FD', 'low', 0.5, 1),
    (fid, 'GoldLoan',   'medium', 3, 2),
    (fid, 'Lease/Loan', 'high', 5, 3);

  -- 3. Client Type
  INSERT INTO public.risk_factor(company_id, code, label, applies_to, multi_select, sort_order)
    VALUES (_company_id, 'client_type', 'Client Type', 'both', false, 3)
    RETURNING id INTO fid;
  INSERT INTO public.risk_option(factor_id, label, band, score, sort_order) VALUES
    (fid, 'Employee - Non Executive (Government and Private sector)', 'low', 5, 1),
    (fid, 'Sarvodaya Shramadana Societies / related entities', 'low', 5, 2),
    (fid, 'Students / Housewife', 'low', 5, 3),
    (fid, 'Pensioner / Retired', 'low', 5, 4),
    (fid, 'Not occupied', 'low', 5, 5),
    (fid, 'Bidders - Gold Loan auction', 'low', 5, 6),
    (fid, 'Employees - Above executive grade (Private Sector)', 'medium', 25, 10),
    (fid, 'Employees - Executive grade (Government Sector)', 'medium', 25, 11),
    (fid, 'Private Limited Companies', 'medium', 25, 12),
    (fid, 'Public Listed Companies', 'medium', 25, 13),
    (fid, 'Director / Partner / Office bearer', 'medium', 25, 14),
    (fid, 'Clergy', 'medium', 25, 15),
    (fid, 'Self Employee', 'medium', 25, 16),
    (fid, 'Agriculture (Farming / Plantation / Poultry)', 'medium', 25, 17),
    (fid, 'Professional (Lawyer/Accountant/Doctor/Engineer)', 'medium', 25, 18),
    (fid, 'Businessman - Annual Turnover Rs.2,000,001 - Rs.10,000,000', 'medium', 25, 19),
    (fid, 'Businessman - Annual Turnover below Rs.2,000,000', 'medium', 25, 20),
    (fid, 'Vehicle Auction bidder', 'medium', 25, 21),
    (fid, 'Customer - Western Union', 'medium', 25, 22),
    (fid, 'Politically Exposed Person (PEP)', 'high', 75, 30),
    (fid, 'Foreign Citizen', 'high', 75, 31),
    (fid, 'NGO / Charity / Trust / Clubs & Association', 'high', 75, 32),
    (fid, 'Dealer / Trader in gems & jewelry', 'high', 75, 33),
    (fid, 'Money changers / Remitters / Exchange Houses', 'high', 75, 34),
    (fid, 'Engaged in Real Estate Business', 'high', 75, 35),
    (fid, 'Bar / Casinos / Gambling House / Night clubs', 'high', 75, 36),
    (fid, 'Businessman - Annual Turnover above Rs.10,000,000', 'high', 75, 37),
    (fid, 'Suspicious customer / Appeared in watch list', 'high', 75, 38);

  -- 4. Source of Funds
  INSERT INTO public.risk_factor(company_id, code, label, applies_to, multi_select, sort_order)
    VALUES (_company_id, 'source_of_funds', 'Source of Funds', 'both', false, 4)
    RETURNING id INTO fid;
  INSERT INTO public.risk_option(factor_id, label, band, score, sort_order) VALUES
    (fid, 'Salary / professional income', 'low', 5, 1),
    (fid, 'Membership Contribution', 'low', 5, 2),
    (fid, 'Sales and Business Turnover / profit', 'medium', 10, 3),
    (fid, 'Investment proceeds', 'medium', 10, 4),
    (fid, 'Sale of property / assets', 'medium', 10, 5),
    (fid, 'Family remittance', 'medium', 10, 6),
    (fid, 'Commission Income', 'medium', 10, 7),
    (fid, 'Donations / Charities (Local/Foreign)', 'high', 20, 8),
    (fid, 'Gifts and grants', 'high', 20, 9),
    (fid, 'Cash', 'high', 20, 10);

  -- 5. Expected volume monthly - Individual
  INSERT INTO public.risk_factor(company_id, code, label, applies_to, multi_select, sort_order)
    VALUES (_company_id, 'exp_vol_indiv', 'Expected volume of monthly transactions - Individual', 'individual', false, 5)
    RETURNING id INTO fid;
  INSERT INTO public.risk_option(factor_id, label, band, score, sort_order) VALUES
    (fid, 'Less than Rs.100,000', 'low', 5, 1),
    (fid, 'Rs.100,001 - Rs.300,000', 'low', 5, 2),
    (fid, 'Rs.300,001 - Rs.500,000', 'medium', 10, 3),
    (fid, 'Rs.500,001 - Rs.1,000,000', 'medium', 10, 4),
    (fid, 'Rs.1,000,001 - Rs.2,000,000', 'high', 15, 5),
    (fid, 'Over Rs.2,000,001', 'high', 20, 6);

  -- 6. Average Monthly income - Individual
  INSERT INTO public.risk_factor(company_id, code, label, applies_to, multi_select, sort_order)
    VALUES (_company_id, 'income_indiv', 'Average Monthly income - Individual', 'individual', false, 6)
    RETURNING id INTO fid;
  INSERT INTO public.risk_option(factor_id, label, band, score, sort_order) VALUES
    (fid, 'Less than 50,000', 'low', 5, 1),
    (fid, '50,000 - 100,000', 'low', 5, 2),
    (fid, '100,000 - 250,000', 'medium', 10, 3),
    (fid, '250,000 - 500,000', 'medium', 10, 4),
    (fid, '500,000 - 1,000,000', 'high', 15, 5),
    (fid, 'More than 1,000,000', 'high', 20, 6);

  -- 7. Expected volume monthly - Corporate
  INSERT INTO public.risk_factor(company_id, code, label, applies_to, multi_select, sort_order)
    VALUES (_company_id, 'exp_vol_corp', 'Expected volume of monthly transactions - Corporate', 'corporate', false, 7)
    RETURNING id INTO fid;
  INSERT INTO public.risk_option(factor_id, label, band, score, sort_order) VALUES
    (fid, 'Less than Rs.1,000,000', 'low', 5, 1),
    (fid, 'Rs.1,000,001 - Rs.3,000,000', 'low', 5, 2),
    (fid, 'Rs.3,000,001 - Rs.5,000,000', 'medium', 10, 3),
    (fid, 'Rs.5,000,001 - Rs.10,000,000', 'medium', 10, 4),
    (fid, 'Rs.10,000,001 - Rs.15,000,000', 'high', 15, 5),
    (fid, 'Over Rs.15,000,001', 'high', 20, 6);

  -- 8. Average Monthly income - Corporate
  INSERT INTO public.risk_factor(company_id, code, label, applies_to, multi_select, sort_order)
    VALUES (_company_id, 'income_corp', 'Average Monthly income - Corporate', 'corporate', false, 8)
    RETURNING id INTO fid;
  INSERT INTO public.risk_option(factor_id, label, band, score, sort_order) VALUES
    (fid, 'Less than Rs.500,000', 'low', 5, 1),
    (fid, 'Rs.1,000,001 - Rs.5,000,000', 'low', 5, 2),
    (fid, 'Rs.5,000,001 - Rs.10,000,000', 'medium', 10, 3),
    (fid, 'Rs.10,000,001 - Rs.25,000,000', 'high', 15, 4),
    (fid, 'Over Rs.25,000,001', 'high', 20, 5);

  -- 9. Delivery Channels (multi-select)
  INSERT INTO public.risk_factor(company_id, code, label, applies_to, multi_select, sort_order)
    VALUES (_company_id, 'delivery_channel', 'Expected Mode of Transactions / Delivery Channels', 'both', true, 9)
    RETURNING id INTO fid;
  INSERT INTO public.risk_option(factor_id, label, band, score, sort_order) VALUES
    (fid, 'Fund transfer', 'low', 5, 1),
    (fid, 'Cheque', 'low', 5, 2),
    (fid, 'Cash', 'high', 20, 3),
    (fid, 'All above', 'high', 20, 4);

  -- 10. Geographical area
  INSERT INTO public.risk_factor(company_id, code, label, applies_to, multi_select, sort_order)
    VALUES (_company_id, 'geo_area', 'Geographical area', 'both', false, 10)
    RETURNING id INTO fid;
  INSERT INTO public.risk_option(factor_id, label, band, score, sort_order) VALUES
    (fid, 'Same district where the branch is located', 'low', 5, 1),
    (fid, 'Same Province where the branch is located', 'low', 10, 2),
    (fid, 'Out of Province but within 20Km of the branch', 'medium', 15, 3),
    (fid, 'Out of Province of the branch location', 'high', 20, 4);
END $$;

-- Seed all existing companies
DO $$
DECLARE c uuid;
BEGIN
  FOR c IN SELECT id FROM public.company LOOP
    PERFORM public.seed_default_risk_scheme(c);
  END LOOP;
END $$;
