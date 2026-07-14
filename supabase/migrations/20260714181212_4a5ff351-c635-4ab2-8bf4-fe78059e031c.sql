
-- ============================================================
-- 1. LOAN ALCO RATE — add versioning columns
-- ============================================================
ALTER TABLE public.loan_alco_rate
  ADD COLUMN IF NOT EXISTS effective_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS effective_to   timestamptz NULL,
  ADD COLUMN IF NOT EXISTS superseded_by  uuid NULL REFERENCES public.loan_alco_rate(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note           text NULL,
  ADD COLUMN IF NOT EXISTS created_by     uuid NULL;

-- Only one active version per (product, security_type, equipment_vehicle)
CREATE UNIQUE INDEX IF NOT EXISTS loan_alco_rate_active_uk
  ON public.loan_alco_rate (product_id,
                            COALESCE(security_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
                            COALESCE(lower(equipment_vehicle), ''))
  WHERE effective_to IS NULL AND active = true;

CREATE INDEX IF NOT EXISTS loan_alco_rate_effective_idx
  ON public.loan_alco_rate (product_id, effective_from DESC);

-- ============================================================
-- 2. FD RATE TIER — upgrade to timestamptz + versioning
-- ============================================================
ALTER TABLE public.fd_rate_tier
  ALTER COLUMN effective_from TYPE timestamptz USING effective_from::timestamptz,
  ALTER COLUMN effective_to   TYPE timestamptz USING effective_to::timestamptz,
  ALTER COLUMN effective_from SET DEFAULT now();

ALTER TABLE public.fd_rate_tier
  ADD COLUMN IF NOT EXISTS superseded_by uuid NULL REFERENCES public.fd_rate_tier(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note          text NULL,
  ADD COLUMN IF NOT EXISTS created_by    uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fd_rate_tier_active_uk
  ON public.fd_rate_tier (product_id, tenure_months)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS fd_rate_tier_effective_idx
  ON public.fd_rate_tier (product_id, effective_from DESC);

-- ============================================================
-- 3. SAVINGS ALCO RATE — new versioned table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.savings_alco_rate (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES public.savings_product(id) ON DELETE CASCADE,
  min_balance     numeric(18,2) NOT NULL DEFAULT 0,
  max_balance     numeric(18,2) NULL,
  annual_rate     numeric(7,4)  NOT NULL,
  active          boolean       NOT NULL DEFAULT true,
  effective_from  timestamptz   NOT NULL DEFAULT now(),
  effective_to    timestamptz   NULL,
  superseded_by   uuid          NULL REFERENCES public.savings_alco_rate(id) ON DELETE SET NULL,
  note            text          NULL,
  created_by      uuid          NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_alco_rate TO authenticated;
GRANT ALL ON public.savings_alco_rate TO service_role;

ALTER TABLE public.savings_alco_rate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "savings_alco_rate member read"   ON public.savings_alco_rate;
DROP POLICY IF EXISTS "savings_alco_rate member write"  ON public.savings_alco_rate;

CREATE POLICY "savings_alco_rate member read" ON public.savings_alco_rate
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "savings_alco_rate member write" ON public.savings_alco_rate
  FOR ALL TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

CREATE UNIQUE INDEX IF NOT EXISTS savings_alco_rate_active_uk
  ON public.savings_alco_rate (product_id,
                               min_balance,
                               COALESCE(max_balance, 999999999999.99))
  WHERE effective_to IS NULL AND active = true;

CREATE INDEX IF NOT EXISTS savings_alco_rate_effective_idx
  ON public.savings_alco_rate (product_id, effective_from DESC);

DROP TRIGGER IF EXISTS trg_savings_alco_rate_updated ON public.savings_alco_rate;
CREATE TRIGGER trg_savings_alco_rate_updated
  BEFORE UPDATE ON public.savings_alco_rate
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4. RPCs — close-prior + insert-new version (atomic)
-- ============================================================

-- Loan
CREATE OR REPLACE FUNCTION public.upsert_loan_alco_rate_version(
  _product_id        uuid,
  _security_type_id  uuid,
  _equipment_vehicle text,
  _min_rate          numeric,
  _max_rate          numeric,
  _min_period_months integer,
  _max_period_months integer,
  _effective_from    timestamptz DEFAULT now(),
  _note              text        DEFAULT NULL,
  _active            boolean     DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _company_id uuid;
  _prev_id    uuid;
  _new_id     uuid;
BEGIN
  SELECT company_id INTO _company_id FROM public.loan_product WHERE id = _product_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Loan product % not found', _product_id; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of company %', _company_id;
  END IF;
  IF _effective_from IS NULL THEN _effective_from := now(); END IF;
  IF _max_rate < _min_rate THEN RAISE EXCEPTION 'max_rate must be >= min_rate'; END IF;
  IF _max_period_months < _min_period_months THEN RAISE EXCEPTION 'max_period_months must be >= min_period_months'; END IF;

  -- Close the currently active version, if any, at the new effective_from.
  UPDATE public.loan_alco_rate
     SET effective_to = _effective_from
   WHERE product_id = _product_id
     AND COALESCE(security_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(_security_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND COALESCE(lower(equipment_vehicle), '')
         = COALESCE(lower(NULLIF(_equipment_vehicle, '')), '')
     AND effective_to IS NULL
   RETURNING id INTO _prev_id;

  INSERT INTO public.loan_alco_rate (
    company_id, product_id, security_type_id, equipment_vehicle,
    min_rate, max_rate, min_period_months, max_period_months,
    active, effective_from, note, created_by
  ) VALUES (
    _company_id, _product_id, _security_type_id, NULLIF(_equipment_vehicle, ''),
    _min_rate, _max_rate, _min_period_months, _max_period_months,
    COALESCE(_active, true), _effective_from, _note, auth.uid()
  ) RETURNING id INTO _new_id;

  IF _prev_id IS NOT NULL THEN
    UPDATE public.loan_alco_rate SET superseded_by = _new_id WHERE id = _prev_id;
  END IF;

  PERFORM public.emit_domain_event(
    _company_id, 'alco', 'loan_rate_versioned', 'loan_alco_rate', _new_id,
    jsonb_build_object('product_id', _product_id, 'previous_id', _prev_id,
                       'effective_from', _effective_from, 'note', _note),
    '{}'::jsonb, NULL
  );

  RETURN _new_id;
END $$;

-- FD
CREATE OR REPLACE FUNCTION public.upsert_fd_rate_tier_version(
  _product_id     uuid,
  _tenure_months  integer,
  _annual_rate    numeric,
  _effective_from timestamptz DEFAULT now(),
  _note           text        DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _company_id uuid;
  _prev_id    uuid;
  _new_id     uuid;
BEGIN
  SELECT company_id INTO _company_id FROM public.fd_product WHERE id = _product_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'FD product % not found', _product_id; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of company %', _company_id;
  END IF;
  IF _effective_from IS NULL THEN _effective_from := now(); END IF;

  UPDATE public.fd_rate_tier
     SET effective_to = _effective_from
   WHERE product_id = _product_id
     AND tenure_months = _tenure_months
     AND effective_to IS NULL
   RETURNING id INTO _prev_id;

  INSERT INTO public.fd_rate_tier (
    product_id, tenure_months, annual_rate, effective_from, note, created_by
  ) VALUES (
    _product_id, _tenure_months, _annual_rate, _effective_from, _note, auth.uid()
  ) RETURNING id INTO _new_id;

  IF _prev_id IS NOT NULL THEN
    UPDATE public.fd_rate_tier SET superseded_by = _new_id WHERE id = _prev_id;
  END IF;

  PERFORM public.emit_domain_event(
    _company_id, 'alco', 'fd_rate_versioned', 'fd_rate_tier', _new_id,
    jsonb_build_object('product_id', _product_id, 'tenure_months', _tenure_months,
                       'previous_id', _prev_id, 'effective_from', _effective_from, 'note', _note),
    '{}'::jsonb, NULL
  );

  RETURN _new_id;
END $$;

-- Savings
CREATE OR REPLACE FUNCTION public.upsert_savings_alco_rate_version(
  _product_id     uuid,
  _min_balance    numeric,
  _max_balance    numeric,
  _annual_rate    numeric,
  _effective_from timestamptz DEFAULT now(),
  _note           text        DEFAULT NULL,
  _active         boolean     DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _company_id uuid;
  _prev_id    uuid;
  _new_id     uuid;
BEGIN
  SELECT company_id INTO _company_id FROM public.savings_product WHERE id = _product_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Savings product % not found', _product_id; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of company %', _company_id;
  END IF;
  IF _effective_from IS NULL THEN _effective_from := now(); END IF;
  IF _max_balance IS NOT NULL AND _max_balance < _min_balance THEN
    RAISE EXCEPTION 'max_balance must be >= min_balance';
  END IF;

  UPDATE public.savings_alco_rate
     SET effective_to = _effective_from
   WHERE product_id = _product_id
     AND min_balance = COALESCE(_min_balance, 0)
     AND COALESCE(max_balance, 999999999999.99) = COALESCE(_max_balance, 999999999999.99)
     AND effective_to IS NULL
   RETURNING id INTO _prev_id;

  INSERT INTO public.savings_alco_rate (
    company_id, product_id, min_balance, max_balance, annual_rate,
    active, effective_from, note, created_by
  ) VALUES (
    _company_id, _product_id, COALESCE(_min_balance, 0), _max_balance, _annual_rate,
    COALESCE(_active, true), _effective_from, _note, auth.uid()
  ) RETURNING id INTO _new_id;

  IF _prev_id IS NOT NULL THEN
    UPDATE public.savings_alco_rate SET superseded_by = _new_id WHERE id = _prev_id;
  END IF;

  PERFORM public.emit_domain_event(
    _company_id, 'alco', 'savings_rate_versioned', 'savings_alco_rate', _new_id,
    jsonb_build_object('product_id', _product_id, 'previous_id', _prev_id,
                       'effective_from', _effective_from, 'note', _note),
    '{}'::jsonb, NULL
  );

  RETURN _new_id;
END $$;
