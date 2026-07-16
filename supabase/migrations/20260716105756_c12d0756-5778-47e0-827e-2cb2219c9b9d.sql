
CREATE TABLE public.loan_applied_charge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loan(id) ON DELETE CASCADE,
  charge_id uuid NOT NULL REFERENCES public.loan_charge(id),
  amount numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, charge_id)
);
CREATE INDEX loan_applied_charge_loan_idx ON public.loan_applied_charge(loan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_applied_charge TO authenticated;
GRANT ALL ON public.loan_applied_charge TO service_role;

ALTER TABLE public.loan_applied_charge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_applied_charge company read"
  ON public.loan_applied_charge FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loan l
    JOIN public.branch b ON b.id = l.branch_id
    WHERE l.id = loan_id AND public.is_company_member(b.company_id)
  ));

CREATE POLICY "loan_applied_charge company write"
  ON public.loan_applied_charge FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loan l
    JOIN public.branch b ON b.id = l.branch_id
    WHERE l.id = loan_id AND public.is_company_member(b.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loan l
    JOIN public.branch b ON b.id = l.branch_id
    WHERE l.id = loan_id AND public.is_company_member(b.company_id)
  ));
