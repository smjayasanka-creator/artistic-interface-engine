
DROP POLICY IF EXISTS audit_log_read_company_members ON public.audit_log;
CREATE POLICY audit_log_read_company_members ON public.audit_log
FOR SELECT
USING (
  (company_id IS NOT NULL AND is_company_member(company_id))
  OR has_role(auth.uid(), 'platform_admin'::app_role)
);

DROP POLICY IF EXISTS "Company members can read events" ON public.domain_event;
CREATE POLICY "Company members can read events" ON public.domain_event
FOR SELECT
USING (
  (company_id IS NOT NULL AND is_company_member(company_id))
  OR has_role(auth.uid(), 'platform_admin'::app_role)
);

DROP POLICY IF EXISTS "Company members can emit events" ON public.domain_event;
CREATE POLICY "Company members can emit events" ON public.domain_event
FOR INSERT
WITH CHECK (
  (company_id IS NOT NULL AND is_company_member(company_id))
  OR has_role(auth.uid(), 'platform_admin'::app_role)
);
