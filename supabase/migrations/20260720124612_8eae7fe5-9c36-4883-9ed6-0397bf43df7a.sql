
-- Enum extensions
ALTER TYPE savings_account_status ADD VALUE IF NOT EXISTS 'pending_funding';
ALTER TYPE savings_account_status ADD VALUE IF NOT EXISTS 'debit_blocked';
ALTER TYPE savings_account_status ADD VALUE IF NOT EXISTS 'credit_blocked';
ALTER TYPE savings_account_status ADD VALUE IF NOT EXISTS 'fully_blocked';
ALTER TYPE savings_txn_type ADD VALUE IF NOT EXISTS 'reversal';
ALTER TYPE savings_txn_type ADD VALUE IF NOT EXISTS 'transfer_in';
ALTER TYPE savings_txn_type ADD VALUE IF NOT EXISTS 'transfer_out';
ALTER TYPE savings_txn_type ADD VALUE IF NOT EXISTS 'loan_deduction';
ALTER TYPE savings_txn_type ADD VALUE IF NOT EXISTS 'wht';
ALTER TYPE savings_txn_type ADD VALUE IF NOT EXISTS 'hold';
ALTER TYPE savings_txn_type ADD VALUE IF NOT EXISTS 'hold_release';

ALTER TABLE public.savings_account
  ADD COLUMN IF NOT EXISTS uncleared_balance numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS rate_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS fees_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS mandate_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS rate_override_pct numeric(9,6),
  ADD COLUMN IF NOT EXISTS rate_override_reason text,
  ADD COLUMN IF NOT EXISTS rate_override_approved_by uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS opened_via text,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS statement_preference text,
  ADD COLUMN IF NOT EXISTS communication_preference text,
  ADD COLUMN IF NOT EXISTS special_instructions text;

ALTER TABLE public.savings_transaction
  ADD COLUMN IF NOT EXISTS clearing_status text NOT NULL DEFAULT 'cleared',
  ADD COLUMN IF NOT EXISTS cleared_on date,
  ADD COLUMN IF NOT EXISTS reversed_by_txn_id uuid REFERENCES public.savings_transaction(id),
  ADD COLUMN IF NOT EXISTS reverses_txn_id uuid REFERENCES public.savings_transaction(id),
  ADD COLUMN IF NOT EXISTS gl_entry_id uuid REFERENCES public.journal_entry(id),
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_details jsonb,
  ADD COLUMN IF NOT EXISTS approval_state text,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE TABLE IF NOT EXISTS public.savings_account_holder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.savings_account(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.client(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('primary','joint','guardian','minor','beneficiary','signatory')),
  ownership_pct numeric(6,3) NOT NULL DEFAULT 0,
  full_name text,
  nic text,
  relation text,
  is_signatory boolean NOT NULL DEFAULT false,
  signing_order int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_account_holder TO authenticated;
GRANT ALL ON public.savings_account_holder TO service_role;
ALTER TABLE public.savings_account_holder ENABLE ROW LEVEL SECURITY;
CREATE POLICY sah_read ON public.savings_account_holder FOR SELECT TO authenticated USING (is_company_member(company_id));
CREATE POLICY sah_write ON public.savings_account_holder FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE INDEX IF NOT EXISTS idx_sah_account ON public.savings_account_holder(account_id);
CREATE TRIGGER trg_sah_updated BEFORE UPDATE ON public.savings_account_holder FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public.savings_account_nominee (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.savings_account(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  nic text,
  relation text,
  percentage numeric(6,3) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  contact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_account_nominee TO authenticated;
GRANT ALL ON public.savings_account_nominee TO service_role;
ALTER TABLE public.savings_account_nominee ENABLE ROW LEVEL SECURITY;
CREATE POLICY san_read ON public.savings_account_nominee FOR SELECT TO authenticated USING (is_company_member(company_id));
CREATE POLICY san_write ON public.savings_account_nominee FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE INDEX IF NOT EXISTS idx_san_account ON public.savings_account_nominee(account_id);
CREATE TRIGGER trg_san_updated BEFORE UPDATE ON public.savings_account_nominee FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public.savings_account_mandate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.savings_account(id) ON DELETE CASCADE,
  signing_rule text NOT NULL CHECK (signing_rule IN ('sole','any_one','either','all','any_two','custom')),
  min_signatories int,
  rule_details jsonb,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.staff(id),
  approved_by uuid REFERENCES public.staff(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_account_mandate TO authenticated;
GRANT ALL ON public.savings_account_mandate TO service_role;
ALTER TABLE public.savings_account_mandate ENABLE ROW LEVEL SECURITY;
CREATE POLICY sam_read ON public.savings_account_mandate FOR SELECT TO authenticated USING (is_company_member(company_id));
CREATE POLICY sam_write ON public.savings_account_mandate FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE INDEX IF NOT EXISTS idx_sam_account ON public.savings_account_mandate(account_id);
CREATE TRIGGER trg_sam_updated BEFORE UPDATE ON public.savings_account_mandate FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public.savings_hold (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.savings_account(id) ON DELETE CASCADE,
  hold_type text NOT NULL CHECK (hold_type IN (
    'debit_block','credit_block','full_block','amount_hold','lien',
    'legal','aml','deceased','customer','loan_lien','administrative','temporary'
  )),
  amount numeric(18,2) NOT NULL DEFAULT 0,
  reason_code text,
  reason text NOT NULL,
  doc_ref text,
  effective_from timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  approval_state text NOT NULL DEFAULT 'pending' CHECK (approval_state IN ('pending','approved','rejected')),
  created_by uuid REFERENCES public.staff(id),
  approved_by uuid REFERENCES public.staff(id),
  approved_at timestamptz,
  released_by uuid REFERENCES public.staff(id),
  released_at timestamptz,
  released_reason text,
  linked_loan_id uuid REFERENCES public.loan(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.savings_hold TO authenticated;
GRANT ALL ON public.savings_hold TO service_role;
ALTER TABLE public.savings_hold ENABLE ROW LEVEL SECURITY;
CREATE POLICY sh_read ON public.savings_hold FOR SELECT TO authenticated USING (is_company_member(company_id));
CREATE POLICY sh_insert ON public.savings_hold FOR INSERT TO authenticated
  WITH CHECK (is_company_member(company_id) AND (is_company_admin(company_id) OR has_permission(auth.uid(),'savings.block.create',company_id)));
CREATE POLICY sh_update ON public.savings_hold FOR UPDATE TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id) AND (is_company_admin(company_id) OR has_permission(auth.uid(),'savings.block.approve',company_id) OR has_permission(auth.uid(),'savings.block.release',company_id)));
CREATE INDEX IF NOT EXISTS idx_sh_account_active ON public.savings_hold(account_id) WHERE active;
CREATE TRIGGER trg_sh_updated BEFORE UPDATE ON public.savings_hold FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public.savings_interest_accrual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.savings_account(id) ON DELETE CASCADE,
  accrual_date date NOT NULL,
  eligible_balance numeric(18,2) NOT NULL,
  rate_pct numeric(9,6) NOT NULL,
  day_count int NOT NULL DEFAULT 365,
  gross_interest numeric(18,6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, accrual_date)
);
GRANT SELECT ON public.savings_interest_accrual TO authenticated;
GRANT ALL ON public.savings_interest_accrual TO service_role;
ALTER TABLE public.savings_interest_accrual ENABLE ROW LEVEL SECURITY;
CREATE POLICY sia_read ON public.savings_interest_accrual FOR SELECT TO authenticated USING (is_company_member(company_id));
CREATE INDEX IF NOT EXISTS idx_sia_account_date ON public.savings_interest_accrual(account_id, accrual_date DESC);

CREATE TABLE IF NOT EXISTS public.savings_interest_posting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.savings_account(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_interest numeric(18,4) NOT NULL,
  wht_amount numeric(18,4) NOT NULL DEFAULT 0,
  net_interest numeric(18,4) NOT NULL,
  wht_rule_id uuid,
  gl_entry_id uuid REFERENCES public.journal_entry(id),
  savings_txn_id uuid REFERENCES public.savings_transaction(id),
  wht_txn_id uuid REFERENCES public.savings_transaction(id),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);
GRANT SELECT ON public.savings_interest_posting TO authenticated;
GRANT ALL ON public.savings_interest_posting TO service_role;
ALTER TABLE public.savings_interest_posting ENABLE ROW LEVEL SECURITY;
CREATE POLICY sip_read ON public.savings_interest_posting FOR SELECT TO authenticated USING (is_company_member(company_id));

CREATE TABLE IF NOT EXISTS public.savings_wht_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  jurisdiction text NOT NULL,
  tax_type text NOT NULL CHECK (tax_type IN ('wht','ait')),
  residency text NOT NULL CHECK (residency IN ('resident','nonresident','any')),
  entity_type text NOT NULL CHECK (entity_type IN ('individual','entity','any')),
  product_id uuid REFERENCES public.savings_product(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  effective_to date,
  rate_pct numeric(9,6) NOT NULL,
  threshold numeric(18,2) NOT NULL DEFAULT 0,
  exemption_type text,
  exemption_ref text,
  exemption_expiry date,
  wht_gl_account_id uuid REFERENCES public.gl_account(id),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.staff(id),
  approved_by uuid REFERENCES public.staff(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.savings_wht_rule TO authenticated;
GRANT ALL ON public.savings_wht_rule TO service_role;
ALTER TABLE public.savings_wht_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY swr_read ON public.savings_wht_rule FOR SELECT TO authenticated USING (is_company_member(company_id));
CREATE POLICY swr_write ON public.savings_wht_rule FOR ALL TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id) AND (is_company_admin(company_id) OR has_permission(auth.uid(),'savings.wht.manage',company_id)));
CREATE INDEX IF NOT EXISTS idx_swr_effective ON public.savings_wht_rule(company_id, effective_from DESC);
CREATE TRIGGER trg_swr_updated BEFORE UPDATE ON public.savings_wht_rule FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public.savings_loan_mandate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.client(id) ON DELETE RESTRICT,
  savings_account_id uuid NOT NULL REFERENCES public.savings_account(id) ON DELETE RESTRICT,
  loan_id uuid NOT NULL REFERENCES public.loan(id) ON DELETE RESTRICT,
  mandate_type text NOT NULL DEFAULT 'arrears_only' CHECK (mandate_type IN ('arrears_only','full_installment','minimum_due','fixed_amount')),
  priority int NOT NULL DEFAULT 100,
  max_amount_per_run numeric(18,2),
  fixed_amount numeric(18,2),
  min_protected_balance numeric(18,2) NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  morning_run boolean NOT NULL DEFAULT true,
  afternoon_run boolean NOT NULL DEFAULT true,
  allow_partial boolean NOT NULL DEFAULT true,
  ignore_debit_block boolean NOT NULL DEFAULT false,
  consent_reference text,
  consent_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','cancelled')),
  created_by uuid REFERENCES public.staff(id),
  approved_by uuid REFERENCES public.staff(id),
  approved_at timestamptz,
  suspended_at timestamptz,
  suspended_reason text,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.savings_loan_mandate TO authenticated;
GRANT ALL ON public.savings_loan_mandate TO service_role;
ALTER TABLE public.savings_loan_mandate ENABLE ROW LEVEL SECURITY;
CREATE POLICY slm_read ON public.savings_loan_mandate FOR SELECT TO authenticated USING (is_company_member(company_id));
CREATE POLICY slm_write ON public.savings_loan_mandate FOR ALL TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id) AND (is_company_admin(company_id) OR has_permission(auth.uid(),'savings.mandate.manage',company_id)));
CREATE INDEX IF NOT EXISTS idx_slm_loan ON public.savings_loan_mandate(loan_id);
CREATE INDEX IF NOT EXISTS idx_slm_savings ON public.savings_loan_mandate(savings_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_slm_active_pair ON public.savings_loan_mandate(savings_account_id, loan_id) WHERE status = 'active';
CREATE TRIGGER trg_slm_updated BEFORE UPDATE ON public.savings_loan_mandate FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public.savings_auto_collection_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  run_window text NOT NULL CHECK (run_window IN ('morning','afternoon','manual')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  triggered_by uuid REFERENCES public.staff(id),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  UNIQUE (company_id, business_date, run_window)
);
GRANT SELECT ON public.savings_auto_collection_run TO authenticated;
GRANT ALL ON public.savings_auto_collection_run TO service_role;
ALTER TABLE public.savings_auto_collection_run ENABLE ROW LEVEL SECURITY;
CREATE POLICY sacr_read ON public.savings_auto_collection_run FOR SELECT TO authenticated USING (is_company_member(company_id));

CREATE TABLE IF NOT EXISTS public.savings_auto_collection_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.savings_auto_collection_run(id) ON DELETE CASCADE,
  mandate_id uuid NOT NULL REFERENCES public.savings_loan_mandate(id) ON DELETE CASCADE,
  savings_account_id uuid NOT NULL REFERENCES public.savings_account(id),
  loan_id uuid NOT NULL REFERENCES public.loan(id),
  status text NOT NULL CHECK (status IN ('collected','partial','insufficient','blocked','no_arrears','error','skipped')),
  requested numeric(18,2) NOT NULL DEFAULT 0,
  collected numeric(18,2) NOT NULL DEFAULT 0,
  reason text,
  savings_txn_id uuid REFERENCES public.savings_transaction(id),
  loan_repayment_id uuid REFERENCES public.repayment(id),
  gl_entry_id uuid REFERENCES public.journal_entry(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, mandate_id)
);
GRANT SELECT ON public.savings_auto_collection_result TO authenticated;
GRANT ALL ON public.savings_auto_collection_result TO service_role;
ALTER TABLE public.savings_auto_collection_result ENABLE ROW LEVEL SECURITY;
CREATE POLICY sacres_read ON public.savings_auto_collection_result FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.savings_auto_collection_run r WHERE r.id = run_id AND is_company_member(r.company_id)));

INSERT INTO public.permission (code, module, label, description, sort_order) VALUES
  ('savings.accounts.open','savings','Open savings account','Open a new savings account', 610),
  ('savings.accounts.view','savings','View savings accounts','View savings accounts', 611),
  ('savings.deposit.post','savings','Post savings deposit','Post savings deposits', 612),
  ('savings.withdraw.post','savings','Post savings withdrawal','Post savings withdrawals', 613),
  ('savings.transfer.post','savings','Post savings transfer','Post savings-to-savings transfers', 614),
  ('savings.block.create','savings','Create hold/block','Create a savings account hold/block', 615),
  ('savings.block.approve','savings','Approve hold/block','Approve a savings account hold/block', 616),
  ('savings.block.release','savings','Release hold/block','Release a savings account hold/block', 617),
  ('savings.mandate.manage','savings','Manage loan mandates','Manage savings-to-loan repayment mandates', 618),
  ('savings.automation.run','savings','Run auto collections','Run or retry automatic savings collections', 619),
  ('savings.interest.process','savings','Process interest','Process savings interest accrual and capitalization', 620),
  ('savings.wht.manage','savings','Manage WHT/AIT','Manage WHT/AIT rules', 621),
  ('savings.transaction.reverse','savings','Reverse transaction','Reverse a posted savings transaction', 622),
  ('savings.transaction.approve','savings','Approve transaction','Approve pending savings transactions', 623),
  ('savings.admin','savings','Savings administrator','Full administrative override for Savings module', 624)
ON CONFLICT (code) DO NOTHING;
