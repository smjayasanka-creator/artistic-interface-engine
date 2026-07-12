-- Enums
CREATE TYPE public.workflow_approver_kind AS ENUM ('role','branch_role','user');
CREATE TYPE public.workflow_instance_status AS ENUM ('pending','approved','declined','cancelled');
CREATE TYPE public.workflow_action_decision AS ENUM ('approve','decline');
CREATE TYPE public.workflow_sla_action AS ENUM ('flag','escalate');

-- 1. workflow_definition
CREATE TABLE public.workflow_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  name text NOT NULL,
  transaction_type text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, transaction_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_definition TO authenticated;
GRANT ALL ON public.workflow_definition TO service_role;
ALTER TABLE public.workflow_definition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wfdef read by members" ON public.workflow_definition FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "wfdef write by admins" ON public.workflow_definition FOR ALL TO authenticated
  USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));
CREATE TRIGGER trg_wfdef_updated BEFORE UPDATE ON public.workflow_definition
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. workflow_step
CREATE TABLE public.workflow_step (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflow_definition(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  name text NOT NULL,
  approver_kind public.workflow_approver_kind NOT NULL,
  role public.staff_role,
  branch_id uuid REFERENCES public.branch(id) ON DELETE SET NULL,
  user_id uuid,
  required_approvals int NOT NULL DEFAULT 1 CHECK (required_approvals >= 1),
  sla_hours int,
  sla_action public.workflow_sla_action NOT NULL DEFAULT 'flag',
  escalation_role public.staff_role,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_order)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step TO authenticated;
GRANT ALL ON public.workflow_step TO service_role;
ALTER TABLE public.workflow_step ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wfstep read by members" ON public.workflow_step FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workflow_definition d
                 WHERE d.id = workflow_id AND public.is_company_member(d.company_id)));
CREATE POLICY "wfstep write by admins" ON public.workflow_step FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workflow_definition d
                 WHERE d.id = workflow_id AND public.is_company_admin(d.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workflow_definition d
                 WHERE d.id = workflow_id AND public.is_company_admin(d.company_id)));
CREATE TRIGGER trg_wfstep_updated BEFORE UPDATE ON public.workflow_step
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. workflow_instance
CREATE TABLE public.workflow_instance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflow_definition(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  transaction_type text NOT NULL,
  reference_id uuid,
  reference_label text NOT NULL,
  amount numeric(18,2),
  status public.workflow_instance_status NOT NULL DEFAULT 'pending',
  current_step int NOT NULL DEFAULT 1,
  initiated_by uuid NOT NULL,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_instance TO authenticated;
GRANT ALL ON public.workflow_instance TO service_role;
ALTER TABLE public.workflow_instance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wfinst read by members" ON public.workflow_instance FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "wfinst insert by members" ON public.workflow_instance FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id) AND initiated_by = auth.uid());
CREATE POLICY "wfinst update by members" ON public.workflow_instance FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "wfinst delete by admins" ON public.workflow_instance FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));
CREATE TRIGGER trg_wfinst_updated BEFORE UPDATE ON public.workflow_instance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_wfinst_pending ON public.workflow_instance (company_id, status, current_step);

-- 4. workflow_action
CREATE TABLE public.workflow_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.workflow_instance(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  actor_user_id uuid NOT NULL,
  decision public.workflow_action_decision NOT NULL,
  comment text,
  due_at timestamptz,
  escalated_at timestamptz,
  acted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, step_order, actor_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_action TO authenticated;
GRANT ALL ON public.workflow_action TO service_role;
ALTER TABLE public.workflow_action ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wfact read by members" ON public.workflow_action FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workflow_instance i
                 WHERE i.id = instance_id AND public.is_company_member(i.company_id)));
CREATE POLICY "wfact insert self" ON public.workflow_action FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid()
              AND EXISTS (SELECT 1 FROM public.workflow_instance i
                          WHERE i.id = instance_id AND public.is_company_member(i.company_id)));
