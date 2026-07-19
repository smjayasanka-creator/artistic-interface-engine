
-- ==========================================================================
-- Repayment date guard: validate received_at server-side and expose the
-- backdate-permission and business-date helpers the UI needs.
-- Forward-only. Does not change allocation or GL posting.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.can_backdate_repayment(_loan_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _company uuid;
BEGIN
  SELECT b.company_id
    INTO _company
    FROM public.loan l
    JOIN public.branch b ON b.id = l.branch_id
   WHERE l.id = _loan_id;
  IF _company IS NULL THEN RETURN false; END IF;
  RETURN public.is_company_admin(_company)
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'branch_manager')
      OR public.has_permission(auth.uid(), 'collections.backdate');
END $$;

REVOKE ALL ON FUNCTION public.can_backdate_repayment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_backdate_repayment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_business_date()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE 'UTC')::date;
$$;

REVOKE ALL ON FUNCTION public.current_business_date() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_business_date() TO authenticated;

-- Trigger enforcement so any writer (RPC, admin fix-up, future API) is bound
-- by the same rules the UI advertises.
CREATE OR REPLACE FUNCTION public.repayment_date_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _loan    public.loan%ROWTYPE;
  _today   date := (now() AT TIME ZONE 'UTC')::date;
  _rcvd    date;
  _can_bd  boolean;
BEGIN
  IF NEW.received_at IS NULL THEN
    RAISE EXCEPTION 'received_at is required';
  END IF;
  IF NEW.received_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'received_at cannot be in the future (got %)', NEW.received_at;
  END IF;

  SELECT * INTO _loan FROM public.loan WHERE id = NEW.loan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', NEW.loan_id;
  END IF;

  _rcvd := (NEW.received_at AT TIME ZONE 'UTC')::date;

  IF _loan.disbursed_at IS NOT NULL
     AND _rcvd < (_loan.disbursed_at AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION
      'received_at (%) cannot be before the loan disbursement date (%)',
      _rcvd, (_loan.disbursed_at AT TIME ZONE 'UTC')::date;
  END IF;

  IF _rcvd <> _today THEN
    _can_bd := public.can_backdate_repayment(NEW.loan_id);
    IF NOT _can_bd THEN
      RAISE EXCEPTION
        'Backdating not permitted for this user — use today''s business date (%)',
        _today;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_repayment_date_guard ON public.repayment;
CREATE TRIGGER trg_repayment_date_guard
  BEFORE INSERT ON public.repayment
  FOR EACH ROW EXECUTE FUNCTION public.repayment_date_guard();
