CREATE OR REPLACE FUNCTION public.company_id_of_branch(_branch_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.branch WHERE id = _branch_id;
$$;

DROP POLICY IF EXISTS "company admins manage staff" ON public.staff;
DROP POLICY IF EXISTS "company admins read staff" ON public.staff;

CREATE POLICY "company admins manage staff"
ON public.staff
FOR ALL
USING (
  public.is_company_admin(public.company_id_of_branch(branch_id))
  OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
)
WITH CHECK (
  public.is_company_admin(public.company_id_of_branch(branch_id))
  OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
);

CREATE POLICY "company admins read staff"
ON public.staff
FOR SELECT
USING (
  public.is_company_admin(public.company_id_of_branch(branch_id))
);