
CREATE TABLE public.loan_security (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loan(id) ON DELETE CASCADE,
  security_type_id UUID NOT NULL REFERENCES public.security_type(id),
  values JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX loan_security_loan_id_idx ON public.loan_security(loan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_security TO authenticated;
GRANT ALL ON public.loan_security TO service_role;

ALTER TABLE public.loan_security ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage loan securities"
  ON public.loan_security
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.loan l
      JOIN public.branch b ON b.id = l.branch_id
      WHERE l.id = loan_security.loan_id
        AND public.is_company_member(b.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.loan l
      JOIN public.branch b ON b.id = l.branch_id
      WHERE l.id = loan_security.loan_id
        AND public.is_company_member(b.company_id)
    )
  );

CREATE TRIGGER loan_security_set_updated_at
  BEFORE UPDATE ON public.loan_security
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
