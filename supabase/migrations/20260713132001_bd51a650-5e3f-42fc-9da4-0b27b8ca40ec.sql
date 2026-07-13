
CREATE OR REPLACE FUNCTION public.set_cron_job_active(_jobid bigint, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RAISE EXCEPTION 'Forbidden: platform admin only';
  END IF;
  PERFORM cron.alter_job(job_id := _jobid, active := _active);
END;
$$;

REVOKE ALL ON FUNCTION public.set_cron_job_active(bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_cron_job_active(bigint, boolean) TO authenticated;
