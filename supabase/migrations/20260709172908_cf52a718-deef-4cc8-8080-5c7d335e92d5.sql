REVOKE EXECUTE ON FUNCTION public.current_staff_branch() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_staff_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_staff_branch() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_staff_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;