
-- ============================================================
-- 1. COMPANY table
-- ============================================================
CREATE TABLE public.company (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  currency char(3) NOT NULL DEFAULT 'KES',
  country text NOT NULL DEFAULT 'Kenya',
  fy_end_month smallint NOT NULL DEFAULT 12 CHECK (fy_end_month BETWEEN 1 AND 12),
  fy_end_day smallint NOT NULL DEFAULT 31 CHECK (fy_end_day BETWEEN 1 AND 31),
  timezone text NOT NULL DEFAULT 'Africa/Nairobi',
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company TO authenticated;
GRANT ALL ON public.company TO service_role;
ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Add company_id to workspace-owned tables (nullable, backfill, then NOT NULL)
-- ============================================================
ALTER TABLE public.branch       ADD COLUMN company_id uuid REFERENCES public.company(id) ON DELETE CASCADE;
ALTER TABLE public.gl_account   ADD COLUMN company_id uuid REFERENCES public.company(id) ON DELETE CASCADE;
ALTER TABLE public.loan_product ADD COLUMN company_id uuid REFERENCES public.company(id) ON DELETE CASCADE;

-- Backfill: create a Default Company owned by the earliest admin user (if any), else earliest user
DO $$
DECLARE
  _owner uuid;
  _company_id uuid;
BEGIN
  SELECT ur.user_id INTO _owner
    FROM public.user_roles ur
    WHERE ur.role = 'admin'
    ORDER BY ur.created_at ASC LIMIT 1;
  IF _owner IS NULL THEN
    SELECT id INTO _owner FROM auth.users ORDER BY created_at ASC LIMIT 1;
  END IF;

  INSERT INTO public.company (name, slug, owner_user_id)
    VALUES ('Default Company', 'default', _owner)
    RETURNING id INTO _company_id;

  UPDATE public.branch       SET company_id = _company_id WHERE company_id IS NULL;
  UPDATE public.gl_account   SET company_id = _company_id WHERE company_id IS NULL;
  UPDATE public.loan_product SET company_id = _company_id WHERE company_id IS NULL;
END $$;

ALTER TABLE public.branch       ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.gl_account   ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.loan_product ALTER COLUMN company_id SET NOT NULL;

-- gl_account.code should be unique per company, not globally
ALTER TABLE public.gl_account DROP CONSTRAINT IF EXISTS gl_account_code_key;
ALTER TABLE public.gl_account ADD CONSTRAINT gl_account_company_code_key UNIQUE (company_id, code);

-- branch.code unique per company
ALTER TABLE public.branch DROP CONSTRAINT IF EXISTS branch_code_key;
ALTER TABLE public.branch ADD CONSTRAINT branch_company_code_key UNIQUE (company_id, code);

-- ============================================================
-- 3. Allow multiple staff rows per user (one per company/branch)
-- ============================================================
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_user_id_key;
ALTER TABLE public.staff ADD CONSTRAINT staff_user_branch_key UNIQUE (user_id, branch_id);

-- ============================================================
-- 4. Helper functions
-- ============================================================

-- Membership: is the current user a member of the given company (any branch)?
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    JOIN public.branch b ON b.id = s.branch_id
    WHERE s.user_id = auth.uid() AND b.company_id = _company_id
  );
$$;

-- Is current user admin of the given company?
CREATE OR REPLACE FUNCTION public.is_company_admin(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    JOIN public.branch b ON b.id = s.branch_id
    WHERE s.user_id = auth.uid()
      AND b.company_id = _company_id
      AND s.role = 'admin'::public.staff_role
  );
$$;

-- Current (first) company id for the signed-in user
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.company_id
    FROM public.staff s
    JOIN public.branch b ON b.id = s.branch_id
   WHERE s.user_id = auth.uid()
   ORDER BY s.created_at ASC LIMIT 1;
$$;

-- ============================================================
-- 5. RLS on company
-- ============================================================
DROP POLICY IF EXISTS "members read company" ON public.company;
CREATE POLICY "members read company" ON public.company FOR SELECT TO authenticated
  USING (public.is_company_member(id));

DROP POLICY IF EXISTS "admins update company" ON public.company;
CREATE POLICY "admins update company" ON public.company FOR UPDATE TO authenticated
  USING (public.is_company_admin(id)) WITH CHECK (public.is_company_admin(id));

DROP POLICY IF EXISTS "any authenticated can create company" ON public.company;
CREATE POLICY "any authenticated can create company" ON public.company FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

-- ============================================================
-- 6. Extend branch/gl_account/loan_product RLS to enforce company membership
-- ============================================================
DROP POLICY IF EXISTS "members read branch" ON public.branch;
CREATE POLICY "members read branch" ON public.branch FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "admins write branch v2" ON public.branch;
CREATE POLICY "admins write branch v2" ON public.branch FOR ALL TO authenticated
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

DROP POLICY IF EXISTS "members read gl_account" ON public.gl_account;
CREATE POLICY "members read gl_account" ON public.gl_account FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "admins write gl_account v2" ON public.gl_account;
CREATE POLICY "admins write gl_account v2" ON public.gl_account FOR ALL TO authenticated
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

DROP POLICY IF EXISTS "members read loan_product" ON public.loan_product;
CREATE POLICY "members read loan_product" ON public.loan_product FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "admins write loan_product v2" ON public.loan_product;
CREATE POLICY "admins write loan_product v2" ON public.loan_product FOR ALL TO authenticated
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

-- ============================================================
-- 7. company_invite table
-- ============================================================
CREATE TABLE public.company_invite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.staff_role NOT NULL DEFAULT 'loan_officer',
  branch_id uuid REFERENCES public.branch(id) ON DELETE SET NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_invite_email_idx ON public.company_invite (lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_invite TO authenticated;
GRANT ALL ON public.company_invite TO service_role;
ALTER TABLE public.company_invite ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage invites" ON public.company_invite FOR ALL TO authenticated
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "invitee reads own invites" ON public.company_invite FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce((auth.jwt() ->> 'email'), '')));

-- ============================================================
-- 8. Rewrite handle_new_user: per-user company creation, or auto-join via invite
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _company_id uuid;
  _branch_id  uuid;
  _full_name  text;
  _company_name text;
  _invite     public.company_invite%ROWTYPE;
  _role       public.staff_role;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1));

  -- Prefer earliest non-expired, unaccepted invite for this email
  SELECT * INTO _invite
    FROM public.company_invite
   WHERE lower(email) = lower(NEW.email)
     AND accepted_at IS NULL
     AND expires_at > now()
   ORDER BY created_at ASC LIMIT 1;

  IF FOUND THEN
    _company_id := _invite.company_id;
    _role := _invite.role;
    _branch_id := COALESCE(
      _invite.branch_id,
      (SELECT id FROM public.branch WHERE company_id = _company_id ORDER BY created_at ASC LIMIT 1)
    );

    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, CASE WHEN _role = 'admin' THEN 'admin'::public.app_role
                           WHEN _role = 'branch_manager' THEN 'branch_manager'::public.app_role
                           ELSE 'loan_officer'::public.app_role END)
      ON CONFLICT DO NOTHING;

    INSERT INTO public.staff (user_id, branch_id, full_name, role, email)
      VALUES (NEW.id, _branch_id, _full_name, _role, NEW.email);

    UPDATE public.company_invite
       SET accepted_at = now(), accepted_by = NEW.id
     WHERE id = _invite.id;

  ELSE
    _company_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
                              _full_name || '''s Workspace');

    INSERT INTO public.company (name, owner_user_id,
                                currency, country, fy_end_month, fy_end_day, timezone)
      VALUES (_company_name, NEW.id,
              COALESCE(NULLIF(NEW.raw_user_meta_data->>'currency',''), 'KES'),
              COALESCE(NULLIF(NEW.raw_user_meta_data->>'country',''), 'Kenya'),
              12, 31, 'Africa/Nairobi')
      RETURNING id INTO _company_id;

    INSERT INTO public.branch (company_id, code, name, currency)
      VALUES (_company_id, 'HQ-' || substr(_company_id::text, 1, 4), 'Head Office',
              COALESCE(NULLIF(NEW.raw_user_meta_data->>'currency',''), 'KES'))
      RETURNING id INTO _branch_id;

    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin'::public.app_role)
      ON CONFLICT DO NOTHING;

    INSERT INTO public.staff (user_id, branch_id, full_name, role, email)
      VALUES (NEW.id, _branch_id, _full_name, 'admin'::public.staff_role, NEW.email);
  END IF;

  RETURN NEW;
END $$;

-- Ensure trigger exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 9. updated_at trigger on company
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS company_set_updated_at ON public.company;
CREATE TRIGGER company_set_updated_at
  BEFORE UPDATE ON public.company
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
