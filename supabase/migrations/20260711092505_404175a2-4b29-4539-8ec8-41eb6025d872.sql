
ALTER TABLE public.client
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone_country_code text,
  ADD COLUMN IF NOT EXISTS gn_division text,
  ADD COLUMN IF NOT EXISTS divisional_secretariat text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS geo_lat numeric(9,6),
  ADD COLUMN IF NOT EXISTS geo_lng numeric(9,6);

CREATE POLICY "Authenticated can view client photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'client-photos');

CREATE POLICY "Authenticated can upload client photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-photos');

CREATE POLICY "Authenticated can update client photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'client-photos');

CREATE POLICY "Authenticated can delete client photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'client-photos');
