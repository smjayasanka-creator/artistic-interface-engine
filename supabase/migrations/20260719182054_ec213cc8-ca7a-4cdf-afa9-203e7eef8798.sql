
CREATE OR REPLACE FUNCTION public.resolve_loan_approval_chain_raw(
  _client_id uuid,
  _product_id uuid,
  _principal numeric,
  _annual_rate_pct numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _branch_id uuid;
  _region text;
  _risk text;
  _officer uuid;
  _rule record;
  _chain jsonb;
BEGIN
  _officer := auth.uid();

  SELECT c.branch_id, c.risk_grade, b.company_id, b.region
    INTO _branch_id, _risk, _company_id, _region
    FROM public.client c
    LEFT JOIN public.branch b ON b.id = c.branch_id
   WHERE c.id = _client_id;

  IF _company_id IS NULL THEN
    -- fall back to officer's staff branch
    SELECT s.branch_id, b.company_id, b.region
      INTO _branch_id, _company_id, _region
      FROM public.staff s
      LEFT JOIN public.branch b ON b.id = s.branch_id
     WHERE s.user_id = _officer
     LIMIT 1;
  END IF;

  IF _company_id IS NULL THEN
    RETURN jsonb_build_object('rule_id', NULL, 'rule_name', NULL, 'steps', '[]'::jsonb);
  END IF;

  SELECT r.*
    INTO _rule
    FROM public.delegation_rule r
   WHERE r.company_id = _company_id
     AND r.active = true
     AND r.effective_from <= CURRENT_DATE
     AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
     AND (r.user_id IS NULL OR r.user_id = _officer)
     AND (r.branch_id IS NULL OR r.branch_id = _branch_id)
     AND (r.region IS NULL OR r.region = _region)
     AND (r.product_id IS NULL OR r.product_id = _product_id)
     AND (r.amount_min IS NULL OR _principal >= r.amount_min)
     AND (r.amount_max IS NULL OR _principal <= r.amount_max)
     AND (r.rate_min IS NULL OR _annual_rate_pct >= r.rate_min)
     AND (r.rate_max IS NULL OR _annual_rate_pct <= r.rate_max)
     AND (r.risk_grade IS NULL OR r.risk_grade = _risk)
   ORDER BY
     CASE r.rule_scope WHEN 'user' THEN 1 WHEN 'branch' THEN 2 WHEN 'region' THEN 3 WHEN 'product' THEN 4 ELSE 5 END,
     r.priority ASC,
     ((r.user_id IS NOT NULL)::int + (r.branch_id IS NOT NULL)::int + (r.region IS NOT NULL)::int +
      (r.product_id IS NOT NULL)::int + (r.amount_min IS NOT NULL)::int + (r.amount_max IS NOT NULL)::int +
      (r.rate_min IS NOT NULL)::int + (r.rate_max IS NOT NULL)::int + (r.risk_grade IS NOT NULL)::int) DESC,
     r.created_at ASC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('rule_id', NULL, 'rule_name', NULL, 'steps', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'seq', s.seq,
    'authority_id', s.authority_id,
    'authority_code', a.code,
    'authority_name', a.name,
    'authority_level', a.level,
    'required_approvals', s.required_approvals,
    'sla_hours', s.sla_hours,
    'escalate_to_authority_id', s.escalate_to_authority_id
  ) ORDER BY s.seq), '[]'::jsonb)
  INTO _chain
  FROM public.delegation_rule_step s
  JOIN public.delegation_authority_master a ON a.id = s.authority_id
  WHERE s.rule_id = _rule.id;

  RETURN jsonb_build_object('rule_id', _rule.id, 'rule_name', _rule.name, 'steps', _chain);
END $$;

GRANT EXECUTE ON FUNCTION public.resolve_loan_approval_chain_raw(uuid, uuid, numeric, numeric) TO authenticated;
