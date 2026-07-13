
CREATE POLICY "authenticated can read client-documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'client-documents');

CREATE POLICY "authenticated can upload client-documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'client-documents');

CREATE POLICY "authenticated can update client-documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'client-documents');

CREATE POLICY "authenticated can delete client-documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'client-documents');
