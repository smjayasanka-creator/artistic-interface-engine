
-- 1) Fix staff self-update to prevent role/branch escalation
DROP POLICY IF EXISTS "self update staff" ON public.staff;
CREATE POLICY "self update staff" ON public.staff
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND role = (SELECT s2.role FROM public.staff s2 WHERE s2.user_id = auth.uid() LIMIT 1)
    AND branch_id = (SELECT s2.branch_id FROM public.staff s2 WHERE s2.user_id = auth.uid() LIMIT 1)
  );

-- 2) Lock down SECURITY DEFINER functions: revoke from PUBLIC and anon.
--    Trigger-only functions: revoke from authenticated too.
REVOKE ALL ON FUNCTION public.assert_entry_balanced() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Helpers used inside RLS policies: keep EXECUTE for authenticated only.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.current_staff_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_staff_id() TO authenticated;

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

REVOKE ALL ON FUNCTION public.current_staff_branch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_staff_branch() TO authenticated;

REVOKE ALL ON FUNCTION public.is_company_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_company_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
