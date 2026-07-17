ALTER TABLE public.company
  ADD COLUMN IF NOT EXISTS auto_eod_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_eod_time time NOT NULL DEFAULT '00:30:00';