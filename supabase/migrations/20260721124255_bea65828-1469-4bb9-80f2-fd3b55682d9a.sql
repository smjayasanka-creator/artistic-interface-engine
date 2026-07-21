CREATE OR REPLACE FUNCTION public.eod_precheck_system_diagnostic(_branch_id uuid, _business_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public'
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'eod_precheck_system_diagnostic is service-role only';
  END IF;

  RETURN public.eod_precheck(_branch_id, _business_date);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.eod_precheck_system_diagnostic(uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eod_precheck_system_diagnostic(uuid,date) TO service_role;