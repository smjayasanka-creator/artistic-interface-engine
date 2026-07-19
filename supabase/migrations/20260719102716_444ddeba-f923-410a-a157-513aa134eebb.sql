
-- ============================================================
-- 1. Global sequence + generator
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.loan_application_no_seq START 1;

CREATE OR REPLACE FUNCTION public.next_loan_application_no()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'AP' || lpad(nextval('public.loan_application_no_seq')::text, 6, '0');
$$;

-- ============================================================
-- 2. Master table
-- ============================================================
CREATE TYPE public.loan_application_status AS ENUM (
  'draft','submitted','under_review','approved','rejected','disbursed','cancelled'
);

CREATE TABLE public.loan_application (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_no text NOT NULL UNIQUE DEFAULT public.next_loan_application_no(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branch(id),
  client_id uuid REFERENCES public.client(id),
  product_id uuid REFERENCES public.loan_product(id),
  officer_id uuid REFERENCES public.staff(id),
  requested_principal numeric(18,2) NOT NULL DEFAULT 0,
  requested_tenor_months integer NOT NULL DEFAULT 0,
  requested_rate_pct numeric(6,3),
  frequency public.repayment_frequency,
  currency text NOT NULL DEFAULT 'KES',
  purpose text,
  channel text,
  status public.loan_application_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  decided_at timestamptz,
  disbursed_at timestamptz,
  loan_id uuid REFERENCES public.loan(id),
  workflow_instance_id uuid REFERENCES public.workflow_instance(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loan_application_company_idx ON public.loan_application(company_id);
CREATE INDEX loan_application_branch_idx ON public.loan_application(branch_id);
CREATE INDEX loan_application_client_idx ON public.loan_application(client_id);
CREATE INDEX loan_application_status_idx ON public.loan_application(status);
CREATE INDEX loan_application_loan_idx ON public.loan_application(loan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_application TO authenticated;
GRANT ALL ON public.loan_application TO service_role;
GRANT USAGE ON SEQUENCE public.loan_application_no_seq TO authenticated, service_role;

ALTER TABLE public.loan_application ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_application company read" ON public.loan_application
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) OR public.has_role(auth.uid(),'platform_admin'::public.app_role));

CREATE POLICY "loan_application company insert" ON public.loan_application
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY "loan_application company update" ON public.loan_application
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY "loan_application admin delete draft" ON public.loan_application
  FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id) AND status = 'draft');

CREATE TRIGGER trg_loan_application_updated
  BEFORE UPDATE ON public.loan_application
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Retention: block delete unless still a draft
CREATE OR REPLACE FUNCTION public.loan_application_block_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Loan applications cannot be deleted once submitted (status=%). Cancel instead.', OLD.status;
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_loan_application_no_delete
  BEFORE DELETE ON public.loan_application
  FOR EACH ROW EXECUTE FUNCTION public.loan_application_block_delete();

-- ============================================================
-- 3. Child tables (all reference application_id)
-- ============================================================

-- helper: standard grants + RLS scoped through application company
CREATE OR REPLACE FUNCTION public._app_row_company_ok(_app_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.loan_application a
    WHERE a.id = _app_id
      AND (public.is_company_member(a.company_id) OR public.has_role(auth.uid(),'platform_admin'::public.app_role))
  );
$$;

-- 3.1 Applicant snapshot
CREATE TABLE public.loan_application_applicant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.loan_application(id) ON DELETE CASCADE,
  application_no text NOT NULL,
  role text NOT NULL DEFAULT 'primary', -- primary | co_applicant
  client_id uuid REFERENCES public.client(id),
  full_name text NOT NULL,
  national_id text,
  phone text,
  email text,
  address text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.loan_application_applicant(application_id);

-- 3.2 Evaluation
CREATE TABLE public.loan_application_evaluation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.loan_application(id) ON DELETE CASCADE,
  application_no text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id)
);

-- 3.3 Employment
CREATE TABLE public.loan_application_employment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.loan_application(id) ON DELETE CASCADE,
  application_no text NOT NULL,
  employer_name text,
  position text,
  employment_type text,
  monthly_income numeric(18,2),
  years_of_service numeric(6,2),
  employer_address text,
  employer_phone text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.loan_application_employment(application_id);

-- 3.4 Business
CREATE TABLE public.loan_application_business (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.loan_application(id) ON DELETE CASCADE,
  application_no text NOT NULL,
  business_name text,
  sector text,
  years_in_operation numeric(6,2),
  monthly_turnover numeric(18,2),
  ownership_type text,
  registration_no text,
  business_address text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.loan_application_business(application_id);

-- 3.5 Existing facilities with other lenders
CREATE TABLE public.loan_application_existing_facility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.loan_application(id) ON DELETE CASCADE,
  application_no text NOT NULL,
  lender_name text NOT NULL,
  facility_type text,
  original_amount numeric(18,2),
  outstanding_balance numeric(18,2),
  monthly_instalment numeric(18,2),
  maturity_date date,
  status text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.loan_application_existing_facility(application_id);

-- 3.6 Guarantor
CREATE TABLE public.loan_application_guarantor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.loan_application(id) ON DELETE CASCADE,
  application_no text NOT NULL,
  guarantor_client_id uuid REFERENCES public.client(id),
  full_name text NOT NULL,
  national_id text,
  phone text,
  relationship text,
  coverage_amount numeric(18,2),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.loan_application_guarantor(application_id);

-- 3.7 Collateral (mirrors loan_security)
CREATE TABLE public.loan_application_collateral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.loan_application(id) ON DELETE CASCADE,
  application_no text NOT NULL,
  security_type_id uuid REFERENCES public.security_type(id),
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.loan_application_collateral(application_id);

-- 3.8 Document attachments
CREATE TABLE public.loan_application_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.loan_application(id) ON DELETE CASCADE,
  application_no text NOT NULL,
  document_type text NOT NULL,
  file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'loan-application-documents',
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  version integer NOT NULL DEFAULT 1,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.loan_application_document(application_id);

-- 3.9 Approval workflow trail
CREATE TABLE public.loan_application_approval (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.loan_application(id) ON DELETE CASCADE,
  application_no text NOT NULL,
  workflow_instance_id uuid REFERENCES public.workflow_instance(id),
  step_key text,
  decision text NOT NULL,
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  comment text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ON public.loan_application_approval(application_id);

-- 3.10 Notes / remarks
CREATE TABLE public.loan_application_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.loan_application(id) ON DELETE CASCADE,
  application_no text NOT NULL,
  author_id uuid,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.loan_application_note(application_id);

-- 3.11 Status history
CREATE TABLE public.loan_application_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.loan_application(id) ON DELETE CASCADE,
  application_no text NOT NULL,
  from_status public.loan_application_status,
  to_status public.loan_application_status NOT NULL,
  actor_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.loan_application_status_history(application_id);

-- ============================================================
-- 4. Grants + RLS for all child tables
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'loan_application_applicant',
    'loan_application_evaluation',
    'loan_application_employment',
    'loan_application_business',
    'loan_application_existing_facility',
    'loan_application_guarantor',
    'loan_application_collateral',
    'loan_application_document',
    'loan_application_approval',
    'loan_application_note',
    'loan_application_status_history'
  ]) LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY "%1$s company read" ON public.%1$I FOR SELECT TO authenticated USING (public._app_row_company_ok(application_id));$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s company insert" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public._app_row_company_ok(application_id));$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s company update" ON public.%1$I FOR UPDATE TO authenticated USING (public._app_row_company_ok(application_id)) WITH CHECK (public._app_row_company_ok(application_id));$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s company delete" ON public.%1$I FOR DELETE TO authenticated USING (public._app_row_company_ok(application_id));$p$, t);
  END LOOP;
END $$;

-- updated_at triggers where present
CREATE TRIGGER trg_lap_appl_upd BEFORE UPDATE ON public.loan_application_applicant FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lap_eval_upd BEFORE UPDATE ON public.loan_application_evaluation FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lap_emp_upd BEFORE UPDATE ON public.loan_application_employment FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lap_bus_upd BEFORE UPDATE ON public.loan_application_business FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lap_ef_upd BEFORE UPDATE ON public.loan_application_existing_facility FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lap_gu_upd BEFORE UPDATE ON public.loan_application_guarantor FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lap_col_upd BEFORE UPDATE ON public.loan_application_collateral FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 5. Loan linkage columns
-- ============================================================
ALTER TABLE public.loan
  ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES public.loan_application(id),
  ADD COLUMN IF NOT EXISTS application_no text;
CREATE INDEX IF NOT EXISTS loan_application_id_idx ON public.loan(application_id);
CREATE INDEX IF NOT EXISTS loan_application_no_idx ON public.loan(application_no);

-- ============================================================
-- 6. Back-fill: one application per existing loan
-- ============================================================
DO $bf$
DECLARE
  _l record;
  _app_id uuid;
  _app_no text;
  _company_id uuid;
BEGIN
  FOR _l IN SELECT l.*, b.company_id AS c_id FROM public.loan l JOIN public.branch b ON b.id = l.branch_id WHERE l.application_id IS NULL LOOP
    _company_id := _l.c_id;
    _app_no := public.next_loan_application_no();
    INSERT INTO public.loan_application(
      application_no, company_id, branch_id, client_id, product_id, officer_id,
      requested_principal, requested_tenor_months, requested_rate_pct, frequency,
      purpose, status, submitted_at, decided_at, disbursed_at, loan_id, created_at
    ) VALUES (
      _app_no, _company_id, _l.branch_id, _l.client_id, _l.product_id, _l.officer_id,
      _l.principal, _l.term_months, _l.annual_rate_pct, _l.frequency,
      _l.purpose,
      CASE WHEN _l.disbursed_at IS NOT NULL THEN 'disbursed'::public.loan_application_status
           WHEN _l.approved_at IS NOT NULL THEN 'approved'::public.loan_application_status
           WHEN _l.submitted_at IS NOT NULL THEN 'submitted'::public.loan_application_status
           ELSE 'draft'::public.loan_application_status END,
      _l.submitted_at, _l.approved_at, _l.disbursed_at, _l.id, _l.created_at
    ) RETURNING id INTO _app_id;

    UPDATE public.loan SET application_id = _app_id, application_no = _app_no WHERE id = _l.id;

    -- Copy evaluation
    INSERT INTO public.loan_application_evaluation(application_id, application_no, data, product_snapshot, created_at, updated_at)
    SELECT _app_id, _app_no, e.data, e.product_snapshot, e.created_at, e.updated_at
      FROM public.loan_evaluation e WHERE e.loan_id = _l.id;

    -- Copy securities
    INSERT INTO public.loan_application_collateral(application_id, application_no, security_type_id, values, documents, notes, created_at, updated_at)
    SELECT _app_id, _app_no, s.security_type_id, s.values, s.documents, s.notes, s.created_at, s.updated_at
      FROM public.loan_security s WHERE s.loan_id = _l.id;

    -- Seed status history
    INSERT INTO public.loan_application_status_history(application_id, application_no, from_status, to_status, created_at)
    VALUES (_app_id, _app_no, NULL,
      CASE WHEN _l.disbursed_at IS NOT NULL THEN 'disbursed'::public.loan_application_status
           WHEN _l.approved_at IS NOT NULL THEN 'approved'::public.loan_application_status
           WHEN _l.submitted_at IS NOT NULL THEN 'submitted'::public.loan_application_status
           ELSE 'draft'::public.loan_application_status END,
      COALESCE(_l.disbursed_at, _l.approved_at, _l.submitted_at, _l.created_at));
  END LOOP;
END $bf$;

-- ============================================================
-- 7. Copy-on-disburse RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.disburse_loan_from_application(
  _application_id uuid,
  _payment_channel text DEFAULT 'fund_transfer',
  _payment_reference text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _app public.loan_application%ROWTYPE;
  _loan_id uuid;
BEGIN
  SELECT * INTO _app FROM public.loan_application WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application % not found', _application_id; END IF;
  IF NOT public.is_company_member(_app.company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _app.status = 'disbursed' AND _app.loan_id IS NOT NULL THEN RETURN _app.loan_id; END IF;
  IF _app.status NOT IN ('approved') THEN RAISE EXCEPTION 'Application must be approved to disburse (status=%)', _app.status; END IF;

  INSERT INTO public.loan(
    client_id, product_id, branch_id, officer_id,
    status, principal, term_months, annual_rate_pct, frequency,
    purpose, submitted_at, approved_at, disbursed_at,
    idempotency_key, application_id, application_no
  ) VALUES (
    _app.client_id, _app.product_id, _app.branch_id, _app.officer_id,
    'disbursed'::public.loan_status,
    _app.requested_principal, _app.requested_tenor_months, COALESCE(_app.requested_rate_pct, 0),
    COALESCE(_app.frequency, 'monthly'::public.repayment_frequency),
    _app.purpose, _app.submitted_at, _app.decided_at, now(),
    COALESCE(_idempotency_key, 'app:'||_app.application_no),
    _app.id, _app.application_no
  ) RETURNING id INTO _loan_id;

  -- Copy collaterals
  INSERT INTO public.loan_security(loan_id, security_type_id, values, documents, notes)
  SELECT _loan_id, c.security_type_id, c.values, c.documents, c.notes
    FROM public.loan_application_collateral c WHERE c.application_id = _app.id AND c.security_type_id IS NOT NULL;

  -- Copy evaluation
  INSERT INTO public.loan_evaluation(company_id, loan_id, product_snapshot, data)
  SELECT _app.company_id, _loan_id, e.product_snapshot, e.data
    FROM public.loan_application_evaluation e WHERE e.application_id = _app.id
  ON CONFLICT (loan_id) DO NOTHING;

  UPDATE public.loan_application
     SET status='disbursed'::public.loan_application_status,
         loan_id=_loan_id,
         disbursed_at=now(),
         updated_at=now()
   WHERE id=_app.id;

  INSERT INTO public.loan_application_status_history(application_id, application_no, from_status, to_status, actor_id, reason)
  VALUES (_app.id, _app.application_no, _app.status, 'disbursed', auth.uid(),
          COALESCE('Disbursed via '||_payment_channel||COALESCE(' ref '||_payment_reference,''), 'Disbursed'));

  PERFORM public.emit_audit(_app.company_id, 'loan_application.disbursed', 'loan_application', _app.id, NULL,
    jsonb_build_object('loan_id', _loan_id, 'application_no', _app.application_no),
    jsonb_build_object('payment_channel', _payment_channel, 'payment_reference', _payment_reference));

  RETURN _loan_id;
END $fn$;

GRANT EXECUTE ON FUNCTION public.disburse_loan_from_application(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_loan_application_no() TO authenticated;
