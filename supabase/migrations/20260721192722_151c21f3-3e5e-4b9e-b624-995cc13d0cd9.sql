
-- =========================================================
-- Phase 1: env isolation helper + new API portal tables
-- =========================================================

-- ---- env helper (reads session GUC, defaults to production)
CREATE OR REPLACE FUNCTION public.current_api_env()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_env', true), ''), 'production')
$$;

-- ---- api_transaction_log: add env column (back-fill from api_key.environment)
ALTER TABLE public.api_transaction_log
  ADD COLUMN IF NOT EXISTS env text;

UPDATE public.api_transaction_log l
   SET env = COALESCE(k.environment, 'production')
  FROM public.api_key k
 WHERE l.api_key_id = k.id
   AND l.env IS NULL;

UPDATE public.api_transaction_log
   SET env = 'production'
 WHERE env IS NULL;

ALTER TABLE public.api_transaction_log
  ALTER COLUMN env SET NOT NULL,
  ALTER COLUMN env SET DEFAULT 'production',
  ADD CONSTRAINT api_transaction_log_env_check
    CHECK (env IN ('sandbox','production'));

CREATE INDEX IF NOT EXISTS api_txn_log_company_env_idx
  ON public.api_transaction_log (company_id, env, created_at DESC);

-- Tighten SELECT policy to also filter by current env
DROP POLICY IF EXISTS "company members view api logs" ON public.api_transaction_log;
CREATE POLICY "company members view api logs"
  ON public.api_transaction_log FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND env = public.current_api_env()
    AND (is_company_member(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  );

-- Tighten api_key visibility to current env too
DROP POLICY IF EXISTS "company admins view keys" ON public.api_key;
CREATE POLICY "company admins view keys"
  ON public.api_key FOR SELECT TO authenticated
  USING (
    environment = public.current_api_env()
    AND (is_company_admin(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  );

-- =========================================================
-- api_idempotency  (company + env scoped)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.api_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  env text NOT NULL CHECK (env IN ('sandbox','production')),
  endpoint text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status int NOT NULL,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (company_id, env, endpoint, idempotency_key)
);

GRANT SELECT ON public.api_idempotency TO authenticated;
GRANT ALL ON public.api_idempotency TO service_role;

ALTER TABLE public.api_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members view idempotency"
  ON public.api_idempotency FOR SELECT TO authenticated
  USING (
    env = public.current_api_env()
    AND (is_company_member(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  );

CREATE INDEX IF NOT EXISTS api_idempotency_expires_idx
  ON public.api_idempotency (expires_at);

-- =========================================================
-- api_mapping_template  (company + env scoped)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.api_mapping_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  env text NOT NULL CHECK (env IN ('sandbox','production')),
  name text NOT NULL,
  description text,
  target_resource text NOT NULL,
  source_sample jsonb,
  field_mappings jsonb NOT NULL DEFAULT '[]'::jsonb,
  transformations jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, env, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_mapping_template TO authenticated;
GRANT ALL ON public.api_mapping_template TO service_role;

ALTER TABLE public.api_mapping_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members view mappings"
  ON public.api_mapping_template FOR SELECT TO authenticated
  USING (
    env = public.current_api_env()
    AND (is_company_member(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  );

CREATE POLICY "company admins manage mappings insert"
  ON public.api_mapping_template FOR INSERT TO authenticated
  WITH CHECK (
    env = public.current_api_env()
    AND (is_company_admin(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  );

CREATE POLICY "company admins manage mappings update"
  ON public.api_mapping_template FOR UPDATE TO authenticated
  USING (
    env = public.current_api_env()
    AND (is_company_admin(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  )
  WITH CHECK (
    env = public.current_api_env()
    AND (is_company_admin(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  );

CREATE POLICY "company admins manage mappings delete"
  ON public.api_mapping_template FOR DELETE TO authenticated
  USING (
    env = public.current_api_env()
    AND (is_company_admin(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  );

CREATE TRIGGER api_mapping_template_touch
  BEFORE UPDATE ON public.api_mapping_template
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- webhook_endpoint  (company + env scoped)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.webhook_endpoint (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  env text NOT NULL CHECK (env IN ('sandbox','production')),
  label text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}'::text[],
  secret_prefix text NOT NULL,
  secret_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  timeout_ms int NOT NULL DEFAULT 10000 CHECK (timeout_ms BETWEEN 1000 AND 30000),
  max_attempts int NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  custom_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_delivery_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoint TO authenticated;
GRANT ALL ON public.webhook_endpoint TO service_role;

ALTER TABLE public.webhook_endpoint ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members view webhooks"
  ON public.webhook_endpoint FOR SELECT TO authenticated
  USING (
    env = public.current_api_env()
    AND (is_company_member(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  );

CREATE POLICY "company admins manage webhooks insert"
  ON public.webhook_endpoint FOR INSERT TO authenticated
  WITH CHECK (
    env = public.current_api_env()
    AND (is_company_admin(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  );

CREATE POLICY "company admins manage webhooks update"
  ON public.webhook_endpoint FOR UPDATE TO authenticated
  USING (
    env = public.current_api_env()
    AND (is_company_admin(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  )
  WITH CHECK (
    env = public.current_api_env()
    AND (is_company_admin(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  );

CREATE POLICY "company admins manage webhooks delete"
  ON public.webhook_endpoint FOR DELETE TO authenticated
  USING (
    env = public.current_api_env()
    AND (is_company_admin(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  );

CREATE TRIGGER webhook_endpoint_touch
  BEFORE UPDATE ON public.webhook_endpoint
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- webhook_delivery  (company + env scoped attempt log)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.webhook_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  env text NOT NULL CHECK (env IN ('sandbox','production')),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoint(id) ON DELETE CASCADE,
  event_id uuid,
  event_type text NOT NULL,
  attempt int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','success','failed','dead_letter')),
  status_code int,
  response_ms int,
  response_snippet text,
  next_retry_at timestamptz,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.webhook_delivery TO authenticated;
GRANT ALL ON public.webhook_delivery TO service_role;

ALTER TABLE public.webhook_delivery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members view webhook deliveries"
  ON public.webhook_delivery FOR SELECT TO authenticated
  USING (
    env = public.current_api_env()
    AND (is_company_member(company_id) OR has_role(auth.uid(), 'platform_admin'::app_role))
  );

CREATE INDEX IF NOT EXISTS webhook_delivery_endpoint_idx
  ON public.webhook_delivery (endpoint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_delivery_retry_idx
  ON public.webhook_delivery (next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;
