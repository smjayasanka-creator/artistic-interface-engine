
ALTER TABLE public.client
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male','female','other')),
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS monthly_income numeric(14,2),
  ADD COLUMN IF NOT EXISTS next_of_kin_name text,
  ADD COLUMN IF NOT EXISTS next_of_kin_phone text;
