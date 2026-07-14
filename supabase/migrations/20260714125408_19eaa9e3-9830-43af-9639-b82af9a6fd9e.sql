ALTER TABLE public.client
  ADD COLUMN IF NOT EXISTS external_person_id text,
  ADD COLUMN IF NOT EXISTS external_client_id text;
CREATE INDEX IF NOT EXISTS client_external_person_id_idx ON public.client(external_person_id);