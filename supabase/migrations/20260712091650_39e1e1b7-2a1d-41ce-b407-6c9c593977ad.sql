ALTER TABLE public.gl_account
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS branch_ids uuid[];