
-- 1. Remove cross-tenant "staff read" policies on loan_product and gl_account
DROP POLICY IF EXISTS "staff read loan_product" ON public.loan_product;
DROP POLICY IF EXISTS "staff read gl_account" ON public.gl_account;

-- 2. Storage: tenant-scoped policies for client-photos, client-documents, loan-documents
-- Drop old permissive policies
DROP POLICY IF EXISTS "Authenticated can view client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload client photos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can read client-documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can upload client-documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can update client-documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can delete client-documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view loan documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update loan documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete loan documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload loan documents" ON storage.objects;

-- Helper: check that first path segment is a client_id belonging to caller's company
-- We use inline EXISTS on client -> branch join.

-- client-photos: path = <client_id>/<file>
CREATE POLICY "client-photos tenant read" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'client-photos'
  AND EXISTS (
    SELECT 1 FROM public.client c
    JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.is_company_member(b.company_id)
  )
);
CREATE POLICY "client-photos tenant insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'client-photos'
  AND EXISTS (
    SELECT 1 FROM public.client c
    JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.is_company_member(b.company_id)
  )
);
CREATE POLICY "client-photos tenant update" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'client-photos'
  AND EXISTS (
    SELECT 1 FROM public.client c
    JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.is_company_member(b.company_id)
  )
);
CREATE POLICY "client-photos tenant delete" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'client-photos'
  AND EXISTS (
    SELECT 1 FROM public.client c
    JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.is_company_member(b.company_id)
  )
);

-- client-documents: path = <client_id>/<file>
CREATE POLICY "client-documents tenant read" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'client-documents'
  AND EXISTS (
    SELECT 1 FROM public.client c
    JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.is_company_member(b.company_id)
  )
);
CREATE POLICY "client-documents tenant insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'client-documents'
  AND EXISTS (
    SELECT 1 FROM public.client c
    JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.is_company_member(b.company_id)
  )
);
CREATE POLICY "client-documents tenant update" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'client-documents'
  AND EXISTS (
    SELECT 1 FROM public.client c
    JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.is_company_member(b.company_id)
  )
);
CREATE POLICY "client-documents tenant delete" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'client-documents'
  AND EXISTS (
    SELECT 1 FROM public.client c
    JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.is_company_member(b.company_id)
  )
);

-- loan-documents: path = <client_id>/<product_id>/<file>
CREATE POLICY "loan-documents tenant read" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'loan-documents'
  AND EXISTS (
    SELECT 1 FROM public.client c
    JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.is_company_member(b.company_id)
  )
);
CREATE POLICY "loan-documents tenant insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'loan-documents'
  AND EXISTS (
    SELECT 1 FROM public.client c
    JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.is_company_member(b.company_id)
  )
);
CREATE POLICY "loan-documents tenant update" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'loan-documents'
  AND EXISTS (
    SELECT 1 FROM public.client c
    JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.is_company_member(b.company_id)
  )
);
CREATE POLICY "loan-documents tenant delete" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'loan-documents'
  AND EXISTS (
    SELECT 1 FROM public.client c
    JOIN public.branch b ON b.id = c.branch_id
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.is_company_member(b.company_id)
  )
);

-- 3. Revoke EXECUTE from anon on all SECURITY DEFINER functions in public
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_staff_id() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_staff_branch() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_company_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_pending_domain_events(integer) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_domain_event_dispatched(uuid) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_domain_event_failed(uuid, text) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.emit_domain_event(uuid, text, text, text, uuid, jsonb, jsonb, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hardening_autocheck() FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_fd_certificate_no(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_savings_account_no(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_entry_system(uuid, date, text, text, jsonb, uuid, text, uuid, text, uuid) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_entry(date, text, text, jsonb, uuid, text, uuid, text, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_cron_jobs() FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_cron_job_active(bigint, boolean) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.emit_audit(uuid, text, text, uuid, jsonb, jsonb, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_audit_log(uuid, integer, integer, text, text) FROM anon, PUBLIC;

-- Re-grant EXECUTE to service_role (which admin functions use via context) and to authenticated where needed
GRANT EXECUTE ON FUNCTION public.list_cron_jobs() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_cron_job_active(bigint, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.hardening_autocheck() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_pending_domain_events(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_domain_event_dispatched(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_domain_event_failed(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_entry_system(uuid, date, text, text, jsonb, uuid, text, uuid, text, uuid) TO service_role;

-- Platform admins call these via context.supabase (authenticated JWT). Grant back the ones invoked by signed-in admins:
GRANT EXECUTE ON FUNCTION public.list_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_cron_job_active(bigint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hardening_autocheck() TO authenticated;
