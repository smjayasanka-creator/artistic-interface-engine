
ALTER TABLE public.repayment      ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.loan           ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.fixed_deposit  ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.fd_transaction ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS repayment_idem_key_uidx
  ON public.repayment (loan_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS loan_idem_key_uidx
  ON public.loan (branch_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fixed_deposit_idem_key_uidx
  ON public.fixed_deposit (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fd_transaction_idem_key_uidx
  ON public.fd_transaction (deposit_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
