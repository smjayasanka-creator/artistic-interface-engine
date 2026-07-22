
CREATE TABLE IF NOT EXISTS public.client_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.client(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'client-attachments',
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  version integer NOT NULL DEFAULT 1,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_attachment_client_id_idx ON public.client_attachment(client_id);
CREATE INDEX IF NOT EXISTS client_attachment_type_idx ON public.client_attachment(client_id, document_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_attachment TO authenticated;
GRANT ALL ON public.client_attachment TO service_role;

ALTER TABLE public.client_attachment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_attachment company read" ON public.client_attachment
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.client c
      JOIN public.branch b ON b.id = c.branch_id
      WHERE c.id = client_attachment.client_id
        AND b.company_id = public.current_company_id()
    )
  );
CREATE POLICY "client_attachment company insert" ON public.client_attachment
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client c
      JOIN public.branch b ON b.id = c.branch_id
      WHERE c.id = client_attachment.client_id
        AND b.company_id = public.current_company_id()
    )
  );
CREATE POLICY "client_attachment company update" ON public.client_attachment
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.client c
      JOIN public.branch b ON b.id = c.branch_id
      WHERE c.id = client_attachment.client_id
        AND b.company_id = public.current_company_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client c
      JOIN public.branch b ON b.id = c.branch_id
      WHERE c.id = client_attachment.client_id
        AND b.company_id = public.current_company_id()
    )
  );
CREATE POLICY "client_attachment company delete" ON public.client_attachment
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.client c
      JOIN public.branch b ON b.id = c.branch_id
      WHERE c.id = client_attachment.client_id
        AND b.company_id = public.current_company_id()
    )
  );
