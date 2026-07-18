
CREATE TABLE IF NOT EXISTS public.fd_alco_rate (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES public.fd_product(id) ON DELETE CASCADE,
  standard_rate   numeric(7,4) NULL,
  maximum_rate    numeric(7,4) NULL,
  cbsl_max_rate   numeric(7,4) NULL,
  active          boolean       NOT NULL DEFAULT true,
  effective_from  timestamptz   NOT NULL DEFAULT now(),
  effective_to    timestamptz   NULL,
  superseded_by   uuid          NULL REFERENCES public.fd_alco_rate(id) ON DELETE SET NULL,
  note            text          NULL,
  created_by      uuid          NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fd_alco_rate TO authenticated;
GRANT ALL ON public.fd_alco_rate TO service_role;

ALTER TABLE public.fd_alco_rate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fd_alco_rate member read"  ON public.fd_alco_rate;
DROP POLICY IF EXISTS "fd_alco_rate member write" ON public.fd_alco_rate;

CREATE POLICY "fd_alco_rate member read" ON public.fd_alco_rate
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "fd_alco_rate member write" ON public.fd_alco_rate
  FOR ALL TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

CREATE UNIQUE INDEX IF NOT EXISTS fd_alco_rate_active_uk
  ON public.fd_alco_rate (product_id)
  WHERE effective_to IS NULL AND active = true;

CREATE INDEX IF NOT EXISTS fd_alco_rate_effective_idx
  ON public.fd_alco_rate (product_id, effective_from DESC);

DROP TRIGGER IF EXISTS trg_fd_alco_rate_updated ON public.fd_alco_rate;
CREATE TRIGGER trg_fd_alco_rate_updated
  BEFORE UPDATE ON public.fd_alco_rate
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.upsert_fd_alco_rate_version(
  _product_id     uuid,
  _standard_rate  numeric,
  _maximum_rate   numeric,
  _cbsl_max_rate  numeric,
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
  SELECT company_id INTO _company_id FROM public.fd_product WHERE id = _product_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'FD product % not found', _product_id; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of company %', _company_id;
  END IF;
  IF _effective_from IS NULL THEN _effective_from := now(); END IF;

  UPDATE public.fd_alco_rate
     SET effective_to = _effective_from
   WHERE product_id = _product_id
     AND effective_to IS NULL
   RETURNING id INTO _prev_id;

  INSERT INTO public.fd_alco_rate (
    company_id, product_id, standard_rate, maximum_rate, cbsl_max_rate,
    active, effective_from, note, created_by
  ) VALUES (
    _company_id, _product_id, _standard_rate, _maximum_rate, _cbsl_max_rate,
    COALESCE(_active, true), _effective_from, _note, auth.uid()
  ) RETURNING id INTO _new_id;

  IF _prev_id IS NOT NULL THEN
    UPDATE public.fd_alco_rate SET superseded_by = _new_id WHERE id = _prev_id;
  END IF;

  UPDATE public.fd_product
     SET standard_rate = _standard_rate,
         maximum_rate  = _maximum_rate,
         cbsl_max_rate = _cbsl_max_rate
   WHERE id = _product_id;

  PERFORM public.emit_domain_event(
    _company_id, 'alco', 'fd_alco_rate_versioned', 'fd_alco_rate', _new_id,
    jsonb_build_object('product_id', _product_id, 'previous_id', _prev_id,
                       'effective_from', _effective_from, 'note', _note),
    '{}'::jsonb, NULL
  );

  RETURN _new_id;
END $$;
