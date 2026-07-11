
CREATE OR REPLACE FUNCTION public.next_fd_certificate_no(_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE _period text; _next int;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  _period := to_char(now(), 'YYYYMM');
  INSERT INTO public.fd_number_seq (company_id, period, last_no)
    VALUES (_company_id, _period, 1)
    ON CONFLICT (company_id, period)
    DO UPDATE SET last_no = public.fd_number_seq.last_no + 1
  RETURNING last_no INTO _next;
  RETURN 'FD-' || _period || '-' || lpad(_next::text, 5, '0');
END $$;
