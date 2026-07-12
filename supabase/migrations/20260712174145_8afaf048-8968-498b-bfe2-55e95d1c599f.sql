
-- API keys for third-party integrations
CREATE TABLE public.api_key (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX api_key_hash_uidx ON public.api_key(key_hash);
CREATE INDEX api_key_company_idx ON public.api_key(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_key TO authenticated;
GRANT ALL ON public.api_key TO service_role;

ALTER TABLE public.api_key ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company admins view keys" ON public.api_key
  FOR SELECT TO authenticated
  USING (public.is_company_admin(company_id) OR public.has_role(auth.uid(), 'platform_admin'::public.app_role));

CREATE POLICY "company admins create keys" ON public.api_key
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin(company_id) OR public.has_role(auth.uid(), 'platform_admin'::public.app_role));

CREATE POLICY "company admins update keys" ON public.api_key
  FOR UPDATE TO authenticated
  USING (public.is_company_admin(company_id) OR public.has_role(auth.uid(), 'platform_admin'::public.app_role))
  WITH CHECK (public.is_company_admin(company_id) OR public.has_role(auth.uid(), 'platform_admin'::public.app_role));

CREATE TRIGGER api_key_touch BEFORE UPDATE ON public.api_key
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Every API call, inbound or outbound
CREATE TABLE public.api_transaction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.company(id) ON DELETE SET NULL,
  api_key_id UUID REFERENCES public.api_key(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  status_code INT,
  request JSONB,
  response JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX api_txn_log_company_idx ON public.api_transaction_log(company_id, created_at DESC);
CREATE INDEX api_txn_log_channel_idx ON public.api_transaction_log(channel, created_at DESC);

GRANT SELECT ON public.api_transaction_log TO authenticated;
GRANT ALL ON public.api_transaction_log TO service_role;

ALTER TABLE public.api_transaction_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members view api logs" ON public.api_transaction_log
  FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND (public.is_company_member(company_id) OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)));
