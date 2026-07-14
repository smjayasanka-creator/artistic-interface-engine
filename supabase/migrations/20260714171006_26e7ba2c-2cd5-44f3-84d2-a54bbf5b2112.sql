ALTER TABLE public.loan_product ADD COLUMN IF NOT EXISTS segment text NOT NULL DEFAULT 'micro';
ALTER TABLE public.loan_product DROP CONSTRAINT IF EXISTS loan_product_segment_check;
ALTER TABLE public.loan_product ADD CONSTRAINT loan_product_segment_check CHECK (segment IN ('micro','sme','leasing','housing','society','cashback','gold'));
CREATE INDEX IF NOT EXISTS loan_product_segment_idx ON public.loan_product (segment, is_active);