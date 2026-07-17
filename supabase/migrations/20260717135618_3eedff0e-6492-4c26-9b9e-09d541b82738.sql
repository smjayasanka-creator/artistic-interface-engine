-- FD accrual GL tracking + standard FD chart accounts seed

ALTER TABLE public.fd_accrual
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_ref text;

CREATE INDEX IF NOT EXISTS fd_accrual_unreleased_idx
  ON public.fd_accrual (deposit_id)
  WHERE released_at IS NULL;

-- Seed standard FD chart-of-accounts codes for every company that already has
-- any gl_account rows. Idempotent via UNIQUE(company_id, code).
INSERT INTO public.gl_account (company_id, code, name, type, normal_balance, is_active)
SELECT c.company_id, x.code, x.name, x.type::public.account_type, x.nb, true
  FROM (SELECT DISTINCT company_id FROM public.gl_account) c
  CROSS JOIN (VALUES
    ('1000', 'Cash on hand',                        'asset',      1),
    ('2200', 'Fixed Deposit Liability',             'liability', -1),
    ('2210', 'Accrued Interest Payable - FD',       'liability', -1),
    ('2300', 'WHT Payable',                         'liability', -1),
    ('5200', 'Interest Expense - FD',               'expense',    1)
  ) AS x(code, name, type, nb)
ON CONFLICT (company_id, code) DO NOTHING;
