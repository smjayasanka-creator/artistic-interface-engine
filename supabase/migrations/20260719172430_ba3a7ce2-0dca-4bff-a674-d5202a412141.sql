
CREATE TABLE public.delegation_authority_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  level int NOT NULL DEFAULT 1,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delegation_authority_master TO authenticated;
GRANT ALL ON public.delegation_authority_master TO service_role;
ALTER TABLE public.delegation_authority_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dam_read" ON public.delegation_authority_master FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "dam_write" ON public.delegation_authority_master FOR ALL TO authenticated USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));
CREATE TRIGGER dam_updated BEFORE UPDATE ON public.delegation_authority_master FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.delegation_authority_member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id uuid NOT NULL REFERENCES public.delegation_authority_master(id) ON DELETE CASCADE,
  member_type text NOT NULL CHECK (member_type IN ('user','custom_role','staff_role')),
  member_ref text NOT NULL,
  is_backup boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (authority_id, member_type, member_ref)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delegation_authority_member TO authenticated;
GRANT ALL ON public.delegation_authority_member TO service_role;
ALTER TABLE public.delegation_authority_member ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dam_mem_read" ON public.delegation_authority_member FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.delegation_authority_master a WHERE a.id = authority_id AND public.is_company_member(a.company_id)));
CREATE POLICY "dam_mem_write" ON public.delegation_authority_member FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.delegation_authority_master a WHERE a.id = authority_id AND public.is_company_admin(a.company_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.delegation_authority_master a WHERE a.id = authority_id AND public.is_company_admin(a.company_id)));

CREATE TABLE public.delegation_authority_delegate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id uuid NOT NULL REFERENCES public.delegation_authority_master(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_date <= to_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delegation_authority_delegate TO authenticated;
GRANT ALL ON public.delegation_authority_delegate TO service_role;
ALTER TABLE public.delegation_authority_delegate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dad_read" ON public.delegation_authority_delegate FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.delegation_authority_master a WHERE a.id = authority_id AND public.is_company_member(a.company_id)));
CREATE POLICY "dad_write" ON public.delegation_authority_delegate FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.delegation_authority_master a WHERE a.id = authority_id AND public.is_company_admin(a.company_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.delegation_authority_master a WHERE a.id = authority_id AND public.is_company_admin(a.company_id)));

CREATE TABLE public.delegation_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  rule_scope text NOT NULL CHECK (rule_scope IN ('user','branch','region','product','default')),
  user_id uuid,
  custom_role_id uuid REFERENCES public.custom_role(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branch(id) ON DELETE SET NULL,
  region text,
  product_id uuid REFERENCES public.loan_product(id) ON DELETE SET NULL,
  security_type_id uuid REFERENCES public.security_type(id) ON DELETE SET NULL,
  amount_min numeric(18,2),
  amount_max numeric(18,2),
  rate_min numeric(6,3),
  rate_max numeric(6,3),
  risk_grade text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delegation_rule TO authenticated;
GRANT ALL ON public.delegation_rule TO service_role;
ALTER TABLE public.delegation_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drule_read" ON public.delegation_rule FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "drule_write" ON public.delegation_rule FOR ALL TO authenticated USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));
CREATE TRIGGER drule_updated BEFORE UPDATE ON public.delegation_rule FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX drule_lookup ON public.delegation_rule(company_id, active, rule_scope, priority);

CREATE TABLE public.delegation_rule_step (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.delegation_rule(id) ON DELETE CASCADE,
  seq int NOT NULL,
  authority_id uuid NOT NULL REFERENCES public.delegation_authority_master(id) ON DELETE RESTRICT,
  mode text NOT NULL DEFAULT 'sequential' CHECK (mode IN ('sequential','parallel')),
  required_approvals int NOT NULL DEFAULT 1,
  sla_hours int,
  escalate_to_authority_id uuid REFERENCES public.delegation_authority_master(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, seq)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delegation_rule_step TO authenticated;
GRANT ALL ON public.delegation_rule_step TO service_role;
ALTER TABLE public.delegation_rule_step ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drs_read" ON public.delegation_rule_step FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.delegation_rule r WHERE r.id = rule_id AND public.is_company_member(r.company_id)));
CREATE POLICY "drs_write" ON public.delegation_rule_step FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.delegation_rule r WHERE r.id = rule_id AND public.is_company_admin(r.company_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.delegation_rule r WHERE r.id = rule_id AND public.is_company_admin(r.company_id)));

ALTER TABLE public.workflow_instance ADD COLUMN IF NOT EXISTS applied_rule_id uuid REFERENCES public.delegation_rule(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.resolve_loan_approval_chain(_loan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _loan record;
  _company_id uuid;
  _rule record;
  _chain jsonb;
BEGIN
  SELECT l.*, b.company_id AS c_id, b.region AS branch_region, c.risk_grade AS client_risk
    INTO _loan
    FROM public.loan l
    JOIN public.branch b ON b.id = l.branch_id
    LEFT JOIN public.client c ON c.id = l.client_id
   WHERE l.id = _loan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan % not found', _loan_id; END IF;
  _company_id := _loan.c_id;

  SELECT r.*
    INTO _rule
    FROM public.delegation_rule r
   WHERE r.company_id = _company_id
     AND r.active = true
     AND r.effective_from <= CURRENT_DATE
     AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
     AND (r.user_id IS NULL OR r.user_id = _loan.officer_id)
     AND (r.branch_id IS NULL OR r.branch_id = _loan.branch_id)
     AND (r.region IS NULL OR r.region = _loan.branch_region)
     AND (r.product_id IS NULL OR r.product_id = _loan.product_id)
     AND (r.amount_min IS NULL OR _loan.principal >= r.amount_min)
     AND (r.amount_max IS NULL OR _loan.principal <= r.amount_max)
     AND (r.rate_min IS NULL OR _loan.annual_rate_pct >= r.rate_min)
     AND (r.rate_max IS NULL OR _loan.annual_rate_pct <= r.rate_max)
     AND (r.risk_grade IS NULL OR r.risk_grade = _loan.client_risk)
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

GRANT EXECUTE ON FUNCTION public.resolve_loan_approval_chain(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_authority(_user_id uuid, _authority_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.delegation_authority_member m
    WHERE m.authority_id = _authority_id
      AND (
        (m.member_type = 'user' AND m.member_ref = _user_id::text) OR
        (m.member_type = 'custom_role' AND EXISTS (
          SELECT 1 FROM public.user_custom_role ucr
          JOIN public.staff s ON s.id = ucr.staff_id
          WHERE s.user_id = _user_id AND ucr.role_id::text = m.member_ref
        )) OR
        (m.member_type = 'staff_role' AND EXISTS (
          SELECT 1 FROM public.staff s WHERE s.user_id = _user_id AND s.role::text = m.member_ref
        ))
      )
  ) OR EXISTS (
    SELECT 1 FROM public.delegation_authority_delegate d
    WHERE d.authority_id = _authority_id
      AND d.to_user_id = _user_id
      AND CURRENT_DATE BETWEEN d.from_date AND d.to_date
  );
$$;
GRANT EXECUTE ON FUNCTION public.has_authority(uuid, uuid) TO authenticated;
