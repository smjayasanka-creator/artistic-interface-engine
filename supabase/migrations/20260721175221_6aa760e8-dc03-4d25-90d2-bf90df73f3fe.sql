
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
    'workflow.' || COALESCE(NEW.decision, 'action'),
    'workflow_instance', NEW.instance_id,
    to_jsonb(NEW),
    jsonb_build_object('step_order', NEW.step_order)
  );
  RETURN NEW;
END $$;
