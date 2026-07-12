ALTER TABLE public.loan_product
  ADD COLUMN IF NOT EXISTS termination_fee numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS termination_fee_pct numeric(6,3) NOT NULL DEFAULT 0;