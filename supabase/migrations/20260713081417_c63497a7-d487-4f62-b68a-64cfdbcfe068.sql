
-- Enums
DO $$ BEGIN
  CREATE TYPE public.fd_dispatch_option AS ENUM ('post','branch','digital');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fd_interest_payment_mode AS ENUM ('bank_transfer','credit_savings');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.introducer_commission_mode AS ENUM ('cash','bank_transfer','credit_savings');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Client bank account
CREATE TABLE IF NOT EXISTS public.client_bank_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.client(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  branch_name text,
  account_no text NOT NULL,
  account_name text NOT NULL,
  swift_code text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_bank_account TO authenticated;
GRANT ALL ON public.client_bank_account TO service_role;
ALTER TABLE public.client_bank_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view client bank accounts" ON public.client_bank_account
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client c JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id = client_bank_account.client_id AND public.is_company_member(b.company_id)
  ));
CREATE POLICY "Members can manage client bank accounts" ON public.client_bank_account
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client c JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id = client_bank_account.client_id AND public.is_company_member(b.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client c JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id = client_bank_account.client_id AND public.is_company_member(b.company_id)
  ));

CREATE INDEX IF NOT EXISTS idx_client_bank_account_client ON public.client_bank_account(client_id);

CREATE TRIGGER trg_client_bank_account_updated_at
BEFORE UPDATE ON public.client_bank_account
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Client: introducer flag + commission defaults
ALTER TABLE public.client
  ADD COLUMN IF NOT EXISTS is_introducer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_commission_pct numeric(6,3),
  ADD COLUMN IF NOT EXISTS default_commission_amount numeric(18,2);

CREATE INDEX IF NOT EXISTS idx_client_is_introducer ON public.client(branch_id) WHERE is_introducer = true;

-- Nominee: link to a client
ALTER TABLE public.fd_nominee
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.client(id) ON DELETE SET NULL;

-- Fixed deposit: new fields
ALTER TABLE public.fixed_deposit
  ADD COLUMN IF NOT EXISTS dispatch_option public.fd_dispatch_option NOT NULL DEFAULT 'branch',
  ADD COLUMN IF NOT EXISTS payout_bank_account_id uuid REFERENCES public.client_bank_account(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interest_payment_mode public.fd_interest_payment_mode NOT NULL DEFAULT 'credit_savings',
  ADD COLUMN IF NOT EXISTS interest_savings_account_id uuid REFERENCES public.savings_account(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketing_officer_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS introducer_id uuid REFERENCES public.client(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS introducer_commission_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS introducer_commission_payment_mode public.introducer_commission_mode;
