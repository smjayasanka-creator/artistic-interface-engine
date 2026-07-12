ALTER TABLE public.branch
  ADD COLUMN IF NOT EXISTS branch_prefix text,
  ADD COLUMN IF NOT EXISTS savings_prefix text,
  ADD COLUMN IF NOT EXISTS fd_prefix text,
  ADD COLUMN IF NOT EXISTS loan_prefix text;