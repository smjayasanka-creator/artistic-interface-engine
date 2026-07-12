
CREATE TABLE public.hardening_checklist_item (
  item_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'missing' CHECK (status IN ('done','partial','missing')),
  owner text,
  note text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hardening_checklist_item TO authenticated;
GRANT ALL ON public.hardening_checklist_item TO service_role;

ALTER TABLE public.hardening_checklist_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view hardening items"
  ON public.hardening_checklist_item FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role));

CREATE POLICY "Platform admins can insert hardening items"
  ON public.hardening_checklist_item FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::public.app_role));

CREATE POLICY "Platform admins can update hardening items"
  ON public.hardening_checklist_item FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::public.app_role));

CREATE POLICY "Platform admins can delete hardening items"
  ON public.hardening_checklist_item FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role));

CREATE TRIGGER trg_hardening_checklist_item_updated
  BEFORE UPDATE ON public.hardening_checklist_item
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
