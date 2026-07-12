
CREATE POLICY "Staff can view loan documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'loan-documents' AND public.is_staff());
CREATE POLICY "Staff can upload loan documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'loan-documents' AND public.is_staff());
CREATE POLICY "Staff can update loan documents" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'loan-documents' AND public.is_staff());
CREATE POLICY "Staff can delete loan documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'loan-documents' AND public.is_staff());
