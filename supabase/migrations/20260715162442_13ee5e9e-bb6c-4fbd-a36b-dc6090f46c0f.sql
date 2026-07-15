
-- 1) Permission catalog (global)
CREATE TABLE public.permission (
  code text PRIMARY KEY,
  module text NOT NULL,
  label text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission TO authenticated;
GRANT ALL ON public.permission TO service_role;
ALTER TABLE public.permission ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permission readable by authenticated"
  ON public.permission FOR SELECT
  TO authenticated USING (true);

-- Seed common actions
INSERT INTO public.permission (code, module, label, description, sort_order) VALUES
  ('clients.view',        'Clients',      'View clients',           'See the client list and profile', 10),
  ('clients.create',      'Clients',      'Create client',          'Register new clients',            11),
  ('clients.edit',        'Clients',      'Edit client',            'Update client details',           12),
  ('clients.screen',      'Clients',      'Screen client',          'Run FIU/AML screening',           13),
  ('clients.approve',     'Clients',      'Approve screening',      'Approve screening results',       14),

  ('loans.view',          'Loans',        'View loans',             null, 20),
  ('loans.create',        'Loans',        'Create loan application',null, 21),
  ('loans.approve',       'Loans',        'Approve loan',           null, 22),
  ('loans.disburse',      'Loans',        'Disburse loan',          null, 23),
  ('loans.reschedule',    'Loans',        'Reschedule loan',        null, 24),
  ('loans.writeoff',      'Loans',        'Write off loan',         null, 25),
  ('loans.legal',         'Loans',        'Initiate legal action',  null, 26),

  ('collections.view',    'Collections',  'View collections',       null, 30),
  ('collections.post',    'Collections',  'Post repayment',         null, 31),

  ('savings.view',        'Savings',      'View savings accounts',  null, 40),
  ('savings.open',        'Savings',      'Open savings account',   null, 41),
  ('savings.deposit',     'Savings',      'Post deposit',           null, 42),
  ('savings.withdraw',    'Savings',      'Post withdrawal',        null, 43),
  ('savings.close',       'Savings',      'Close account',          null, 44),
  ('savings.passbook',    'Savings',      'Manage passbooks',       null, 45),

  ('fd.view',             'Fixed Deposits','View fixed deposits',   null, 50),
  ('fd.open',             'Fixed Deposits','Open FD',               null, 51),
  ('fd.mature',           'Fixed Deposits','Process maturity',      null, 52),
  ('fd.close',            'Fixed Deposits','Close FD',              null, 53),

  ('transactions.view',   'Transactions', 'View transactions',      null, 60),
  ('transactions.cash',   'Transactions', 'Cash operations',        null, 61),
  ('transactions.cheque', 'Transactions', 'Cheque operations',      null, 62),
  ('transactions.close_cashier','Transactions','Close cashier',     null, 63),

  ('accounts.view',       'Accounts',     'View ledger',            null, 70),
  ('accounts.journal',    'Accounts',     'Post journal entries',   null, 71),
  ('accounts.reconcile',  'Accounts',     'Bank reconciliation',    null, 72),

  ('approvals.view',      'Approvals',    'View approvals',         null, 80),
  ('approvals.act',       'Approvals',    'Approve / reject',       null, 81),

  ('reports.view',        'Reports',      'View reports',           null, 90),
  ('reports.export',      'Reports',      'Export reports',         null, 91),

  ('admin.settings',      'Administration','Manage company settings',null, 100),
  ('admin.branches',      'Administration','Manage branches',       null, 101),
  ('admin.staff',         'Administration','Manage staff',          null, 102),
  ('admin.products',      'Administration','Manage products',       null, 103),
  ('admin.accounts',      'Administration','Manage chart of accounts',null, 104),
  ('admin.roles',         'Administration','Manage user roles',     'Create custom roles and assign permissions', 105),
  ('admin.alco',          'Administration','Manage ALCO rates',     null, 106),
  ('admin.risk',          'Administration','Manage risk profiling', null, 107),
  ('admin.screening',     'Administration','Manage screening config',null, 108);

-- 2) Custom role (per company)
CREATE TABLE public.custom_role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_role TO authenticated;
GRANT ALL ON public.custom_role TO service_role;
ALTER TABLE public.custom_role ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_role member read"
  ON public.custom_role FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "custom_role admin write"
  ON public.custom_role FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin(company_id));
CREATE POLICY "custom_role admin update"
  ON public.custom_role FOR UPDATE TO authenticated
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));
CREATE POLICY "custom_role admin delete"
  ON public.custom_role FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));

CREATE TRIGGER trg_custom_role_updated
  BEFORE UPDATE ON public.custom_role
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Role -> Permission
CREATE TABLE public.custom_role_permission (
  role_id uuid NOT NULL REFERENCES public.custom_role(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.permission(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_role_permission TO authenticated;
GRANT ALL ON public.custom_role_permission TO service_role;
ALTER TABLE public.custom_role_permission ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crp member read"
  ON public.custom_role_permission FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.custom_role r
                 WHERE r.id = role_id AND public.is_company_member(r.company_id)));
CREATE POLICY "crp admin write"
  ON public.custom_role_permission FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.custom_role r
                 WHERE r.id = role_id AND public.is_company_admin(r.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.custom_role r
                      WHERE r.id = role_id AND public.is_company_admin(r.company_id)));

-- 4) Staff -> Role
CREATE TABLE public.user_custom_role (
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  role_id  uuid NOT NULL REFERENCES public.custom_role(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  PRIMARY KEY (staff_id, role_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_custom_role TO authenticated;
GRANT ALL ON public.user_custom_role TO service_role;
ALTER TABLE public.user_custom_role ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ucr member read"
  ON public.user_custom_role FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.custom_role r
                 WHERE r.id = role_id AND public.is_company_member(r.company_id)));
CREATE POLICY "ucr admin write"
  ON public.user_custom_role FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.custom_role r
                 WHERE r.id = role_id AND public.is_company_admin(r.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.custom_role r
                      WHERE r.id = role_id AND public.is_company_admin(r.company_id)));

CREATE INDEX idx_ucr_staff ON public.user_custom_role(staff_id);
CREATE INDEX idx_crp_role  ON public.custom_role_permission(role_id);

-- 5) has_permission helper
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_custom_role ucr
    JOIN public.staff s          ON s.id = ucr.staff_id
    JOIN public.custom_role r    ON r.id = ucr.role_id AND r.active = true
    JOIN public.custom_role_permission crp ON crp.role_id = r.id
    WHERE s.user_id = _user_id
      AND crp.permission_code = _permission
  );
$$;
