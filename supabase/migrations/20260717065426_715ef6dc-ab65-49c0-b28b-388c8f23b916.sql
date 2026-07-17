-- Helper: get current user's staff role without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS public.staff_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Replace recursive self-update policy
DROP POLICY IF EXISTS "self update staff" ON public.staff;

CREATE POLICY "self update staff"
ON public.staff
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND role = public.current_staff_role()
  AND branch_id = public.current_staff_branch()
);