-- Append-only enforcement on posting
CREATE OR REPLACE FUNCTION public.posting_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'posting is append-only: % not allowed', TG_OP;
END $$;

DROP TRIGGER IF EXISTS posting_no_update ON public.posting;
DROP TRIGGER IF EXISTS posting_no_delete ON public.posting;

CREATE TRIGGER posting_no_update
  BEFORE UPDATE ON public.posting
  FOR EACH ROW EXECUTE FUNCTION public.posting_append_only();

CREATE TRIGGER posting_no_delete
  BEFORE DELETE ON public.posting
  FOR EACH ROW EXECUTE FUNCTION public.posting_append_only();

-- Also protect journal_entry from mutation/deletion
CREATE OR REPLACE FUNCTION public.journal_entry_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'journal_entry is append-only: % not allowed', TG_OP;
END $$;

DROP TRIGGER IF EXISTS journal_entry_no_update ON public.journal_entry;
DROP TRIGGER IF EXISTS journal_entry_no_delete ON public.journal_entry;

CREATE TRIGGER journal_entry_no_update
  BEFORE UPDATE ON public.journal_entry
  FOR EACH ROW EXECUTE FUNCTION public.journal_entry_append_only();

CREATE TRIGGER journal_entry_no_delete
  BEFORE DELETE ON public.journal_entry
  FOR EACH ROW EXECUTE FUNCTION public.journal_entry_append_only();

-- Dispatch tracking columns on domain_event
ALTER TABLE public.domain_event
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dispatch_error text,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

-- Index for pending events ready to dispatch
CREATE INDEX IF NOT EXISTS domain_event_pending_idx
  ON public.domain_event (next_attempt_at)
  WHERE dispatched_at IS NULL;

-- RPC for the dispatcher worker to claim a batch of pending events
CREATE OR REPLACE FUNCTION public.claim_pending_domain_events(_limit int DEFAULT 50)
RETURNS SETOF public.domain_event
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.domain_event de
     SET dispatch_attempts = de.dispatch_attempts + 1,
         next_attempt_at   = now() + (interval '1 minute' * least(de.dispatch_attempts + 1, 30))
   WHERE de.id IN (
     SELECT id FROM public.domain_event
      WHERE dispatched_at IS NULL
        AND next_attempt_at <= now()
      ORDER BY next_attempt_at ASC
      LIMIT _limit
      FOR UPDATE SKIP LOCKED
   )
   RETURNING de.*;
END $$;

-- Mark event as successfully dispatched
CREATE OR REPLACE FUNCTION public.mark_domain_event_dispatched(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.domain_event
     SET dispatched_at = now(),
         last_dispatch_error = NULL
   WHERE id = _id;
$$;

-- Mark event dispatch failed (records the error message)
CREATE OR REPLACE FUNCTION public.mark_domain_event_failed(_id uuid, _error text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.domain_event
     SET last_dispatch_error = _error
   WHERE id = _id;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_domain_events(int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_domain_event_dispatched(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_domain_event_failed(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_domain_events(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_domain_event_dispatched(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_domain_event_failed(uuid, text) TO service_role;