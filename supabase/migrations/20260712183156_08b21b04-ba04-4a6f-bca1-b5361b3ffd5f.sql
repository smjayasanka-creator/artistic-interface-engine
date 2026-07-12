
-- ─────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.savings_account_status AS ENUM ('active','dormant','frozen','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.savings_txn_type AS ENUM ('deposit','withdrawal','interest','fee','opening','closure','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.savings_channel AS ENUM ('branch','atm','ceft','internet_banking','mobile','api','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.passbook_stock_status AS ENUM ('in_stock','partially_issued','exhausted','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- savings_product
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.savings_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'KES',
  interest_rate_pct numeric(6,3) NOT NULL DEFAULT 0,
  min_opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  min_balance numeric(18,2) NOT NULL DEFAULT 0,
  opening_fee numeric(18,2) NOT NULL DEFAULT 0,
  closure_fee numeric(18,2) NOT NULL DEFAULT 0,
  passbook_required boolean NOT NULL DEFAULT true,
  passbook_series_prefix text,
  dormancy_days int NOT NULL DEFAULT 365,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_product TO authenticated;
GRANT ALL ON public.savings_product TO service_role;
ALTER TABLE public.savings_product ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read savings products"
  ON public.savings_product FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "company members write savings products"
  ON public.savings_product FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "company members update savings products"
  ON public.savings_product FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "company admins delete savings products"
  ON public.savings_product FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));

CREATE TRIGGER trg_savings_product_updated
  BEFORE UPDATE ON public.savings_product
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- savings_account
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.savings_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branch(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.savings_product(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.client(id) ON DELETE RESTRICT,
  account_no text NOT NULL,
  currency text NOT NULL DEFAULT 'KES',
  status public.savings_account_status NOT NULL DEFAULT 'active',
  balance numeric(18,2) NOT NULL DEFAULT 0,
  available_balance numeric(18,2) NOT NULL DEFAULT 0,
  interest_accrued numeric(18,2) NOT NULL DEFAULT 0,
  opened_on date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  opened_by uuid REFERENCES public.staff(id),
  closed_on date,
  closed_by uuid REFERENCES public.staff(id),
  closure_reason text,
  external_ref text,
  last_txn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, account_no)
);

CREATE INDEX idx_savings_account_client ON public.savings_account(client_id);
CREATE INDEX idx_savings_account_branch ON public.savings_account(branch_id);
CREATE INDEX idx_savings_account_status ON public.savings_account(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_account TO authenticated;
GRANT ALL ON public.savings_account TO service_role;
ALTER TABLE public.savings_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read savings accounts"
  ON public.savings_account FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "company members create savings accounts"
  ON public.savings_account FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "company members update savings accounts"
  ON public.savings_account FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "company admins delete savings accounts"
  ON public.savings_account FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));

CREATE TRIGGER trg_savings_account_updated
  BEFORE UPDATE ON public.savings_account
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- savings_transaction
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.savings_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.savings_account(id) ON DELETE CASCADE,
  txn_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  txn_type public.savings_txn_type NOT NULL,
  channel public.savings_channel NOT NULL DEFAULT 'branch',
  amount numeric(18,2) NOT NULL,
  running_balance numeric(18,2) NOT NULL,
  reference text,
  external_ref text,
  narration text,
  performed_by uuid REFERENCES public.staff(id),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX idx_savings_txn_account_date ON public.savings_transaction(account_id, txn_date DESC);
CREATE INDEX idx_savings_txn_company_date ON public.savings_transaction(company_id, txn_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_transaction TO authenticated;
GRANT ALL ON public.savings_transaction TO service_role;
ALTER TABLE public.savings_transaction ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read savings txns"
  ON public.savings_transaction FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "company members create savings txns"
  ON public.savings_transaction FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));

-- ─────────────────────────────────────────────────────────────
-- passbook_stock
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.passbook_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branch(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.savings_product(id) ON DELETE SET NULL,
  series_prefix text,
  serial_from bigint NOT NULL,
  serial_to bigint NOT NULL,
  quantity_received int NOT NULL,
  quantity_issued int NOT NULL DEFAULT 0,
  quantity_void int NOT NULL DEFAULT 0,
  received_on date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  received_by uuid REFERENCES public.staff(id),
  supplier text,
  status public.passbook_stock_status NOT NULL DEFAULT 'in_stock',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (serial_to >= serial_from),
  CHECK (quantity_received = (serial_to - serial_from + 1))
);

CREATE INDEX idx_passbook_stock_branch ON public.passbook_stock(branch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passbook_stock TO authenticated;
GRANT ALL ON public.passbook_stock TO service_role;
ALTER TABLE public.passbook_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read passbook stock"
  ON public.passbook_stock FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "company members write passbook stock"
  ON public.passbook_stock FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "company members update passbook stock"
  ON public.passbook_stock FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "company admins delete passbook stock"
  ON public.passbook_stock FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));

CREATE TRIGGER trg_passbook_stock_updated
  BEFORE UPDATE ON public.passbook_stock
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- passbook_issue
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.passbook_issue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  stock_id uuid NOT NULL REFERENCES public.passbook_stock(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.savings_account(id) ON DELETE CASCADE,
  serial_no bigint NOT NULL,
  series_prefix text,
  issued_on date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  issued_by uuid REFERENCES public.staff(id),
  voided boolean NOT NULL DEFAULT false,
  void_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_id, serial_no)
);

CREATE INDEX idx_passbook_issue_account ON public.passbook_issue(account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passbook_issue TO authenticated;
GRANT ALL ON public.passbook_issue TO service_role;
ALTER TABLE public.passbook_issue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read passbook issues"
  ON public.passbook_issue FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "company members create passbook issues"
  ON public.passbook_issue FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "company members update passbook issues"
  ON public.passbook_issue FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

CREATE TRIGGER trg_passbook_issue_updated
  BEFORE UPDATE ON public.passbook_issue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Savings account number sequence
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.savings_number_seq (
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  period text NOT NULL,
  last_no int NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, period)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_number_seq TO authenticated;
GRANT ALL ON public.savings_number_seq TO service_role;
ALTER TABLE public.savings_number_seq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company members manage savings seq"
  ON public.savings_number_seq FOR ALL TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

CREATE OR REPLACE FUNCTION public.next_savings_account_no(_company_id uuid)
RETURNS text LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$
DECLARE _period text; _next int;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  _period := to_char(now(), 'YYYY');
  INSERT INTO public.savings_number_seq (company_id, period, last_no)
    VALUES (_company_id, _period, 1)
    ON CONFLICT (company_id, period)
    DO UPDATE SET last_no = public.savings_number_seq.last_no + 1
  RETURNING last_no INTO _next;
  RETURN 'SA-' || _period || '-' || lpad(_next::text, 6, '0');
END $fn$;
