
-- 1) Add GL account columns on loan_product
ALTER TABLE public.loan_product
  ADD COLUMN IF NOT EXISTS accrued_interest_account_id uuid REFERENCES public.gl_account(id),
  ADD COLUMN IF NOT EXISTS interest_receivable_account_id uuid REFERENCES public.gl_account(id);

-- 2) loan_accrual — daily interest posting
CREATE TABLE IF NOT EXISTS public.loan_accrual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loan(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  accrual_date date NOT NULL,
  outstanding_principal numeric(18,2) NOT NULL,
  daily_amount numeric(18,2) NOT NULL,
  cumulative_amount numeric(18,2) NOT NULL,
  entry_id uuid REFERENCES public.journal_entry(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, accrual_date)
);

GRANT SELECT ON public.loan_accrual TO authenticated;
GRANT ALL ON public.loan_accrual TO service_role;

ALTER TABLE public.loan_accrual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_accrual read by company members" ON public.loan_accrual
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE INDEX IF NOT EXISTS idx_loan_accrual_loan_date ON public.loan_accrual(loan_id, accrual_date DESC);
CREATE INDEX IF NOT EXISTS idx_loan_accrual_company_date ON public.loan_accrual(company_id, accrual_date DESC);

-- 3) loan_installment_reclass — records due-date reclassification
CREATE TABLE IF NOT EXISTS public.loan_installment_reclass (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id uuid NOT NULL UNIQUE REFERENCES public.loan_installment(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL REFERENCES public.loan(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL,
  reclass_date date NOT NULL,
  entry_id uuid REFERENCES public.journal_entry(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.loan_installment_reclass TO authenticated;
GRANT ALL ON public.loan_installment_reclass TO service_role;

ALTER TABLE public.loan_installment_reclass ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_reclass read by company members" ON public.loan_installment_reclass
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE INDEX IF NOT EXISTS idx_loan_reclass_loan ON public.loan_installment_reclass(loan_id);
