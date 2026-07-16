
ALTER TABLE public.workflow_step
  ADD COLUMN IF NOT EXISTS custom_role_id uuid REFERENCES public.custom_role(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalation_custom_role_id uuid REFERENCES public.custom_role(id) ON DELETE SET NULL,
  ALTER COLUMN role DROP NOT NULL;

CREATE INDEX IF NOT EXISTS workflow_step_custom_role_idx ON public.workflow_step(custom_role_id);
