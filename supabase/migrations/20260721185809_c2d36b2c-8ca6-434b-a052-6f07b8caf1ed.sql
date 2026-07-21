
-- 1. region table
CREATE TABLE IF NOT EXISTS public.region (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.region TO authenticated;
GRANT ALL ON public.region TO service_role;

ALTER TABLE public.region ENABLE ROW LEVEL SECURITY;

CREATE POLICY "region_select_same_company"
  ON public.region FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "region_admin_write_same_company"
  ON public.region FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.tg_region_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER region_touch_updated_at BEFORE UPDATE ON public.region
  FOR EACH ROW EXECUTE FUNCTION public.tg_region_touch_updated_at();

-- 2. add region_id to branch
ALTER TABLE public.branch
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.region(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS branch_region_id_idx ON public.branch(region_id);

-- 3. backfill: promote every distinct non-empty branch.region text into a region row and link
INSERT INTO public.region (company_id, code, name)
SELECT DISTINCT b.company_id,
       upper(regexp_replace(btrim(b.region), '[^A-Za-z0-9]+', '_', 'g')) AS code,
       btrim(b.region) AS name
  FROM public.branch b
 WHERE b.region IS NOT NULL AND btrim(b.region) <> ''
ON CONFLICT (company_id, code) DO NOTHING;

UPDATE public.branch b
   SET region_id = r.id
  FROM public.region r
 WHERE r.company_id = b.company_id
   AND lower(r.name) = lower(btrim(b.region))
   AND b.region IS NOT NULL
   AND b.region_id IS NULL;
