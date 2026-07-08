DROP POLICY IF EXISTS "self update staff" ON public.staff;

CREATE POLICY "self update staff"
ON public.staff
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND role = (SELECT role FROM public.staff WHERE id = staff.id)
  AND branch_id = (SELECT branch_id FROM public.staff WHERE id = staff.id)
);