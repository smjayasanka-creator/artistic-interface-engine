ALTER TABLE public.savings_product ADD COLUMN IF NOT EXISTS segment text NOT NULL DEFAULT 'normal';
UPDATE public.savings_product SET segment = 'normal' WHERE segment IS NULL;
ALTER TABLE public.savings_product DROP CONSTRAINT IF EXISTS savings_product_segment_check;
ALTER TABLE public.savings_product ADD CONSTRAINT savings_product_segment_check CHECK (segment IN ('normal','minor','senior','fixed','transaction'));
CREATE INDEX IF NOT EXISTS savings_product_company_segment_active_idx ON public.savings_product (company_id, segment, active);