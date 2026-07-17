
-- Write-off master table
CREATE TABLE public.loan_write_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL UNIQUE REFERENCES public.loan(id),
  company_id uuid NOT NULL REFERENCES public.company(id),
  branch_id uuid NOT NULL REFERENCES public.branch(id),
  client_id uuid NOT NULL REFERENCES public.client(id),
  facility_no text,
  write_off_date date NOT NULL DEFAULT current_date,
  reason text NOT NULL,
  used_provision boolean NOT NULL DEFAULT false,
  principal_written_off numeric(18,2) NOT NULL DEFAULT 0,
  interest_written_off  numeric(18,2) NOT NULL DEFAULT 0,
  charges_written_off   numeric(18,2) NOT NULL DEFAULT 0,
  total_written_off     numeric(18,2) NOT NULL DEFAULT 0,
  principal_recovered   numeric(18,2) NOT NULL DEFAULT 0,
  interest_recovered    numeric(18,2) NOT NULL DEFAULT 0,
  charges_recovered     numeric(18,2) NOT NULL DEFAULT 0,
  total_recovered       numeric(18,2) NOT NULL DEFAULT 0,
  is_fully_recovered    boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.loan_write_off TO authenticated;
GRANT ALL ON public.loan_write_off TO service_role;
ALTER TABLE public.loan_write_off ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member reads write-offs" ON public.loan_write_off FOR SELECT
  USING (public.is_company_member(company_id));
CREATE POLICY "admin writes write-offs" ON public.loan_write_off FOR INSERT
  WITH CHECK (public.is_company_admin(company_id));
CREATE POLICY "admin updates write-offs" ON public.loan_write_off FOR UPDATE
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));
CREATE TRIGGER trg_loan_write_off_updated_at BEFORE UPDATE ON public.loan_write_off
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_loan_write_off_company ON public.loan_write_off(company_id, write_off_date DESC);

-- Recovery ledger
CREATE TABLE public.loan_write_off_recovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  write_off_id uuid NOT NULL REFERENCES public.loan_write_off(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.company(id),
  branch_id uuid NOT NULL REFERENCES public.branch(id),
  recovery_date date NOT NULL DEFAULT current_date,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  principal_portion numeric(18,2) NOT NULL DEFAULT 0,
  interest_portion  numeric(18,2) NOT NULL DEFAULT 0,
  charges_portion   numeric(18,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  reference text,
  notes text,
  journal_entry_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.loan_write_off_recovery TO authenticated;
GRANT ALL ON public.loan_write_off_recovery TO service_role;
ALTER TABLE public.loan_write_off_recovery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member reads recoveries" ON public.loan_write_off_recovery FOR SELECT
  USING (public.is_company_member(company_id));
CREATE POLICY "member inserts recoveries" ON public.loan_write_off_recovery FOR INSERT
  WITH CHECK (public.is_company_member(company_id));
CREATE INDEX idx_wo_recovery_wo ON public.loan_write_off_recovery(write_off_id, recovery_date DESC);

-- Extend write_off_loan to record master row + capture charges breakdown
CREATE OR REPLACE FUNCTION public.write_off_loan(_loan_id uuid, _reason text, _use_provision boolean DEFAULT false, _idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _loan       public.loan%ROWTYPE;
  _company_id uuid;
  _product    public.loan_product%ROWTYPE;
  _cap_out    numeric(18,2) := 0;
  _int_out    numeric(18,2) := 0;
  _fee_out    numeric(18,2) := 0;
  _lines      jsonb := '[]'::jsonb;
  _entry_id   uuid;
  _principal_acct uuid;
  _accrued_acct   uuid;
  _susp_acct      uuid;
  _wo_expense_acct uuid;
BEGIN
  SELECT * INTO _loan FROM public.loan WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan % not found', _loan_id; END IF;

  SELECT b.company_id INTO _company_id FROM public.branch b WHERE b.id = _loan.branch_id;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF _loan.status = 'written_off' THEN
    RAISE EXCEPTION 'Loan is already written off';
  END IF;
  IF _loan.status NOT IN ('active','disbursed') THEN
    RAISE EXCEPTION 'Only active or disbursed loans can be written off (current: %)', _loan.status;
  END IF;

  SELECT * INTO _product FROM public.loan_product WHERE id = _loan.product_id;
  _principal_acct := _product.principal_account_id;
  _accrued_acct   := _product.accrued_interest_account_id;
  _susp_acct      := _product.suspended_interest_account_id;
  _wo_expense_acct := CASE WHEN _use_provision
                           THEN _product.loan_loss_provision_account_id
                           ELSE _product.bad_debt_expense_account_id END;

  IF _principal_acct IS NULL THEN RAISE EXCEPTION 'Loan product missing principal GL mapping'; END IF;
  IF _wo_expense_acct IS NULL THEN
    RAISE EXCEPTION 'Loan product missing % GL mapping',
      CASE WHEN _use_provision THEN 'loan-loss provision' ELSE 'bad-debt expense' END;
  END IF;

  SELECT COALESCE(SUM(principal_due - principal_paid),0),
         COALESCE(SUM(interest_due  - interest_paid ),0),
         COALESCE(SUM(fee_due       - COALESCE(fee_paid,0)),0)
    INTO _cap_out, _int_out, _fee_out
    FROM public.loan_installment
   WHERE loan_id = _loan_id AND state <> 'cancelled';

  IF (_cap_out + _int_out + _fee_out) > 0 THEN
    _lines := _lines || jsonb_build_array(
      jsonb_build_object('account_id', _wo_expense_acct, 'debit', _cap_out + _int_out + _fee_out, 'credit', 0)
    );
    IF _cap_out > 0 THEN
      _lines := _lines || jsonb_build_array(jsonb_build_object('account_id', _principal_acct, 'debit', 0, 'credit', _cap_out));
    END IF;
    IF _int_out > 0 THEN
      IF _accrued_acct IS NULL THEN RAISE EXCEPTION 'Accrued-interest account not mapped'; END IF;
      _lines := _lines || jsonb_build_array(jsonb_build_object('account_id', _accrued_acct, 'debit', 0, 'credit', _int_out));
    END IF;
    IF _fee_out > 0 THEN
      _lines := _lines || jsonb_build_array(jsonb_build_object('account_id', _principal_acct, 'debit', 0, 'credit', _fee_out));
    END IF;

    _entry_id := public.post_entry_system(
      _company_id, current_date,
      'WRITE-OFF ' || COALESCE(_loan.contract_no, _loan.id::text),
      'Loan write-off: ' || _reason,
      _lines, _loan.branch_id, 'loan.write_off', _loan.id, _idempotency_key, _loan.id
    );
  END IF;

  UPDATE public.loan SET status = 'written_off', closed_at = now() WHERE id = _loan.id;
  UPDATE public.loan_installment
     SET state = 'cancelled'
   WHERE loan_id = _loan.id AND state NOT IN ('paid','cancelled');

  INSERT INTO public.loan_write_off (
    loan_id, company_id, branch_id, client_id, facility_no,
    write_off_date, reason, used_provision,
    principal_written_off, interest_written_off, charges_written_off, total_written_off,
    created_by
  ) VALUES (
    _loan.id, _company_id, _loan.branch_id, _loan.client_id, _loan.contract_no,
    current_date, _reason, _use_provision,
    _cap_out, _int_out, _fee_out, _cap_out + _int_out + _fee_out,
    auth.uid()
  )
  ON CONFLICT (loan_id) DO UPDATE SET
    write_off_date = EXCLUDED.write_off_date,
    reason = EXCLUDED.reason,
    used_provision = EXCLUDED.used_provision,
    principal_written_off = EXCLUDED.principal_written_off,
    interest_written_off = EXCLUDED.interest_written_off,
    charges_written_off = EXCLUDED.charges_written_off,
    total_written_off = EXCLUDED.total_written_off;

  RETURN COALESCE(_entry_id, _loan.id);
END $function$;

-- Recovery RPC
CREATE OR REPLACE FUNCTION public.record_write_off_recovery(
  _write_off_id uuid,
  _recovery_date date,
  _amount numeric,
  _principal numeric,
  _interest numeric,
  _charges numeric,
  _payment_method text,
  _reference text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _wo public.loan_write_off%ROWTYPE;
  _product public.loan_product%ROWTYPE;
  _loan public.loan%ROWTYPE;
  _cash_acct uuid;
  _income_acct uuid;
  _entry_id uuid;
  _recovery_id uuid;
  _lines jsonb;
BEGIN
  SELECT * INTO _wo FROM public.loan_write_off WHERE id = _write_off_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Write-off % not found', _write_off_id; END IF;
  IF NOT public.is_company_member(_wo.company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;

  IF _amount <= 0 THEN RAISE EXCEPTION 'Recovery amount must be positive'; END IF;
  IF round(COALESCE(_principal,0) + COALESCE(_interest,0) + COALESCE(_charges,0), 2) <> round(_amount, 2) THEN
    RAISE EXCEPTION 'Allocation (principal+interest+charges) must equal amount';
  END IF;
  IF (_wo.total_recovered + _amount) > _wo.total_written_off THEN
    RAISE EXCEPTION 'Recovery exceeds outstanding written-off balance (max %)', _wo.total_written_off - _wo.total_recovered;
  END IF;

  SELECT * INTO _loan FROM public.loan WHERE id = _wo.loan_id;
  SELECT * INTO _product FROM public.loan_product WHERE id = _loan.product_id;

  -- Credit reverses the same account used at write-off; treat as bad-debt recovery income
  _income_acct := CASE WHEN _wo.used_provision
                        THEN _product.loan_loss_provision_account_id
                        ELSE _product.bad_debt_expense_account_id END;
  IF _income_acct IS NULL THEN
    RAISE EXCEPTION 'Loan product missing write-off recovery GL mapping';
  END IF;

  SELECT id INTO _cash_acct FROM public.gl_account
   WHERE company_id = _wo.company_id AND code = '1000' LIMIT 1;
  IF _cash_acct IS NULL THEN RAISE EXCEPTION 'Cash account (1000) not found for company'; END IF;

  _lines := jsonb_build_array(
    jsonb_build_object('account_id', _cash_acct,   'debit', _amount, 'credit', 0),
    jsonb_build_object('account_id', _income_acct, 'debit', 0,       'credit', _amount)
  );

  _entry_id := public.post_entry_system(
    _wo.company_id, COALESCE(_recovery_date, current_date),
    'WO-RECOVERY ' || COALESCE(_wo.facility_no, _wo.loan_id::text),
    'Write-off recovery: ' || COALESCE(_reference, ''),
    _lines, _wo.branch_id, 'loan.write_off_recovery', _wo.id,
    COALESCE(_idempotency_key, 'wo-rec:' || _wo.id::text || ':' || now()::text),
    _wo.loan_id
  );

  INSERT INTO public.loan_write_off_recovery (
    write_off_id, company_id, branch_id, recovery_date, amount,
    principal_portion, interest_portion, charges_portion,
    payment_method, reference, notes, journal_entry_id, created_by
  ) VALUES (
    _wo.id, _wo.company_id, _wo.branch_id, COALESCE(_recovery_date, current_date), _amount,
    COALESCE(_principal,0), COALESCE(_interest,0), COALESCE(_charges,0),
    _payment_method, _reference, _notes, _entry_id, auth.uid()
  ) RETURNING id INTO _recovery_id;

  UPDATE public.loan_write_off SET
    principal_recovered = principal_recovered + COALESCE(_principal,0),
    interest_recovered  = interest_recovered  + COALESCE(_interest,0),
    charges_recovered   = charges_recovered   + COALESCE(_charges,0),
    total_recovered     = total_recovered     + _amount,
    is_fully_recovered  = (total_recovered + _amount) >= total_written_off
  WHERE id = _wo.id;

  RETURN _recovery_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.record_write_off_recovery(uuid, date, numeric, numeric, numeric, numeric, text, text, text, text) TO authenticated;
