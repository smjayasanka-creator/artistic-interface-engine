
CREATE OR REPLACE FUNCTION public.list_cron_jobs()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  schedule text,
  command text,
  active boolean,
  last_start timestamptz,
  last_end timestamptz,
  last_status text,
  last_return_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RAISE EXCEPTION 'Forbidden: platform admin only';
  END IF;

  RETURN QUERY
  SELECT
    j.jobid,
    j.jobname::text,
    j.schedule::text,
    j.command::text,
    j.active,
    r.start_time,
    r.end_time,
    r.status::text,
    r.return_message::text
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT start_time, end_time, status, return_message
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
    ORDER BY d.start_time DESC
    LIMIT 1
  ) r ON TRUE
  ORDER BY j.jobname;
END;
$$;

REVOKE ALL ON FUNCTION public.list_cron_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_cron_jobs() TO authenticated;
