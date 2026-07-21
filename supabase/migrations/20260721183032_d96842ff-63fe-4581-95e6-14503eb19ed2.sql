CREATE OR REPLACE FUNCTION public.eod_precheck(_branch_id uuid, _business_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  _company_id uuid;
  _blockers jsonb := '[]'::jsonb;
  _warnings jsonb := '[]'::jsonb;
  _n int;
  _prev_lock date;
  _tz text;
  _local_date date;
  _is_service boolean := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  SELECT company_id, eod_locked_through
    INTO _company_id, _prev_lock
    FROM public.branch WHERE id=_branch_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF NOT _is_service
     AND NOT (public.is_company_member(_company_id) OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT timezone INTO _tz FROM public.company WHERE id=_company_id;
  _local_date := (now() AT TIME ZONE COALESCE(_tz,'UTC'))::date;

  IF _business_date >= _local_date THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','future_date','label','Business date must be before local today',
      'business_date',_business_date,'local_today',_local_date));
  END IF;

  IF _prev_lock IS NOT NULL AND _business_date <> _prev_lock + 1 THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','non_sequential_date','label','Business date must be the day after last lock',
      'previous_lock',_prev_lock,'business_date',_business_date));
  END IF;

  SELECT count(*) INTO _n FROM public.teller_close tc
    WHERE tc.branch_id=_branch_id AND tc.business_date=_business_date
      AND tc.status <> 'approved';
  IF _n > 0 THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','open_teller_tills','count',_n,'label','Teller close(s) pending approval'));
  END IF;

  SELECT count(*) INTO _n FROM public.teller_close tc
    WHERE tc.branch_id=_branch_id AND tc.business_date=_business_date
      AND tc.status='rejected';
  IF _n > 0 THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','teller_variance_rejected','count',_n,'label','Rejected teller close(s) — resolve variance'));
  END IF;

  SELECT count(*) INTO _n FROM public.workflow_instance wi
    WHERE wi.company_id = _company_id
      AND wi.status = 'pending'
      AND (
        (
          (wi.transaction_type ILIKE 'savings%' OR wi.transaction_type ILIKE '%_savings%')
          AND wi.transaction_type NOT ILIKE '%hold%'
          AND EXISTS (SELECT 1 FROM public.savings_account sa
                       WHERE sa.id = wi.reference_id AND sa.branch_id = _branch_id)
        )
        OR (
          wi.transaction_type ILIKE '%hold%'
          AND EXISTS (SELECT 1 FROM public.savings_hold sh
                       JOIN public.savings_account sa ON sa.id = sh.account_id
                       WHERE sh.id = wi.reference_id AND sa.branch_id = _branch_id)
        )
        OR (
          (wi.transaction_type ILIKE 'fd%'
           OR wi.transaction_type ILIKE 'fixed_deposit%'
           OR wi.transaction_type ILIKE '%_fd%')
          AND EXISTS (SELECT 1 FROM public.fixed_deposit fd
                       WHERE fd.id = wi.reference_id AND fd.branch_id = _branch_id)
        )
      );
  IF _n > 0 THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','pending_workflows','count',_n,
      'label','Pending savings/FD workflow instances for this branch'));
  END IF;

  SELECT count(*) INTO _n FROM public.workflow_instance wi
    WHERE wi.company_id = _company_id
      AND wi.status = 'pending'
      AND NOT (
        wi.transaction_type ILIKE 'savings%'
        OR wi.transaction_type ILIKE 'fd%'
        OR wi.transaction_type ILIKE 'fixed_deposit%'
        OR wi.transaction_type ILIKE '%_savings%'
        OR wi.transaction_type ILIKE '%_fd%'
      )
      AND (
        EXISTS (SELECT 1 FROM public.loan l WHERE l.id = wi.reference_id AND l.branch_id = _branch_id)
        OR EXISTS (SELECT 1 FROM public.loan_application la WHERE la.id = wi.reference_id AND la.branch_id = _branch_id)
      );
  IF _n > 0 THEN
    _warnings := _warnings || jsonb_build_array(jsonb_build_object(
      'code','pending_workflows_other','count',_n,
      'label','Pending non-savings/FD workflow instances for this branch (informational)'));
  END IF;

  SELECT count(*) INTO _n FROM public.journal_entry je
    WHERE je.branch_id=_branch_id AND je.entry_date=_business_date
      AND NOT EXISTS (SELECT 1 FROM public.posting p WHERE p.entry_id=je.id);
  IF _n > 0 THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','unposted_journals','count',_n,'label','Journal entries without postings'));
  END IF;

  SELECT count(*) INTO _n FROM public.loan l
    WHERE l.branch_id=_branch_id AND l.status='approved';
  IF _n > 0 THEN
    _blockers := _blockers || jsonb_build_array(jsonb_build_object(
      'code','inflight_disbursements','count',_n,'label','Approved loans awaiting disbursement'));
  END IF;

  SELECT count(*) INTO _n FROM public.fixed_deposit fd
    WHERE fd.branch_id=_branch_id AND fd.status='pending';
  IF _n > 0 THEN
    _warnings := _warnings || jsonb_build_array(jsonb_build_object(
      'code','pending_fd','count',_n,'label','Pending FD activations'));
  END IF;

  RETURN jsonb_build_object(
    'business_date',_business_date,
    'blockers',_blockers,
    'warnings',_warnings,
    'blocking', jsonb_array_length(_blockers) > 0,
    'checked_at', now()
  );
END $$;