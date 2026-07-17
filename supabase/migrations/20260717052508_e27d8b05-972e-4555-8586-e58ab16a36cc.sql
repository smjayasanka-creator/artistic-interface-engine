
ALTER TABLE public.loan_security
  ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Storage policies: path is `${loan_id_or_new}/${security_key}/filename`
-- For new applications the loan doesn't exist yet, so we allow any authenticated
-- upload to a folder prefixed with the caller's user id.
CREATE POLICY "Auth users can read own security docs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'security-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.loan l
        JOIN public.branch b ON b.id = l.branch_id
        WHERE l.id::text = (storage.foldername(name))[1]
          AND public.is_company_member(b.company_id)
      )
    )
  );

CREATE POLICY "Auth users can upload security docs"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'security-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.loan l
        JOIN public.branch b ON b.id = l.branch_id
        WHERE l.id::text = (storage.foldername(name))[1]
          AND public.is_company_member(b.company_id)
      )
    )
  );

CREATE POLICY "Auth users can update security docs"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'security-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.loan l
        JOIN public.branch b ON b.id = l.branch_id
        WHERE l.id::text = (storage.foldername(name))[1]
          AND public.is_company_member(b.company_id)
      )
    )
  );

CREATE POLICY "Auth users can delete security docs"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'security-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.loan l
        JOIN public.branch b ON b.id = l.branch_id
        WHERE l.id::text = (storage.foldername(name))[1]
          AND public.is_company_member(b.company_id)
      )
    )
  );
