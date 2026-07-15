ALTER TABLE public.fd_product
  ADD COLUMN IF NOT EXISTS min_tenure_months integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_tenure_months integer NOT NULL DEFAULT 60;

ALTER TABLE public.fd_product
  DROP CONSTRAINT IF EXISTS fd_product_tenure_range_chk;
ALTER TABLE public.fd_product
  ADD CONSTRAINT fd_product_tenure_range_chk
  CHECK (min_tenure_months >= 1 AND max_tenure_months >= min_tenure_months);