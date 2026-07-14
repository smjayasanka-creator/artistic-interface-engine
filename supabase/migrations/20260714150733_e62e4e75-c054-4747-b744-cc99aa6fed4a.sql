
ALTER TABLE public.loan
  ADD COLUMN IF NOT EXISTS schedule_type text NOT NULL DEFAULT 'normal'
    CHECK (schedule_type IN ('normal','structured')),
  ADD COLUMN IF NOT EXISTS schedule_overrides jsonb;

ALTER TABLE public.loan_installment
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;
