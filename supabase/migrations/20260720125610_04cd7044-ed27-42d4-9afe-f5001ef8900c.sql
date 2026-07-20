INSERT INTO public.permission (code, module, label, description)
VALUES ('savings.automation.configure', 'savings', 'Configure auto-collection windows',
        'Configure savings auto-collection windows and schedules')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.savings_auto_collection_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.company(id) ON DELETE CASCADE,
  morning_enabled boolean NOT NULL DEFAULT true,
  morning_time time NOT NULL DEFAULT '10:00',
  afternoon_enabled boolean NOT NULL DEFAULT true,
  afternoon_time time NOT NULL DEFAULT '15:00',
  timezone_override text,
  max_retries integer NOT NULL DEFAULT 0 CHECK (max_retries >= 0 AND max_retries <= 5),
  updated_by uuid REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_auto_collection_config TO authenticated;
GRANT ALL ON public.savings_auto_collection_config TO service_role;

ALTER TABLE public.savings_auto_collection_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auto_coll_config_view" ON public.savings_auto_collection_config;
CREATE POLICY "auto_coll_config_view"
  ON public.savings_auto_collection_config FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'savings.automation.configure', company_id)
      OR public.has_permission(auth.uid(), 'savings.admin', company_id));

DROP POLICY IF EXISTS "auto_coll_config_manage" ON public.savings_auto_collection_config;
CREATE POLICY "auto_coll_config_manage"
  ON public.savings_auto_collection_config FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'savings.automation.configure', company_id))
  WITH CHECK (public.has_permission(auth.uid(), 'savings.automation.configure', company_id));

CREATE OR REPLACE FUNCTION public.tg_savings_auto_collection_config_updated()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_savings_auto_collection_config_updated ON public.savings_auto_collection_config;
CREATE TRIGGER trg_savings_auto_collection_config_updated
  BEFORE UPDATE ON public.savings_auto_collection_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_savings_auto_collection_config_updated();

INSERT INTO public.savings_auto_collection_config (company_id)
SELECT c.id FROM public.company c
WHERE NOT EXISTS (
  SELECT 1 FROM public.savings_auto_collection_config x WHERE x.company_id = c.id
);