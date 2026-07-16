
-- journal_entry: scope admin bypass to same company via branch.company_id
DROP POLICY IF EXISTS "staff select journal_entry in branch" ON public.journal_entry;
DROP POLICY IF EXISTS "staff insert journal_entry in branch" ON public.journal_entry;

CREATE POLICY "staff select journal_entry in branch" ON public.journal_entry
FOR SELECT USING (
  branch_id = current_staff_branch()
  OR EXISTS (
    SELECT 1 FROM public.branch b
    WHERE b.id = journal_entry.branch_id
      AND public.is_company_admin(b.company_id)
  )
);

CREATE POLICY "staff insert journal_entry in branch" ON public.journal_entry
FOR INSERT WITH CHECK (
  branch_id = current_staff_branch()
  OR EXISTS (
    SELECT 1 FROM public.branch b
    WHERE b.id = journal_entry.branch_id
      AND public.is_company_admin(b.company_id)
  )
);

-- posting: same treatment via related journal_entry -> branch
DROP POLICY IF EXISTS "staff select posting in branch" ON public.posting;
DROP POLICY IF EXISTS "staff insert posting in branch" ON public.posting;

CREATE POLICY "staff select posting in branch" ON public.posting
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.journal_entry je
    LEFT JOIN public.branch b ON b.id = je.branch_id
    WHERE je.id = posting.entry_id
      AND (
        je.branch_id = current_staff_branch()
        OR public.is_company_admin(b.company_id)
      )
  )
);

CREATE POLICY "staff insert posting in branch" ON public.posting
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.journal_entry je
    LEFT JOIN public.branch b ON b.id = je.branch_id
    WHERE je.id = posting.entry_id
      AND (
        je.branch_id = current_staff_branch()
        OR public.is_company_admin(b.company_id)
      )
  )
);

-- repayment: same treatment via related loan -> branch
DROP POLICY IF EXISTS "staff select repayment in branch" ON public.repayment;
DROP POLICY IF EXISTS "staff insert repayment in branch" ON public.repayment;

CREATE POLICY "staff select repayment in branch" ON public.repayment
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.loan l
    LEFT JOIN public.branch b ON b.id = l.branch_id
    WHERE l.id = repayment.loan_id
      AND (
        l.branch_id = current_staff_branch()
        OR public.is_company_admin(b.company_id)
      )
  )
);

CREATE POLICY "staff insert repayment in branch" ON public.repayment
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.loan l
    LEFT JOIN public.branch b ON b.id = l.branch_id
    WHERE l.id = repayment.loan_id
      AND (
        l.branch_id = current_staff_branch()
        OR public.is_company_admin(b.company_id)
      )
  )
);
