-- ============================================================
-- audit_log: append-only, per-company
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid REFERENCES public.company(id) ON DELETE SET NULL,
  actor_user_id uuid,
  actor_role    text,
  action        text NOT NULL,           -- e.g. 'ledger.entry_posted', 'loan.approved'
  entity_type   text NOT NULL,           -- e.g. 'journal_entry', 'loan'
  entity_id     uuid,
  before_data   jsonb,
  after_data    jsonb,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL   ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_read_company_members" ON public.audit_log;
CREATE POLICY "audit_log_read_company_members"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL
    OR public.is_company_member(company_id)
    OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
  );

-- Indexes
CREATE INDEX IF NOT EXISTS audit_log_company_created_idx
  ON public.audit_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON public.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx
  ON public.audit_log (actor_user_id, created_at DESC);

-- ============================================================
-- Append-only enforcement
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % not allowed', TG_OP;
END $$;

DROP TRIGGER IF EXISTS audit_log_no_update ON public.audit_log;
DROP TRIGGER IF EXISTS audit_log_no_delete ON public.audit_log;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_append_only();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_append_only();

-- ============================================================
-- Helper: emit an audit entry (SECURITY DEFINER, service_role only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.emit_audit(
  _company_id    uuid,
  _action        text,
  _entity_type   text,
  _entity_id     uuid,
  _before        jsonb DEFAULT NULL,
  _after         jsonb DEFAULT NULL,
  _metadata      jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.audit_log (
    company_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) VALUES (
    _company_id, auth.uid(), _action, _entity_type, _entity_id,
    _before, _after, COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.emit_audit(uuid, text, text, uuid, jsonb, jsonb, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_audit(uuid, text, text, uuid, jsonb, jsonb, jsonb)
  TO service_role;

-- ============================================================
-- Auto-mirror ledger writes into audit_log
-- ============================================================
CREATE OR REPLACE FUNCTION public.journal_entry_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _company_id uuid;
BEGIN
  SELECT b.company_id INTO _company_id
    FROM public.branch b
   WHERE b.id = NEW.branch_id;

  INSERT INTO public.audit_log (
    company_id, actor_user_id, action, entity_type, entity_id,
    after_data, metadata
  ) VALUES (
    _company_id, auth.uid(), 'ledger.entry_posted', 'journal_entry', NEW.id,
    to_jsonb(NEW),
    jsonb_build_object(
      'source_module', NEW.source_module,
      'source_ref',    NEW.source_ref,
      'reference',     NEW.reference
    )
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS journal_entry_audit ON public.journal_entry;
CREATE TRIGGER journal_entry_audit
  AFTER INSERT ON public.journal_entry
  FOR EACH ROW EXECUTE FUNCTION public.journal_entry_audit_trigger();

-- ============================================================
-- Auto-mirror workflow actions (maker-checker) into audit_log
-- ============================================================
CREATE OR REPLACE FUNCTION public.workflow_action_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _instance   public.workflow_instance%ROWTYPE;
BEGIN
  SELECT * INTO _instance FROM public.workflow_instance WHERE id = NEW.instance_id;
  IF _instance.id IS NOT NULL THEN
    _company_id := _instance.company_id;
  END IF;

  INSERT INTO public.audit_log (
    company_id, actor_user_id, action, entity_type, entity_id,
    after_data, metadata
  ) VALUES (
    _company_id, COALESCE(NEW.actor_user_id, auth.uid()),
    'workflow.' || COALESCE(NEW.action, 'action'),
    'workflow_instance', NEW.instance_id,
    to_jsonb(NEW),
    jsonb_build_object('step_id', NEW.step_id)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS workflow_action_audit ON public.workflow_action;
CREATE TRIGGER workflow_action_audit
  AFTER INSERT ON public.workflow_action
  FOR EACH ROW EXECUTE FUNCTION public.workflow_action_audit_trigger();