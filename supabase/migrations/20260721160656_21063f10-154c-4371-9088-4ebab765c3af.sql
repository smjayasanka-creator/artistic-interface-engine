CREATE OR REPLACE FUNCTION public.eod_write_snapshots(_branch_id uuid, _business_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _company_id uuid;
  _savings_count int := 0;
  _fd_count int := 0;
  _loan_count int := 0;
  _gl_count int := 0;
  _is_service boolean := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  SELECT company_id INTO _company_id FROM public.branch WHERE id = _branch_id;
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;

  IF NOT (_is_service
       OR public.has_permission(auth.uid(), 'eod.process', _company_id)
       OR public.is_company_admin(_company_id)
       OR public.has_role(auth.uid(), 'platform_admin')) THEN
    RAISE EXCEPTION 'Missing permission eod.process';
  END IF;

  -- Savings balances use same-day movements plus prior EOD closing balance.
  WITH movements AS (
    SELECT sa.company_id, sa.branch_id, sa.id AS account_id,
      COALESCE(SUM(CASE WHEN st.txn_type IN ('deposit', 'opening') THEN st.amount ELSE 0 END), 0) AS deposits,
      COALESCE(SUM(CASE WHEN st.txn_type IN ('withdrawal', 'closure') THEN st.amount ELSE 0 END), 0) AS withdrawals,
      COALESCE(SUM(CASE WHEN st.txn_type = 'interest' THEN st.amount ELSE 0 END), 0) AS interest,
      COALESCE(SUM(CASE WHEN st.txn_type = 'fee' THEN st.amount ELSE 0 END), 0) AS fees,
      COALESCE(SUM(CASE WHEN st.txn_type = 'adjustment' THEN st.amount ELSE 0 END), 0) AS adjustments,
      COUNT(st.id) AS txn_count
    FROM public.savings_account sa
    LEFT JOIN public.savings_transaction st
      ON st.account_id = sa.id
     AND st.txn_date = _business_date
    WHERE sa.branch_id = _branch_id
    GROUP BY sa.company_id, sa.branch_id, sa.id
  ),
  prior AS (
    SELECT DISTINCT ON (account_id) account_id, closing_balance
    FROM public.savings_eod_balance
    WHERE branch_id = _branch_id
      AND business_date < _business_date
    ORDER BY account_id, business_date DESC
  ),
  ins AS (
    INSERT INTO public.savings_eod_balance
      (company_id, branch_id, account_id, business_date, opening_balance, deposits, withdrawals, interest, fees, closing_balance, txn_count)
    SELECT m.company_id, m.branch_id, m.account_id, _business_date,
      COALESCE(p.closing_balance, 0),
      m.deposits,
      m.withdrawals,
      m.interest,
      m.fees,
      COALESCE(p.closing_balance, 0) + m.deposits - m.withdrawals + m.interest - m.fees + m.adjustments,
      m.txn_count
    FROM movements m
    LEFT JOIN prior p ON p.account_id = m.account_id
    ON CONFLICT (business_date, account_id) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO _savings_count FROM ins;

  -- Fixed deposits use fd_accrual.daily_amount and fd_transaction.amount.
  WITH base AS (
    SELECT fd.company_id, fd.branch_id, fd.id AS deposit_id, fd.principal, fd.status::text AS status
    FROM public.fixed_deposit fd
    WHERE fd.branch_id = _branch_id
      AND fd.value_date <= _business_date
      AND (fd.closed_at IS NULL OR fd.closed_at::date > _business_date)
  ),
  paid AS (
    SELECT ft.deposit_id, COALESCE(SUM(ft.amount), 0) AS interest_paid
    FROM public.fd_transaction ft
    WHERE ft.txn_date <= _business_date
      AND ft.type = 'interest_payout'
    GROUP BY ft.deposit_id
  ),
  accrued AS (
    SELECT fa.deposit_id, COALESCE(SUM(fa.daily_amount), 0) AS accrued_interest
    FROM public.fd_accrual fa
    WHERE fa.accrual_date <= _business_date
    GROUP BY fa.deposit_id
  ),
  ins AS (
    INSERT INTO public.fd_eod_balance
      (company_id, branch_id, deposit_id, business_date, principal, accrued_interest, interest_paid, closing_balance, status)
    SELECT b.company_id, b.branch_id, b.deposit_id, _business_date,
      b.principal,
      COALESCE(a.accrued_interest, 0),
      COALESCE(p.interest_paid, 0),
      b.principal + COALESCE(a.accrued_interest, 0) - COALESCE(p.interest_paid, 0),
      b.status
    FROM base b
    LEFT JOIN accrued a ON a.deposit_id = b.deposit_id
    LEFT JOIN paid p ON p.deposit_id = b.deposit_id
    ON CONFLICT (business_date, deposit_id) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO _fd_count FROM ins;

  -- Loans use current loan_accrual.daily_amount and same-day repayments.
  WITH base AS (
    SELECT br.company_id, l.branch_id, l.id AS loan_id, l.principal, l.status::text AS status,
           l.disbursed_at::date AS disb_date
    FROM public.loan l
    JOIN public.branch br ON br.id = l.branch_id
    WHERE l.branch_id = _branch_id
      AND l.disbursed_at IS NOT NULL
      AND l.disbursed_at::date <= _business_date
  ),
  prior AS (
    SELECT DISTINCT ON (loan_id) loan_id, closing_principal
    FROM public.loan_eod_balance
    WHERE branch_id = _branch_id
      AND business_date < _business_date
    ORDER BY loan_id, business_date DESC
  ),
  disb AS (
    SELECT l.id AS loan_id, l.principal
    FROM public.loan l
    WHERE l.branch_id = _branch_id
      AND l.disbursed_at IS NOT NULL
      AND l.disbursed_at::date = _business_date
  ),
  rep AS (
    SELECT r.loan_id,
      COALESCE(SUM(r.allocated_principal), 0) AS principal_paid,
      COALESCE(SUM(r.allocated_interest), 0) AS interest_paid,
      COALESCE(SUM(r.allocated_fees), 0) AS fees_paid
    FROM public.repayment r
    WHERE r.received_at::date = _business_date
    GROUP BY r.loan_id
  ),
  accr AS (
    SELECT la.loan_id, COALESCE(SUM(la.daily_amount), 0) AS interest_accrued
    FROM public.loan_accrual la
    WHERE la.accrual_date = _business_date
    GROUP BY la.loan_id
  ),
  arrears AS (
    SELECT li.loan_id,
      COALESCE(SUM(GREATEST(COALESCE(li.principal_due, 0) - COALESCE(li.principal_paid, 0), 0)), 0) AS amount
    FROM public.loan_installment li
    WHERE li.due_date <= _business_date
    GROUP BY li.loan_id
  ),
  ins AS (
    INSERT INTO public.loan_eod_balance
      (company_id, branch_id, loan_id, business_date, opening_principal, disbursed, principal_paid,
       interest_accrued, interest_paid, fees_paid, closing_principal, arrears, status)
    SELECT b.company_id, b.branch_id, b.loan_id, _business_date,
      CASE WHEN b.disb_date = _business_date THEN 0 ELSE COALESCE(p.closing_principal, b.principal) END,
      COALESCE(d.principal, 0),
      COALESCE(r.principal_paid, 0),
      COALESCE(a.interest_accrued, 0),
      COALESCE(r.interest_paid, 0),
      COALESCE(r.fees_paid, 0),
      GREATEST(
        (CASE WHEN b.disb_date = _business_date THEN 0 ELSE COALESCE(p.closing_principal, b.principal) END)
        + COALESCE(d.principal, 0)
        - COALESCE(r.principal_paid, 0),
        0
      ),
      COALESCE(ar.amount, 0),
      b.status
    FROM base b
    LEFT JOIN prior p ON p.loan_id = b.loan_id
    LEFT JOIN disb d ON d.loan_id = b.loan_id
    LEFT JOIN rep r ON r.loan_id = b.loan_id
    LEFT JOIN accr a ON a.loan_id = b.loan_id
    LEFT JOIN arrears ar ON ar.loan_id = b.loan_id
    ON CONFLICT (business_date, loan_id) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO _loan_count FROM ins;

  -- GL balances use posting.entry_id and current gl_eod_balance column names.
  WITH today AS (
    SELECT p.account_id,
      COALESCE(SUM(p.debit), 0) AS debit_total,
      COALESCE(SUM(p.credit), 0) AS credit_total
    FROM public.posting p
    JOIN public.journal_entry je ON je.id = p.entry_id
    WHERE je.branch_id = _branch_id
      AND je.entry_date = _business_date
    GROUP BY p.account_id
  ),
  prior AS (
    SELECT DISTINCT ON (account_id) account_id, closing_balance
    FROM public.gl_eod_balance
    WHERE branch_id = _branch_id
      AND business_date < _business_date
    ORDER BY account_id, business_date DESC
  ),
  ins AS (
    INSERT INTO public.gl_eod_balance
      (company_id, branch_id, account_id, business_date, opening_balance, debit_total, credit_total, closing_balance)
    SELECT _company_id, _branch_id, ga.id, _business_date,
      COALESCE(pr.closing_balance, 0),
      COALESCE(t.debit_total, 0),
      COALESCE(t.credit_total, 0),
      COALESCE(pr.closing_balance, 0) + COALESCE(t.debit_total, 0) - COALESCE(t.credit_total, 0)
    FROM public.gl_account ga
    LEFT JOIN today t ON t.account_id = ga.id
    LEFT JOIN prior pr ON pr.account_id = ga.id
    WHERE ga.company_id = _company_id
      AND (t.account_id IS NOT NULL OR pr.account_id IS NOT NULL)
    ON CONFLICT (business_date, account_id, branch_id) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO _gl_count FROM ins;

  RETURN jsonb_build_object(
    'savings_accounts', _savings_count,
    'fd_deposits', _fd_count,
    'loans', _loan_count,
    'gl_accounts', _gl_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.eod_write_snapshots(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eod_write_snapshots(uuid, date) TO service_role;