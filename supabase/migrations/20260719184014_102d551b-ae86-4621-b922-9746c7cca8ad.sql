
-- =====================================================================
-- Repayment RPC + repayment table extensions
-- Provides the canonical public.record_repayment(...) RPC the UI expects.
-- =====================================================================

-- 1. Extend repayment table (allocation breakdown, references, idempotency)
ALTER TABLE public.repayment
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS allocated_fees numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allocated_interest numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allocated_principal numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unallocated_amount numeric(18,2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_repayment_idem
  ON public.repayment (loan_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. record_repayment RPC
-- Policy: allocate fees -> interest -> principal, oldest installment first.
-- Idempotent by (loan_id, idempotency_key). Posts a balanced ledger entry
-- via public.post_entry. Closes the loan when nothing is left outstanding.
CREATE OR REPLACE FUNCTION public.record_repayment(
  _loan_id uuid,
  _amount numeric,
  _channel text,
  _reference text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _received_at timestamptz DEFAULT now(),
  _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _loan public.loan%ROWTYPE;
  _branch_company uuid;
  _staff_branch uuid;
  _existing public.repayment%ROWTYPE;
  _remaining numeric(18,2);
  _alloc_fees numeric(18,2) := 0;
  _alloc_int  numeric(18,2) := 0;
  _alloc_prin numeric(18,2) := 0;
  _apply numeric(18,2);
  _outstanding numeric(18,2);
  _inst RECORD;
  _cash_id uuid; _ar_id uuid; _int_id uuid; _fee_id uuid;
  _entry_id uuid;
  _lines jsonb;
  _ref text;
  _repayment_id uuid;
  _closed boolean := false;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Repayment amount must be positive';
  END IF;
  IF _channel NOT IN ('cash','mpesa','bank','internal') THEN
    RAISE EXCEPTION 'Invalid payment channel: %', _channel;
  END IF;

  -- Lock the loan row
  SELECT * INTO _loan FROM public.loan WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan % not found', _loan_id; END IF;

  SELECT company_id INTO _branch_company FROM public.branch WHERE id = _loan.branch_id;
  IF _branch_company IS NULL THEN
    RAISE EXCEPTION 'Loan branch % not found', _loan.branch_id;
  END IF;

  -- Authorization: collections.post permission, company admin, or platform admin
  IF NOT (
    public.has_permission(auth.uid(), 'collections.post')
    OR public.is_company_admin(_branch_company)
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to post repayments';
  END IF;
  IF NOT public.is_company_member(_branch_company) THEN
    RAISE EXCEPTION 'Cross-company access denied';
  END IF;

  -- Branch scope: non-admins must be at the loan's branch
  IF NOT (public.is_company_admin(_branch_company) OR public.has_role(auth.uid(),'admin')) THEN
    SELECT branch_id INTO _staff_branch FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
    IF _staff_branch IS NOT NULL AND _staff_branch <> _loan.branch_id THEN
      RAISE EXCEPTION 'Cross-branch repayment blocked';
    END IF;
  END IF;

  IF _loan.status NOT IN ('disbursed','active') THEN
    RAISE EXCEPTION 'Loan status % does not accept repayments', _loan.status;
  END IF;

  -- Idempotency: return existing result on replay
  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO _existing FROM public.repayment
      WHERE loan_id = _loan_id AND idempotency_key = _idempotency_key
      LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'repayment_id',        _existing.id,
        'reference',           _existing.reference,
        'allocated_fees',      _existing.allocated_fees,
        'allocated_interest',  _existing.allocated_interest,
        'allocated_principal', _existing.allocated_principal,
        'unallocated_amount',  _existing.unallocated_amount,
        'loan_closed',         (SELECT status = 'closed' FROM public.loan WHERE id = _loan_id),
        'idempotent_replay',   true
      );
    END IF;
  END IF;

  _remaining := _amount;

  -- Pass 1: outstanding FEES, oldest first
  FOR _inst IN
    SELECT id, fee_due, fee_paid
      FROM public.loan_installment
     WHERE loan_id = _loan_id AND fee_due > fee_paid
     ORDER BY seq ASC
     FOR UPDATE
  LOOP
    EXIT WHEN _remaining <= 0;
    _apply := LEAST(_remaining, _inst.fee_due - _inst.fee_paid);
    UPDATE public.loan_installment SET fee_paid = fee_paid + _apply WHERE id = _inst.id;
    _remaining := _remaining - _apply;
    _alloc_fees := _alloc_fees + _apply;
  END LOOP;

  -- Pass 2: outstanding INTEREST, oldest first
  FOR _inst IN
    SELECT id, interest_due, interest_paid
      FROM public.loan_installment
     WHERE loan_id = _loan_id AND interest_due > interest_paid
     ORDER BY seq ASC
     FOR UPDATE
  LOOP
    EXIT WHEN _remaining <= 0;
    _apply := LEAST(_remaining, _inst.interest_due - _inst.interest_paid);
    UPDATE public.loan_installment SET interest_paid = interest_paid + _apply WHERE id = _inst.id;
    _remaining := _remaining - _apply;
    _alloc_int := _alloc_int + _apply;
  END LOOP;

  -- Pass 3: outstanding PRINCIPAL, oldest first
  FOR _inst IN
    SELECT id, principal_due, principal_paid
      FROM public.loan_installment
     WHERE loan_id = _loan_id AND principal_due > principal_paid
     ORDER BY seq ASC
     FOR UPDATE
  LOOP
    EXIT WHEN _remaining <= 0;
    _apply := LEAST(_remaining, _inst.principal_due - _inst.principal_paid);
    UPDATE public.loan_installment SET principal_paid = principal_paid + _apply WHERE id = _inst.id;
    _remaining := _remaining - _apply;
    _alloc_prin := _alloc_prin + _apply;
  END LOOP;

  IF (_alloc_fees + _alloc_int + _alloc_prin) <= 0 THEN
    RAISE EXCEPTION 'No outstanding installments to allocate against';
  END IF;

  -- Roll installment states
  UPDATE public.loan_installment
     SET state = CASE
       WHEN principal_paid >= principal_due
        AND interest_paid  >= interest_due
        AND fee_paid       >= fee_due       THEN 'paid'::public.installment_state
       WHEN (principal_paid + interest_paid + fee_paid) > 0
                                            THEN 'partial'::public.installment_state
       ELSE state
     END
   WHERE loan_id = _loan_id;

  -- Resolve GL accounts: product mapping first, fall back to chart codes
  SELECT
    COALESCE(p.cash_account_id,              (SELECT id FROM public.gl_account WHERE code='1000' LIMIT 1)),
    COALESCE(p.principal_account_id,         (SELECT id FROM public.gl_account WHERE code='1100' LIMIT 1)),
    COALESCE(p.interest_income_account_id,   (SELECT id FROM public.gl_account WHERE code='4000' LIMIT 1)),
    COALESCE(p.fee_income_account_id,
             p.interest_income_account_id,
             (SELECT id FROM public.gl_account WHERE code='4100' LIMIT 1),
             (SELECT id FROM public.gl_account WHERE code='4000' LIMIT 1))
  INTO _cash_id, _ar_id, _int_id, _fee_id
  FROM public.loan_product p WHERE p.id = _loan.product_id;

  IF _cash_id IS NULL OR _ar_id IS NULL OR _int_id IS NULL OR _fee_id IS NULL THEN
    RAISE EXCEPTION 'Chart of accounts missing: configure cash, principal receivable, interest income, and fee income accounts';
  END IF;

  _ref := COALESCE(NULLIF(TRIM(_reference),''),
                   'REP-'||to_char(now(),'YYMMDDHH24MISS')||'-'||substr(gen_random_uuid()::text,1,4));

  -- Build the balanced journal lines
  _lines := jsonb_build_array(
    jsonb_build_object('account_id', _cash_id,
                       'debit',  (_amount - _remaining),
                       'credit', 0,
                       'memo',   'Repayment cash')
  );
  IF _alloc_fees > 0 THEN
    _lines := _lines || jsonb_build_object('account_id', _fee_id,
                                           'debit', 0, 'credit', _alloc_fees, 'memo', 'Fees');
  END IF;
  IF _alloc_int > 0 THEN
    _lines := _lines || jsonb_build_object('account_id', _int_id,
                                           'debit', 0, 'credit', _alloc_int, 'memo', 'Interest');
  END IF;
  IF _alloc_prin > 0 THEN
    _lines := _lines || jsonb_build_object('account_id', _ar_id,
                                           'debit', 0, 'credit', _alloc_prin, 'memo', 'Principal');
  END IF;

  -- Post the balanced ledger entry (this raises if unbalanced, rolling us back)
  _entry_id := public.post_entry(
    (_received_at AT TIME ZONE 'UTC')::date,
    _ref,
    'Repayment · '||_channel||COALESCE(' · '||NULLIF(_reference,''),''),
    _lines,
    _loan.branch_id,
    'loans',
    _loan.id,
    COALESCE(_idempotency_key, 'rep:'||_loan.id::text||':'||_ref),
    _loan.id
  );

  -- Persist the repayment record with the allocation breakdown
  INSERT INTO public.repayment (
    loan_id, entry_id, amount, channel, received_by, received_at,
    idempotency_key, reference, notes,
    allocated_fees, allocated_interest, allocated_principal, unallocated_amount
  ) VALUES (
    _loan.id, _entry_id, _amount, _channel::public.payment_channel,
    (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1),
    _received_at,
    _idempotency_key, _ref, _notes,
    _alloc_fees, _alloc_int, _alloc_prin, _remaining
  ) RETURNING id INTO _repayment_id;

  -- Close the loan when everything is settled
  SELECT
      COALESCE(SUM(principal_due - principal_paid),0)
    + COALESCE(SUM(interest_due  - interest_paid ),0)
    + COALESCE(SUM(fee_due       - fee_paid      ),0)
    INTO _outstanding
  FROM public.loan_installment
  WHERE loan_id = _loan_id;

  IF _outstanding <= 0 THEN
    UPDATE public.loan SET status = 'closed'::public.loan_status WHERE id = _loan_id;
    _closed := true;
  ELSIF _loan.status = 'disbursed' THEN
    UPDATE public.loan SET status = 'active'::public.loan_status WHERE id = _loan_id;
  END IF;

  PERFORM public.emit_audit(
    _branch_company, 'loan.repayment_posted', 'repayment', _repayment_id, NULL,
    jsonb_build_object(
      'loan_id', _loan_id, 'amount', _amount,
      'allocated_fees', _alloc_fees,
      'allocated_interest', _alloc_int,
      'allocated_principal', _alloc_prin,
      'unallocated', _remaining,
      'reference', _ref,
      'loan_closed', _closed
    ),
    jsonb_build_object('channel', _channel, 'idempotency_key', _idempotency_key)
  );

  RETURN jsonb_build_object(
    'repayment_id',        _repayment_id,
    'reference',           _ref,
    'allocated_fees',      _alloc_fees,
    'allocated_interest',  _alloc_int,
    'allocated_principal', _alloc_prin,
    'unallocated_amount',  _remaining,
    'loan_closed',         _closed
  );
END $fn$;

REVOKE ALL ON FUNCTION public.record_repayment(uuid, numeric, text, text, text, timestamptz, text)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_repayment(uuid, numeric, text, text, text, timestamptz, text)
  TO authenticated;
