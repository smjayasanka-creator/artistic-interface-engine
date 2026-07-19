
-- =====================================================================
-- Complete disburse_loan_from_application: schedule + charges + GL
-- Forward-only replacement of the partial implementation.
-- =====================================================================

-- Idempotency + reference storage on loan
ALTER TABLE public.loan
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS disbursement_channel text,
  ADD COLUMN IF NOT EXISTS disbursement_reference text,
  ADD COLUMN IF NOT EXISTS disbursement_entry_id uuid,
  ADD COLUMN IF NOT EXISTS net_disbursed numeric(18,2);

CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_app_idem
  ON public.loan (application_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND application_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.disburse_loan_from_application(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.disburse_loan_from_application(
  _application_id     uuid,
  _payment_channel    text DEFAULT 'fund_transfer',
  _payment_reference  text DEFAULT NULL,
  _idempotency_key    text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _app                   public.loan_application%ROWTYPE;
  _loan                  public.loan%ROWTYPE;
  _loan_id               uuid;
  _uid                   uuid := auth.uid();
  _principal             numeric(18,2);
  _cap_total             numeric(18,2) := 0;
  _deducted_total        numeric(18,2) := 0;
  _base_amount           numeric(18,2);   -- principal + capitalised (amortised)
  _annual_rate           numeric(12,6);
  _period_rate           numeric(20,10);
  _periods_per_year      int;
  _step_days             int;
  _n                     int;
  _pmt                   numeric(20,6);
  _balance               numeric(20,6);
  _int                   numeric(20,6);
  _prin                  numeric(20,6);
  _seq                   int;
  _due                   date;
  _start                 date;
  _cash_acct             uuid;
  _principal_acct        uuid;
  _fee_acct              uuid;
  _lines                 jsonb := '[]'::jsonb;
  _entry_id              uuid;
  _net_disbursed         numeric(18,2);
  _ref                   text;
  _last_approver         uuid;
  _c                     RECORD;
BEGIN
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'Idempotency key required for disbursement';
  END IF;

  IF _payment_channel NOT IN ('cash','fund_transfer','cheque','sdf_savings') THEN
    RAISE EXCEPTION 'Invalid payment channel: %', _payment_channel;
  END IF;
  IF _payment_channel IN ('fund_transfer','cheque') AND
     (_payment_reference IS NULL OR length(trim(_payment_reference)) = 0) THEN
    RAISE EXCEPTION 'Payment reference required for %', _payment_channel;
  END IF;

  -- Lock the application
  SELECT * INTO _app FROM public.loan_application
    WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application % not found', _application_id; END IF;

  IF NOT public.is_company_member(_app.company_id) THEN
    RAISE EXCEPTION 'Cross-company access denied';
  END IF;

  -- Idempotent replay
  IF _app.status = 'disbursed' AND _app.loan_id IS NOT NULL THEN
    SELECT idempotency_key INTO _ref FROM public.loan WHERE id = _app.loan_id;
    IF _ref IS NOT DISTINCT FROM _idempotency_key OR _ref IS NULL THEN
      RETURN _app.loan_id;
    END IF;
    RAISE EXCEPTION 'Application already disbursed with a different idempotency key';
  END IF;

  IF _app.status <> 'approved' THEN
    RAISE EXCEPTION 'Application must be approved to disburse (status=%)', _app.status;
  END IF;

  -- Authorization: needs the disburse permission (or company/platform admin)
  IF NOT (
        public.has_permission(_uid, 'loans.disburse')
     OR public.is_company_admin(_app.company_id)
     OR public.has_role(_uid, 'platform_admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to disburse loans';
  END IF;

  -- Segregation of duties: creator and last approver cannot self-disburse
  -- unless they are a company/platform admin
  IF NOT (public.is_company_admin(_app.company_id) OR public.has_role(_uid,'platform_admin')) THEN
    IF _app.created_by = _uid THEN
      RAISE EXCEPTION 'Creator of an application cannot disburse it (SoD)';
    END IF;
    SELECT decided_by INTO _last_approver
      FROM public.loan_application_approval
      WHERE application_id = _app.id AND decision IN ('approve','approved')
      ORDER BY decided_at DESC LIMIT 1;
    IF _last_approver IS NOT NULL AND _last_approver = _uid THEN
      RAISE EXCEPTION 'Last approver cannot also disburse the application (SoD)';
    END IF;
  END IF;

  -- Locate the operational loan (created upfront at submitApplication) or create one
  SELECT * INTO _loan FROM public.loan
    WHERE application_id = _app.id
    ORDER BY created_at DESC LIMIT 1
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.loan(
      client_id, product_id, branch_id, officer_id, status,
      principal, term_months, annual_rate_pct, frequency,
      purpose, submitted_at, approved_at, application_id, application_no
    ) VALUES (
      _app.client_id, _app.product_id, _app.branch_id, _app.officer_id,
      'approved'::public.loan_status,
      _app.requested_principal, _app.requested_tenor_months,
      COALESCE(_app.requested_rate_pct, 0),
      COALESCE(_app.frequency, 'monthly'::public.repayment_frequency),
      _app.purpose, _app.submitted_at, _app.decided_at,
      _app.id, _app.application_no
    ) RETURNING * INTO _loan;
  END IF;

  _loan_id := _loan.id;

  -- Aggregate charges: sum(capitalized) and sum(deducted)
  SELECT
    COALESCE(SUM(CASE WHEN COALESCE(lac.capitalize, lc.capitalize) THEN lac.amount ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN COALESCE(lac.capitalize, lc.capitalize) THEN 0 ELSE lac.amount END),0)
  INTO _cap_total, _deducted_total
  FROM public.loan_applied_charge lac
  JOIN public.loan_charge lc ON lc.id = lac.charge_id
  WHERE lac.loan_id = _loan_id;

  _principal   := _loan.principal;
  _base_amount := _principal + _cap_total;
  _net_disbursed := _principal - _deducted_total;
  IF _net_disbursed < 0 THEN
    RAISE EXCEPTION 'Deducted charges (%.2f) exceed principal (%.2f)', _deducted_total, _principal;
  END IF;

  -- Resolve GL mappings from the product
  SELECT cash_account_id, principal_account_id,
         COALESCE(fee_income_account_id, interest_income_account_id)
    INTO _cash_acct, _principal_acct, _fee_acct
    FROM public.loan_product WHERE id = _loan.product_id;

  IF _cash_acct IS NULL OR _principal_acct IS NULL THEN
    RAISE EXCEPTION 'Product missing GL mapping (cash / principal receivable)';
  END IF;

  -- --------------------------------------------------------------
  -- Generate schedule (only if not already generated)
  -- --------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.loan_installment WHERE loan_id = _loan_id) THEN
    SELECT CASE _loan.frequency
             WHEN 'weekly'   THEN 52
             WHEN 'biweekly' THEN 26
             WHEN 'monthly'  THEN 12
           END,
           CASE _loan.frequency
             WHEN 'weekly'   THEN 7
             WHEN 'biweekly' THEN 14
             WHEN 'monthly'  THEN 30
           END
      INTO _periods_per_year, _step_days;

    _n := GREATEST(1, ROUND((_loan.term_months::numeric / 12) * _periods_per_year)::int);
    _annual_rate := COALESCE(_loan.annual_rate_pct, 0);
    _period_rate := (_annual_rate / 100.0) / _periods_per_year;
    _start := (COALESCE(_app.decided_at, now()))::date;
    _balance := _base_amount;

    IF _period_rate > 0 THEN
      _pmt := (_base_amount * _period_rate) / (1 - power(1 + _period_rate, -_n));
    ELSE
      _pmt := _base_amount / _n;
    END IF;

    FOR _seq IN 1.._n LOOP
      _int := ROUND(_balance * _period_rate, 2);
      _prin := ROUND(_pmt - _int, 2);
      IF _seq = _n THEN _prin := ROUND(_balance, 2); END IF;
      _balance := _balance - _prin;
      _due := _start + (_seq * _step_days);
      INSERT INTO public.loan_installment(loan_id, seq, due_date, principal_due, interest_due, fee_due, state)
      VALUES (_loan_id, _seq, _due, _prin, GREATEST(_int,0), 0, 'upcoming');
    END LOOP;
  END IF;

  -- --------------------------------------------------------------
  -- Build balanced GL lines
  -- --------------------------------------------------------------
  _ref := 'DISB-'||_app.application_no;

  -- DR Principal Receivable = principal
  _lines := _lines || jsonb_build_object(
    'account_id', _principal_acct, 'debit', _principal, 'credit', 0,
    'memo', 'Loan principal disbursed');

  -- Per-charge lines
  FOR _c IN
    SELECT lac.amount,
           COALESCE(lac.capitalize, lc.capitalize) AS capitalize,
           lc.credit_account_id,
           lc.capitalized_receivable_account_id,
           lc.name
      FROM public.loan_applied_charge lac
      JOIN public.loan_charge lc ON lc.id = lac.charge_id
      WHERE lac.loan_id = _loan_id AND lac.amount > 0
  LOOP
    IF _c.capitalize THEN
      IF _c.capitalized_receivable_account_id IS NULL THEN
        RAISE EXCEPTION 'Charge % missing capitalised receivable account', _c.name;
      END IF;
      _lines := _lines || jsonb_build_object(
        'account_id', _c.capitalized_receivable_account_id,
        'debit', _c.amount, 'credit', 0,
        'memo', 'Capitalised charge · '||_c.name);
      _lines := _lines || jsonb_build_object(
        'account_id', _c.credit_account_id,
        'debit', 0, 'credit', _c.amount,
        'memo', 'Charge income · '||_c.name);
    ELSE
      _lines := _lines || jsonb_build_object(
        'account_id', _c.credit_account_id,
        'debit', 0, 'credit', _c.amount,
        'memo', 'Charge deducted · '||_c.name);
    END IF;
  END LOOP;

  -- CR Cash = net disbursed
  IF _net_disbursed > 0 THEN
    _lines := _lines || jsonb_build_object(
      'account_id', _cash_acct, 'debit', 0, 'credit', _net_disbursed,
      'memo', 'Net cash disbursed');
  END IF;

  _entry_id := public.post_entry(
    (now() AT TIME ZONE 'UTC')::date,
    _ref,
    'Disbursement · '||_app.application_no||' · '||_payment_channel||
      COALESCE(' · '||NULLIF(_payment_reference,''),''),
    _lines,
    _loan.branch_id,
    'loans',
    _loan_id,
    'disb:'||_app.id::text||':'||_idempotency_key,
    _loan_id
  );

  -- --------------------------------------------------------------
  -- Persist loan + application state
  -- --------------------------------------------------------------
  UPDATE public.loan
     SET status = 'disbursed'::public.loan_status,
         disbursed_at = now(),
         approved_at = COALESCE(approved_at, _app.decided_at, now()),
         idempotency_key = _idempotency_key,
         disbursement_channel = _payment_channel,
         disbursement_reference = _payment_reference,
         disbursement_entry_id = _entry_id,
         net_disbursed = _net_disbursed
   WHERE id = _loan_id;

  UPDATE public.loan_application
     SET status = 'disbursed'::public.loan_application_status,
         loan_id = _loan_id,
         disbursed_at = now(),
         updated_at = now()
   WHERE id = _app.id;

  INSERT INTO public.loan_application_status_history(
    application_id, application_no, from_status, to_status, actor_id, reason)
  VALUES (_app.id, _app.application_no, _app.status, 'disbursed'::public.loan_application_status,
          _uid,
          'Disbursed via '||_payment_channel||COALESCE(' ref '||_payment_reference,''));

  PERFORM public.emit_audit(
    _app.company_id, 'loan_application.disbursed',
    'loan_application', _app.id, NULL,
    jsonb_build_object(
      'loan_id',            _loan_id,
      'application_no',     _app.application_no,
      'principal',          _principal,
      'capitalized_total',  _cap_total,
      'deducted_total',     _deducted_total,
      'net_disbursed',      _net_disbursed,
      'entry_id',           _entry_id,
      'installments',       (SELECT count(*) FROM public.loan_installment WHERE loan_id = _loan_id)
    ),
    jsonb_build_object(
      'payment_channel',   _payment_channel,
      'payment_reference', _payment_reference,
      'idempotency_key',   _idempotency_key
    )
  );

  RETURN _loan_id;
END $fn$;

GRANT EXECUTE ON FUNCTION public.disburse_loan_from_application(uuid, text, text, text)
  TO authenticated;
