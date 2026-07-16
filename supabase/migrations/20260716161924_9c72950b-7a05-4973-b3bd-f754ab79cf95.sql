CREATE OR REPLACE FUNCTION public.is_company_admin(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    JOIN public.branch b ON b.id = s.branch_id
    WHERE s.user_id = auth.uid()
      AND b.company_id = _company_id
      AND (
        s.role = 'admin'::public.staff_role
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
  );
$$;