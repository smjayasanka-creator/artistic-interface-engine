
-- 1. Add secret column for HMAC signing (server-only usage; RLS already restricts to company admins/members)
ALTER TABLE public.webhook_endpoint
  ADD COLUMN IF NOT EXISTS secret text NOT NULL DEFAULT '';

-- 2. Enable schedulers
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Unschedule previous version if it exists, then schedule dispatcher (every minute)
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'webhook-dispatcher';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'webhook-dispatcher',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--d849c3df-d501-4116-9e99-19a87f7ae45e.lovable.app/api/public/webhooks/dispatch',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjbmFvcWZzY3Z4cHNpenV0bndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjQyMzIsImV4cCI6MjA5OTEwMDIzMn0.bMq6sHQX3_AVTSmaSTZzKjP7j50PSwTw_4-YFx8EcZ4"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);
