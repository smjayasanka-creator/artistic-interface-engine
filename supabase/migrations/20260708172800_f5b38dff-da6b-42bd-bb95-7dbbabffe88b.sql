
-- ============================================================================
-- MZIZI CORE — schema + RLS + views + seed
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- ENUMS ----------
CREATE TYPE public.app_role AS ENUM ('loan_officer','branch_manager','admin');
CREATE TYPE public.staff_role AS ENUM ('loan_officer','branch_manager','teller','operations','admin');
CREATE TYPE public.client_status AS ENUM ('pending_kyc','active','dormant','blacklisted','exited');
CREATE TYPE public.risk_grade AS ENUM ('low','medium','high');
CREATE TYPE public.loan_status AS ENUM ('draft','submitted','approved','rejected','disbursed','active','closed','written_off');
CREATE TYPE public.installment_state AS ENUM ('upcoming','due','paid','partial','overdue','waived');
CREATE TYPE public.repayment_frequency AS ENUM ('weekly','biweekly','monthly');
CREATE TYPE public.interest_method AS ENUM ('flat','declining_balance');
CREATE TYPE public.payment_channel AS ENUM ('cash','mpesa','bank','internal');
CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','income','expense');

-- ============================================================================
-- USER ROLES (security-definer function pattern)
-- ============================================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- ============================================================================
-- ORG
-- ============================================================================
CREATE TABLE public.branch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  region text,
  currency char(3) NOT NULL DEFAULT 'KES',
  opened_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.branch TO authenticated;
GRANT ALL ON public.branch TO service_role;
ALTER TABLE public.branch ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authed read branch" ON public.branch FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write branch" ON public.branch FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  branch_id uuid NOT NULL REFERENCES public.branch(id),
  full_name text NOT NULL,
  role public.staff_role NOT NULL DEFAULT 'loan_officer',
  email text UNIQUE,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authed read staff" ON public.staff FOR SELECT TO authenticated USING (true);
CREATE POLICY "self update staff" ON public.staff FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admin manage staff" ON public.staff FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================================
-- CLIENTS + GROUPS
-- ============================================================================
CREATE TABLE public.lending_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branch(id),
  name text NOT NULL,
  cycle int NOT NULL DEFAULT 1,
  meeting_day text,
  meeting_place text,
  leader_client_id uuid,
  officer_id uuid REFERENCES public.staff(id),
  target_today numeric(18,2) NOT NULL DEFAULT 0,
  color text DEFAULT '#0f766e',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lending_group TO authenticated;
GRANT ALL ON public.lending_group TO service_role;
ALTER TABLE public.lending_group ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authed access lending_group" ON public.lending_group FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.client (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branch(id),
  officer_id uuid REFERENCES public.staff(id),
  group_id uuid REFERENCES public.lending_group(id),
  full_name text NOT NULL,
  phone text,
  national_id text,
  status public.client_status NOT NULL DEFAULT 'pending_kyc',
  risk_grade public.risk_grade DEFAULT 'low',
  avatar_color text DEFAULT '#0f766e',
  joined_on date DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, national_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client TO authenticated;
GRANT ALL ON public.client TO service_role;
ALTER TABLE public.client ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authed access client" ON public.client FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.lending_group ADD CONSTRAINT fk_group_leader FOREIGN KEY (leader_client_id) REFERENCES public.client(id);

-- ============================================================================
-- LOAN PRODUCTS + LOANS
-- ============================================================================
CREATE TABLE public.loan_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  interest_method public.interest_method NOT NULL DEFAULT 'declining_balance',
  annual_rate_pct numeric(6,3) NOT NULL,
  min_principal numeric(18,2) NOT NULL DEFAULT 0,
  max_principal numeric(18,2),
  min_term_months int NOT NULL DEFAULT 1,
  max_term_months int NOT NULL DEFAULT 24,
  frequency public.repayment_frequency NOT NULL DEFAULT 'weekly',
  processing_fee_pct numeric(6,3) NOT NULL DEFAULT 0,
  color text DEFAULT '#0f766e',
  is_active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.loan_product TO authenticated;
GRANT ALL ON public.loan_product TO service_role;
ALTER TABLE public.loan_product ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authed read loan_product" ON public.loan_product FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write loan_product" ON public.loan_product FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.loan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.client(id),
  product_id uuid NOT NULL REFERENCES public.loan_product(id),
  branch_id uuid NOT NULL REFERENCES public.branch(id),
  officer_id uuid REFERENCES public.staff(id),
  status public.loan_status NOT NULL DEFAULT 'draft',
  principal numeric(18,2) NOT NULL CHECK (principal > 0),
  term_months int NOT NULL CHECK (term_months > 0),
  annual_rate_pct numeric(6,3) NOT NULL,
  frequency public.repayment_frequency NOT NULL DEFAULT 'weekly',
  purpose text,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.staff(id),
  disbursed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan TO authenticated;
GRANT ALL ON public.loan TO service_role;
ALTER TABLE public.loan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authed access loan" ON public.loan FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.loan_installment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loan(id) ON DELETE CASCADE,
  seq int NOT NULL,
  due_date date NOT NULL,
  principal_due numeric(18,2) NOT NULL DEFAULT 0,
  interest_due numeric(18,2) NOT NULL DEFAULT 0,
  fee_due numeric(18,2) NOT NULL DEFAULT 0,
  principal_paid numeric(18,2) NOT NULL DEFAULT 0,
  interest_paid numeric(18,2) NOT NULL DEFAULT 0,
  fee_paid numeric(18,2) NOT NULL DEFAULT 0,
  state public.installment_state NOT NULL DEFAULT 'upcoming',
  UNIQUE (loan_id, seq)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_installment TO authenticated;
GRANT ALL ON public.loan_installment TO service_role;
ALTER TABLE public.loan_installment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authed access loan_installment" ON public.loan_installment FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- LEDGER (double-entry)
-- ============================================================================
CREATE TABLE public.gl_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  type public.account_type NOT NULL,
  normal_balance smallint NOT NULL CHECK (normal_balance IN (-1,1)),
  is_active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.gl_account TO authenticated;
GRANT ALL ON public.gl_account TO service_role;
ALTER TABLE public.gl_account ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authed read gl_account" ON public.gl_account FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write gl_account" ON public.gl_account FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.journal_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  entry_date date NOT NULL DEFAULT current_date,
  branch_id uuid NOT NULL REFERENCES public.branch(id),
  description text,
  loan_id uuid REFERENCES public.loan(id),
  posted_by uuid REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.journal_entry TO authenticated;
GRANT ALL ON public.journal_entry TO service_role;
ALTER TABLE public.journal_entry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authed access journal_entry" ON public.journal_entry FOR SELECT TO authenticated USING (true);
CREATE POLICY "authed insert journal_entry" ON public.journal_entry FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.posting (
  id bigserial PRIMARY KEY,
  entry_id uuid NOT NULL REFERENCES public.journal_entry(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.gl_account(id),
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0)),
  CHECK (debit > 0 OR credit > 0)
);
CREATE INDEX idx_posting_entry ON public.posting(entry_id);
CREATE INDEX idx_posting_account ON public.posting(account_id);
GRANT SELECT, INSERT ON public.posting TO authenticated;
GRANT USAGE ON SEQUENCE public.posting_id_seq TO authenticated;
GRANT ALL ON public.posting TO service_role;
ALTER TABLE public.posting ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authed access posting" ON public.posting FOR SELECT TO authenticated USING (true);
CREATE POLICY "authed insert posting" ON public.posting FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.assert_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d numeric(18,2); c numeric(18,2); eid uuid;
BEGIN
  eid := COALESCE(NEW.entry_id, OLD.entry_id);
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c FROM public.posting WHERE entry_id = eid;
  IF d <> c THEN RAISE EXCEPTION 'Unbalanced journal entry %: debits % <> credits %', eid, d, c; END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER trg_entry_balanced
  AFTER INSERT OR UPDATE OR DELETE ON public.posting
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_entry_balanced();

CREATE TABLE public.repayment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loan(id),
  entry_id uuid NOT NULL REFERENCES public.journal_entry(id),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  channel public.payment_channel NOT NULL,
  received_by uuid REFERENCES public.staff(id),
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.repayment TO authenticated;
GRANT ALL ON public.repayment TO service_role;
ALTER TABLE public.repayment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authed access repayment" ON public.repayment FOR SELECT TO authenticated USING (true);
CREATE POLICY "authed insert repayment" ON public.repayment FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- VIEWS
-- ============================================================================
CREATE VIEW public.v_loan_outstanding AS
SELECT l.id AS loan_id, l.principal,
       l.principal - COALESCE(SUM(i.principal_paid),0) AS outstanding_principal,
       COALESCE(SUM(i.principal_paid),0) AS principal_repaid
FROM public.loan l
LEFT JOIN public.loan_installment i ON i.loan_id = l.id
WHERE l.status IN ('disbursed','active','closed')
GROUP BY l.id;

CREATE VIEW public.v_par_aging AS
WITH overdue AS (
  SELECT loan_id, MIN(due_date) AS oldest_due
  FROM public.loan_installment
  WHERE state IN ('due','overdue','partial') AND due_date < current_date
  GROUP BY loan_id
)
SELECT
  CASE
    WHEN o.loan_id IS NULL THEN 'current'
    WHEN current_date - o.oldest_due BETWEEN 1 AND 30 THEN '1-30'
    WHEN current_date - o.oldest_due BETWEEN 31 AND 60 THEN '31-60'
    WHEN current_date - o.oldest_due BETWEEN 61 AND 90 THEN '61-90'
    ELSE '90+'
  END AS bucket,
  SUM(lo.outstanding_principal) AS principal_at_risk
FROM public.v_loan_outstanding lo
LEFT JOIN overdue o ON o.loan_id = lo.loan_id
GROUP BY 1;

GRANT SELECT ON public.v_loan_outstanding TO authenticated;
GRANT SELECT ON public.v_par_aging TO authenticated;

-- ============================================================================
-- AUTH TRIGGER: create staff + assign role on signup
-- First user = admin. Rest = loan_officer.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _branch_id uuid;
  _role public.app_role;
  _staff_role public.staff_role;
  _count int;
BEGIN
  SELECT id INTO _branch_id FROM public.branch ORDER BY created_at LIMIT 1;
  SELECT COUNT(*) INTO _count FROM public.user_roles;
  IF _count = 0 THEN
    _role := 'admin'::public.app_role;
    _staff_role := 'admin'::public.staff_role;
  ELSE
    _role := 'loan_officer'::public.app_role;
    _staff_role := 'loan_officer'::public.staff_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  INSERT INTO public.staff (user_id, branch_id, full_name, role, email)
  VALUES (NEW.id, _branch_id,
          COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
          _staff_role, NEW.email);
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- SEED: branch + chart of accounts + products
-- ============================================================================
INSERT INTO public.branch (code, name, region, opened_on) VALUES
  ('KWG-04','Kawangware Branch','Nairobi','2018-03-15');

INSERT INTO public.gl_account (code, name, type, normal_balance) VALUES
  ('1000','Cash on hand','asset',1),
  ('1010','Bank / M-Pesa float','asset',1),
  ('1100','Loans receivable','asset',1),
  ('1200','Interest receivable','asset',1),
  ('2000','Member savings','liability',-1),
  ('3000','Retained earnings','equity',-1),
  ('4000','Interest income','income',-1),
  ('4100','Fee income','income',-1),
  ('5000','Loan loss provision','expense',1);

INSERT INTO public.loan_product (name, annual_rate_pct, min_principal, max_principal, min_term_months, max_term_months, frequency, color) VALUES
  ('Business',      18.0,  5000,   500000, 3, 12, 'weekly',  '#0f766e'),
  ('Asset finance', 16.5, 20000,  1000000, 6, 24, 'monthly', '#0369a1'),
  ('Agri',          14.0, 10000,   300000, 3, 12, 'monthly', '#f59e0b'),
  ('Emergency',     22.0,  2000,    50000, 1,  6, 'weekly',  '#ef4444');
