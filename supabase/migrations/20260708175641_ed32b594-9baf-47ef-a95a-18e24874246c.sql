
-- ============================================================
-- 1. Switch has_role to SECURITY INVOKER (relies on user_roles self-read policy)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

-- ============================================================
-- 2. Helper functions (SECURITY INVOKER — rely on staff self-read policy below)
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_staff_branch()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT branch_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.current_staff_branch() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.current_staff_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- ============================================================
-- 3. STAFF: replace broad read
-- ============================================================
DROP POLICY IF EXISTS "authed read staff" ON public.staff;

CREATE POLICY "staff read own"
  ON public.staff FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admin read all staff"
  ON public.staff FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "branch_manager read staff in branch"
  ON public.staff FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'branch_manager'::app_role)
    AND branch_id = public.current_staff_branch()
  );

-- ============================================================
-- 4. BRANCH: scope to own branch + admin
-- ============================================================
DROP POLICY IF EXISTS "authed read branch" ON public.branch;

CREATE POLICY "staff read own branch"
  ON public.branch FOR SELECT TO authenticated
  USING (id = public.current_staff_branch());

CREATE POLICY "admin read all branches"
  ON public.branch FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 5. CLIENT: branch-scoped
-- ============================================================
DROP POLICY IF EXISTS "authed access client" ON public.client;

CREATE POLICY "staff select client in branch"
  ON public.client FOR SELECT TO authenticated
  USING (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff insert client in branch"
  ON public.client FOR INSERT TO authenticated
  WITH CHECK (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff update client in branch"
  ON public.client FOR UPDATE TO authenticated
  USING (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin delete client"
  ON public.client FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 6. LENDING_GROUP: branch-scoped
-- ============================================================
DROP POLICY IF EXISTS "authed access lending_group" ON public.lending_group;

CREATE POLICY "staff select group in branch"
  ON public.lending_group FOR SELECT TO authenticated
  USING (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff insert group in branch"
  ON public.lending_group FOR INSERT TO authenticated
  WITH CHECK (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff update group in branch"
  ON public.lending_group FOR UPDATE TO authenticated
  USING (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin delete group"
  ON public.lending_group FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 7. LOAN_PRODUCT: staff-only read (admin write kept)
-- ============================================================
DROP POLICY IF EXISTS "authed read loan_product" ON public.loan_product;

CREATE POLICY "staff read loan_product"
  ON public.loan_product FOR SELECT TO authenticated
  USING (public.is_staff());

-- ============================================================
-- 8. LOAN: branch-scoped
-- ============================================================
DROP POLICY IF EXISTS "authed access loan" ON public.loan;

CREATE POLICY "staff select loan in branch"
  ON public.loan FOR SELECT TO authenticated
  USING (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff insert loan in branch"
  ON public.loan FOR INSERT TO authenticated
  WITH CHECK (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff update loan in branch"
  ON public.loan FOR UPDATE TO authenticated
  USING (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin delete loan"
  ON public.loan FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 9. LOAN_INSTALLMENT: scoped via parent loan branch
-- ============================================================
DROP POLICY IF EXISTS "authed access loan_installment" ON public.loan_installment;

CREATE POLICY "staff select installment in branch"
  ON public.loan_installment FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loan l
    WHERE l.id = loan_installment.loan_id
      AND (l.branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "staff insert installment in branch"
  ON public.loan_installment FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loan l
    WHERE l.id = loan_installment.loan_id
      AND (l.branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "staff update installment in branch"
  ON public.loan_installment FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loan l
    WHERE l.id = loan_installment.loan_id
      AND (l.branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loan l
    WHERE l.id = loan_installment.loan_id
      AND (l.branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "admin delete installment"
  ON public.loan_installment FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 10. REPAYMENT: scoped via parent loan branch
-- ============================================================
DROP POLICY IF EXISTS "authed access repayment" ON public.repayment;
DROP POLICY IF EXISTS "authed insert repayment" ON public.repayment;

CREATE POLICY "staff select repayment in branch"
  ON public.repayment FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loan l
    WHERE l.id = repayment.loan_id
      AND (l.branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "staff insert repayment in branch"
  ON public.repayment FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loan l
    WHERE l.id = repayment.loan_id
      AND (l.branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

-- ============================================================
-- 11. GL_ACCOUNT: staff-only read (admin write kept)
-- ============================================================
DROP POLICY IF EXISTS "authed read gl_account" ON public.gl_account;

CREATE POLICY "staff read gl_account"
  ON public.gl_account FOR SELECT TO authenticated
  USING (public.is_staff());

-- ============================================================
-- 12. JOURNAL_ENTRY: branch-scoped staff
-- ============================================================
DROP POLICY IF EXISTS "authed access journal_entry" ON public.journal_entry;
DROP POLICY IF EXISTS "authed insert journal_entry" ON public.journal_entry;

CREATE POLICY "staff select journal_entry in branch"
  ON public.journal_entry FOR SELECT TO authenticated
  USING (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff insert journal_entry in branch"
  ON public.journal_entry FOR INSERT TO authenticated
  WITH CHECK (branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 13. POSTING: scoped via parent journal_entry branch
-- ============================================================
DROP POLICY IF EXISTS "authed access posting" ON public.posting;
DROP POLICY IF EXISTS "authed insert posting" ON public.posting;

CREATE POLICY "staff select posting in branch"
  ON public.posting FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.journal_entry je
    WHERE je.id = posting.entry_id
      AND (je.branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "staff insert posting in branch"
  ON public.posting FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.journal_entry je
    WHERE je.id = posting.entry_id
      AND (je.branch_id = public.current_staff_branch() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));
