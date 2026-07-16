
-- BRANCH: drop legacy global-admin policies (v2 + members policies already exist)
DROP POLICY IF EXISTS "admin read all branches" ON public.branch;
DROP POLICY IF EXISTS "admin write branch" ON public.branch;

-- GL_ACCOUNT: drop legacy global-admin write (v2 exists)
DROP POLICY IF EXISTS "admin write gl_account" ON public.gl_account;

-- LOAN_PRODUCT: drop legacy global-admin write (v2 exists)
DROP POLICY IF EXISTS "admin write loan_product" ON public.loan_product;

-- CLIENT: replace has_role('admin') bypass with company-admin scoping
DROP POLICY IF EXISTS "admin delete client" ON public.client;
DROP POLICY IF EXISTS "staff insert client in branch" ON public.client;
DROP POLICY IF EXISTS "staff select client in branch" ON public.client;
DROP POLICY IF EXISTS "staff update client in branch" ON public.client;

CREATE POLICY "staff select client in branch" ON public.client FOR SELECT
  USING (
    branch_id = public.current_staff_branch()
    OR public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = client.branch_id))
  );
CREATE POLICY "staff insert client in branch" ON public.client FOR INSERT
  WITH CHECK (
    branch_id = public.current_staff_branch()
    OR public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = client.branch_id))
  );
CREATE POLICY "staff update client in branch" ON public.client FOR UPDATE
  USING (
    branch_id = public.current_staff_branch()
    OR public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = client.branch_id))
  )
  WITH CHECK (
    branch_id = public.current_staff_branch()
    OR public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = client.branch_id))
  );
CREATE POLICY "company admins delete client" ON public.client FOR DELETE
  USING (public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = client.branch_id)));

-- LOAN: same treatment
DROP POLICY IF EXISTS "admin delete loan" ON public.loan;
DROP POLICY IF EXISTS "staff insert loan in branch" ON public.loan;
DROP POLICY IF EXISTS "staff select loan in branch" ON public.loan;
DROP POLICY IF EXISTS "staff update loan in branch" ON public.loan;

CREATE POLICY "staff select loan in branch" ON public.loan FOR SELECT
  USING (
    branch_id = public.current_staff_branch()
    OR public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = loan.branch_id))
  );
CREATE POLICY "staff insert loan in branch" ON public.loan FOR INSERT
  WITH CHECK (
    branch_id = public.current_staff_branch()
    OR public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = loan.branch_id))
  );
CREATE POLICY "staff update loan in branch" ON public.loan FOR UPDATE
  USING (
    branch_id = public.current_staff_branch()
    OR public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = loan.branch_id))
  )
  WITH CHECK (
    branch_id = public.current_staff_branch()
    OR public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = loan.branch_id))
  );
CREATE POLICY "company admins delete loan" ON public.loan FOR DELETE
  USING (public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = loan.branch_id)));

-- LENDING_GROUP
DROP POLICY IF EXISTS "admin delete group" ON public.lending_group;
DROP POLICY IF EXISTS "staff insert group in branch" ON public.lending_group;
DROP POLICY IF EXISTS "staff select group in branch" ON public.lending_group;
DROP POLICY IF EXISTS "staff update group in branch" ON public.lending_group;

CREATE POLICY "staff select group in branch" ON public.lending_group FOR SELECT
  USING (
    branch_id = public.current_staff_branch()
    OR public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = lending_group.branch_id))
  );
CREATE POLICY "staff insert group in branch" ON public.lending_group FOR INSERT
  WITH CHECK (
    branch_id = public.current_staff_branch()
    OR public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = lending_group.branch_id))
  );
CREATE POLICY "staff update group in branch" ON public.lending_group FOR UPDATE
  USING (
    branch_id = public.current_staff_branch()
    OR public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = lending_group.branch_id))
  )
  WITH CHECK (
    branch_id = public.current_staff_branch()
    OR public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = lending_group.branch_id))
  );
CREATE POLICY "company admins delete group" ON public.lending_group FOR DELETE
  USING (public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = lending_group.branch_id)));

-- LOAN_INSTALLMENT (scoped via parent loan -> branch -> company)
DROP POLICY IF EXISTS "admin delete installment" ON public.loan_installment;
DROP POLICY IF EXISTS "staff insert installment in branch" ON public.loan_installment;
DROP POLICY IF EXISTS "staff select installment in branch" ON public.loan_installment;
DROP POLICY IF EXISTS "staff update installment in branch" ON public.loan_installment;

CREATE POLICY "staff select installment in branch" ON public.loan_installment FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.loan l JOIN public.branch b ON b.id = l.branch_id
    WHERE l.id = loan_installment.loan_id
      AND (l.branch_id = public.current_staff_branch() OR public.is_company_admin(b.company_id))
  ));
CREATE POLICY "staff insert installment in branch" ON public.loan_installment FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loan l JOIN public.branch b ON b.id = l.branch_id
    WHERE l.id = loan_installment.loan_id
      AND (l.branch_id = public.current_staff_branch() OR public.is_company_admin(b.company_id))
  ));
CREATE POLICY "staff update installment in branch" ON public.loan_installment FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.loan l JOIN public.branch b ON b.id = l.branch_id
    WHERE l.id = loan_installment.loan_id
      AND (l.branch_id = public.current_staff_branch() OR public.is_company_admin(b.company_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loan l JOIN public.branch b ON b.id = l.branch_id
    WHERE l.id = loan_installment.loan_id
      AND (l.branch_id = public.current_staff_branch() OR public.is_company_admin(b.company_id))
  ));
CREATE POLICY "company admins delete installment" ON public.loan_installment FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.loan l JOIN public.branch b ON b.id = l.branch_id
    WHERE l.id = loan_installment.loan_id AND public.is_company_admin(b.company_id)
  ));

-- STAFF: replace global-admin policies with company-admin scoping via branch
DROP POLICY IF EXISTS "admin manage staff" ON public.staff;
DROP POLICY IF EXISTS "admin read all staff" ON public.staff;

CREATE POLICY "company admins read staff" ON public.staff FOR SELECT
  USING (public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = staff.branch_id)));
CREATE POLICY "company admins manage staff" ON public.staff FOR ALL
  USING (public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = staff.branch_id)))
  WITH CHECK (public.is_company_admin((SELECT b.company_id FROM public.branch b WHERE b.id = staff.branch_id)));

-- ALCO_RATE_PROPOSAL: tighten write to company admins
DROP POLICY IF EXISTS "alco_rate_proposal write" ON public.alco_rate_proposal;
CREATE POLICY "alco_rate_proposal write" ON public.alco_rate_proposal FOR ALL
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

DROP POLICY IF EXISTS "alco_rate_proposal_item write" ON public.alco_rate_proposal_item;
CREATE POLICY "alco_rate_proposal_item write" ON public.alco_rate_proposal_item FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.alco_rate_proposal p
    WHERE p.id = alco_rate_proposal_item.proposal_id AND public.is_company_admin(p.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.alco_rate_proposal p
    WHERE p.id = alco_rate_proposal_item.proposal_id AND public.is_company_admin(p.company_id)
  ));
