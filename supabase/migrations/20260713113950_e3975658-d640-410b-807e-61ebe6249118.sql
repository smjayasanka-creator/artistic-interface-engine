-- Domain event outbox: transactional audit + future event bus feed.
-- Written in the same tx as the business change; consumers come later.

CREATE TYPE public.domain_event_status AS ENUM ('pending', 'dispatched', 'failed', 'skipped');

CREATE TABLE public.domain_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES public.company(id) ON DELETE CASCADE,
  domain          text NOT NULL,                    -- 'loans' | 'savings' | 'fd' | 'workflow' | 'alco' | 'api' | 'clients' | 'ledger'
  event_type      text NOT NULL,                    -- e.g. 'fd.booked', 'loan.disbursed'
  aggregate_type  text NOT NULL,                    -- e.g. 'fixed_deposit', 'loan'
  aggregate_id    uuid NOT NULL,                    -- primary key of the affected row
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb, -- correlation_id, causation_id, user agent, etc.
  idempotency_key text,                             -- optional; unique per (company, domain) when set
  actor_user_id   uuid,                             -- auth.uid() at write time; not FK'd (auth schema)
  status          public.domain_event_status NOT NULL DEFAULT 'pending',
  dispatched_at   timestamptz,
  attempt_count   int NOT NULL DEFAULT 0,
  last_error      text,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Hot paths: (a) dispatcher scans pending events, (b) domain replay, (c) aggregate history.
CREATE INDEX idx_domain_event_pending ON public.domain_event (occurred_at) WHERE status = 'pending';
CREATE INDEX idx_domain_event_domain_time ON public.domain_event (domain, occurred_at DESC);
CREATE INDEX idx_domain_event_aggregate ON public.domain_event (aggregate_type, aggregate_id, occurred_at DESC);
CREATE INDEX idx_domain_event_company_time ON public.domain_event (company_id, occurred_at DESC);
CREATE UNIQUE INDEX uq_domain_event_idem
  ON public.domain_event (company_id, domain, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

GRANT SELECT, INSERT ON public.domain_event TO authenticated;
GRANT ALL ON public.domain_event TO service_role;

ALTER TABLE public.domain_event ENABLE ROW LEVEL SECURITY;

-- Read-own-company: any member of the company can see events (admins will consume via a filtered view).
CREATE POLICY "Company members can read events"
  ON public.domain_event
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL
    OR public.is_company_member(company_id)
  );

-- Writes are done via the emit_event() RPC below (SECURITY DEFINER); no direct inserts from clients.
-- We still grant INSERT so server functions running as the caller can write directly if they choose.
CREATE POLICY "Company members can emit events"
  ON public.domain_event
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IS NULL
    OR public.is_company_member(company_id)
  );

-- Central emit helper — server functions call this instead of raw INSERT so shape stays consistent.
CREATE OR REPLACE FUNCTION public.emit_domain_event(
  _company_id      uuid,
  _domain          text,
  _event_type      text,
  _aggregate_type  text,
  _aggregate_id    uuid,
  _payload         jsonb DEFAULT '{}'::jsonb,
  _metadata        jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF _company_id IS NOT NULL AND NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of company %', _company_id;
  END IF;

  INSERT INTO public.domain_event (
    company_id, domain, event_type, aggregate_type, aggregate_id,
    payload, metadata, idempotency_key, actor_user_id
  ) VALUES (
    _company_id, _domain, _event_type, _aggregate_type, _aggregate_id,
    COALESCE(_payload, '{}'::jsonb), COALESCE(_metadata, '{}'::jsonb),
    _idempotency_key, auth.uid()
  )
  ON CONFLICT (company_id, domain, idempotency_key)
    WHERE idempotency_key IS NOT NULL
    DO UPDATE SET metadata = public.domain_event.metadata -- no-op to return the existing row
  RETURNING id INTO _id;

  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.emit_domain_event(uuid, text, text, text, uuid, jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.emit_domain_event(uuid, text, text, text, uuid, jsonb, jsonb, text) TO authenticated, service_role;

COMMENT ON TABLE public.domain_event IS
  'Transactional outbox. Written in the same tx as a domain change so the change and its event are atomic. Consumers can replay by (aggregate_type, aggregate_id) or drain pending rows.';
COMMENT ON FUNCTION public.emit_domain_event IS
  'Preferred way for server functions to record a domain event. Enforces company membership and idempotency.';
