
-- Phase 7: Savings transfers, adjustments, and standing orders

-- 1) Atomic same-currency transfer between two savings accounts (same company).
CREATE OR REPLACE FUNCTION public.post_savings_transfer(
  _from_account_id uuid,
  _to_account_id   uuid,
  _amount          numeric,
  _channel         text DEFAULT 'branch',
  _reference       text DEFAULT NULL,
  _narration       text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from   RECORD;
  v_to     RECORD;
  v_key    text := COALESCE(_idempotency_key, gen_random_uuid()::text);
  v_out_id uuid;
  v_in_id  uuid;
  v_ref    text := COALESCE(_reference, 'XFER-' || substr(v_key, 1, 8));
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF _from_account_id = _to_account_id THEN
    RAISE EXCEPTION 'From and to accounts must differ';
  END IF;

  SELECT id, company_id, currency, status INTO v_from
    FROM public.savings_account WHERE id = _from_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source account not found'; END IF;

  SELECT id, company_id, currency, status INTO v_to
    FROM public.savings_account WHERE id = _to_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Destination account not found'; END IF;

  IF v_from.company_id <> v_to.company_id THEN
    RAISE EXCEPTION 'Cross-company transfers are not permitted';
  END IF;
  IF NOT public.is_company_member(v_from.company_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF COALESCE(v_from.currency,'') <> COALESCE(v_to.currency,'') THEN
    RAISE EXCEPTION 'Currency mismatch between accounts';
  END IF;

  v_out_id := public.record_savings_txn(
    _account_id := _from_account_id,
    _txn_type   := 'transfer_out',
    _amount     := _amount,
    _channel    := _channel,
    _reference  := v_ref,
    _narration  := COALESCE(_narration, 'Transfer to ' || v_to.id::text),
    _idempotency_key := 'xfer-out:' || v_key
  );

  v_in_id := public.record_savings_txn(
    _account_id := _to_account_id,
    _txn_type   := 'transfer_in',
    _amount     := _amount,
    _channel    := _channel,
    _reference  := v_ref,
    _narration  := COALESCE(_narration, 'Transfer from ' || v_from.id::text),
    _idempotency_key := 'xfer-in:'  || v_key
  );

  -- Link the two legs together via external_ref for auditability.
  UPDATE public.savings_transaction
     SET external_ref = COALESCE(external_ref, v_key)
   WHERE id IN (v_out_id, v_in_id);

  RETURN jsonb_build_object(
    'ok', true,
    'out_txn_id', v_out_id,
    'in_txn_id',  v_in_id,
    'reference',  v_ref
  );
END $$;
GRANT EXECUTE ON FUNCTION public.post_savings_transfer(uuid,uuid,numeric,text,text,text,text) TO authenticated;

-- 2) Standing orders (customer-authorised recurring transfers)
DO $$ BEGIN
  CREATE TYPE public.standing_order_frequency AS ENUM
    ('daily','weekly','monthly','quarterly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.standing_order_status AS ENUM
    ('active','paused','cancelled','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.savings_standing_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  from_account_id uuid NOT NULL REFERENCES public.savings_account(id) ON DELETE CASCADE,
  to_account_id   uuid NOT NULL REFERENCES public.savings_account(id) ON DELETE CASCADE,
  amount numeric(20,4) NOT NULL CHECK (amount > 0),
  frequency public.standing_order_frequency NOT NULL,
  next_run_date date NOT NULL,
  end_date date,
  max_runs integer,
  runs_completed integer NOT NULL DEFAULT 0,
  narration text,
  reference_prefix text,
  status public.standing_order_status NOT NULL DEFAULT 'active',
  last_run_at timestamptz,
  last_run_status text,
  last_run_error text,
  consent_ref text,
  created_by uuid,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT so_accounts_differ CHECK (from_account_id <> to_account_id)
);
CREATE INDEX IF NOT EXISTS idx_sso_company_next
  ON public.savings_standing_order (company_id, status, next_run_date);

GRANT SELECT, INSERT, UPDATE ON public.savings_standing_order TO authenticated;
GRANT ALL ON public.savings_standing_order TO service_role;
ALTER TABLE public.savings_standing_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sso company members read"
  ON public.savings_standing_order FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "sso mandate managers write"
  ON public.savings_standing_order FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'savings.mandate.manage', company_id));

CREATE POLICY "sso mandate managers update"
  ON public.savings_standing_order FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'savings.mandate.manage', company_id))
  WITH CHECK (public.has_permission(auth.uid(), 'savings.mandate.manage', company_id));

CREATE TRIGGER trg_sso_updated_at
  BEFORE UPDATE ON public.savings_standing_order
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Compute next run date from a frequency
CREATE OR REPLACE FUNCTION public.next_standing_order_date(
  _from date, _freq public.standing_order_frequency
) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _freq
    WHEN 'daily'     THEN _from + INTERVAL '1 day'
    WHEN 'weekly'    THEN _from + INTERVAL '7 days'
    WHEN 'monthly'   THEN (_from + INTERVAL '1 month')::date
    WHEN 'quarterly' THEN (_from + INTERVAL '3 months')::date
    WHEN 'yearly'    THEN (_from + INTERVAL '1 year')::date
  END::date;
$$;

-- 4) Execute one standing order (idempotent per business date)
CREATE OR REPLACE FUNCTION public.execute_savings_standing_order(
  _id uuid, _business_date date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_so     RECORD;
  v_result jsonb;
  v_key    text;
  v_next   date;
BEGIN
  SELECT * INTO v_so FROM public.savings_standing_order WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Standing order not found'; END IF;

  IF v_so.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_active', 'status', v_so.status);
  END IF;
  IF v_so.next_run_date > _business_date THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_due', 'next_run_date', v_so.next_run_date);
  END IF;
  IF v_so.end_date IS NOT NULL AND _business_date > v_so.end_date THEN
    UPDATE public.savings_standing_order SET status='completed' WHERE id = _id;
    RETURN jsonb_build_object('ok', false, 'reason', 'past_end_date');
  END IF;

  v_key := 'so:' || _id::text || ':' || to_char(_business_date,'YYYYMMDD');

  BEGIN
    v_result := public.post_savings_transfer(
      _from_account_id := v_so.from_account_id,
      _to_account_id   := v_so.to_account_id,
      _amount          := v_so.amount,
      _channel         := 'api',
      _reference       := COALESCE(v_so.reference_prefix,'SO') || '-' || substr(_id::text,1,8),
      _narration       := COALESCE(v_so.narration, 'Standing order'),
      _idempotency_key := v_key
    );
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.savings_standing_order
       SET last_run_at = now(),
           last_run_status = 'failed',
           last_run_error = SQLERRM
     WHERE id = _id;
    RETURN jsonb_build_object('ok', false, 'reason', 'transfer_failed', 'error', SQLERRM);
  END;

  v_next := public.next_standing_order_date(_business_date, v_so.frequency);

  UPDATE public.savings_standing_order
     SET runs_completed = runs_completed + 1,
         last_run_at = now(),
         last_run_status = 'ok',
         last_run_error = NULL,
         next_run_date = v_next,
         status = CASE
           WHEN v_so.max_runs IS NOT NULL AND (runs_completed + 1) >= v_so.max_runs THEN 'completed'::public.standing_order_status
           WHEN v_so.end_date IS NOT NULL AND v_next > v_so.end_date THEN 'completed'::public.standing_order_status
           ELSE status
         END
   WHERE id = _id;

  RETURN jsonb_build_object('ok', true, 'result', v_result, 'next_run_date', v_next);
END $$;
GRANT EXECUTE ON FUNCTION public.execute_savings_standing_order(uuid,date) TO authenticated;

-- 5) Batch runner (used by cron webhook)
CREATE OR REPLACE FUNCTION public.run_savings_standing_orders(
  _company_id uuid, _business_date date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_summary jsonb := jsonb_build_object('processed',0,'ok',0,'failed',0,'skipped',0);
  v_res jsonb;
BEGIN
  FOR r IN
    SELECT id FROM public.savings_standing_order
     WHERE company_id = _company_id
       AND status = 'active'
       AND next_run_date <= _business_date
     ORDER BY next_run_date
  LOOP
    v_res := public.execute_savings_standing_order(r.id, _business_date);
    v_summary := jsonb_set(v_summary,'{processed}', to_jsonb((v_summary->>'processed')::int + 1));
    IF (v_res->>'ok')::boolean THEN
      v_summary := jsonb_set(v_summary,'{ok}', to_jsonb((v_summary->>'ok')::int + 1));
    ELSE
      v_summary := jsonb_set(v_summary,'{failed}', to_jsonb((v_summary->>'failed')::int + 1));
    END IF;
  END LOOP;
  RETURN v_summary;
END $$;
GRANT EXECUTE ON FUNCTION public.run_savings_standing_orders(uuid,date) TO service_role;
