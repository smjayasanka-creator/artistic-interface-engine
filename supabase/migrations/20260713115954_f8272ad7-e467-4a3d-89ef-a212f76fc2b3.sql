
ALTER TABLE public.journal_entry
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS source_ref uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entry_idem
  ON public.journal_entry (branch_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entry_source
  ON public.journal_entry (source_module, source_ref);

CREATE OR REPLACE FUNCTION public.post_entry(
  _entry_date date,
  _reference text,
  _description text,
  _lines jsonb,                       -- [{account_id, debit, credit, memo?}]
  _branch_id uuid DEFAULT NULL,       -- defaults to caller's staff branch
  _source_module text DEFAULT NULL,   -- 'loans' | 'savings' | 'fd' | 'alco' | 'workflow' | 'manual'
  _source_ref uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _loan_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _entry_id uuid;
  _existing uuid;
  _line jsonb;
  _acc_company uuid;
  _company_id uuid;
  _total_dr numeric(18,2) := 0;
  _total_cr numeric(18,2) := 0;
  _count int := 0;
  _debit numeric(18,2);
  _credit numeric(18,2);
BEGIN
  -- resolve branch: caller-supplied or the caller's own staff branch
  IF _branch_id IS NULL THEN
    _branch_id := public.current_staff_branch();
  END IF;
  IF _branch_id IS NULL THEN
    RAISE EXCEPTION 'post_entry requires a branch (caller has no staff record)';
  END IF;

  SELECT company_id INTO _company_id FROM public.branch WHERE id = _branch_id;
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Branch % not found', _branch_id;
  END IF;

  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of company %', _company_id;
  END IF;

  -- idempotency: reuse existing entry if the same key was already posted
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existing
      FROM public.journal_entry
     WHERE branch_id = _branch_id
       AND idempotency_key = _idempotency_key
     LIMIT 1;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'post_entry requires at least 2 posting lines';
  END IF;

  INSERT INTO public.journal_entry (
    branch_id, entry_date, reference, description,
    loan_id, posted_by, source_module, source_ref, idempotency_key
  ) VALUES (
    _branch_id, _entry_date, _reference, _description,
    _loan_id, public.current_staff_id(), _source_module, _source_ref, _idempotency_key
  )
  RETURNING id INTO _entry_id;

  FOR _line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    _debit  := COALESCE((_line->>'debit')::numeric, 0);
    _credit := COALESCE((_line->>'credit')::numeric, 0);

    SELECT company_id INTO _acc_company FROM public.gl_account
      WHERE id = (_line->>'account_id')::uuid;
    IF _acc_company IS NULL THEN
      RAISE EXCEPTION 'GL account % not found', _line->>'account_id';
    END IF;
    IF _acc_company <> _company_id THEN
      RAISE EXCEPTION 'GL account % belongs to a different company', _line->>'account_id';
    END IF;

    INSERT INTO public.posting (entry_id, account_id, debit, credit)
    VALUES (_entry_id, (_line->>'account_id')::uuid, _debit, _credit);

    _total_dr := _total_dr + _debit;
    _total_cr := _total_cr + _credit;
    _count := _count + 1;
  END LOOP;

  IF _total_dr <> _total_cr THEN
    RAISE EXCEPTION 'Unbalanced entry: debits % <> credits %', _total_dr, _total_cr;
  END IF;

  -- emit ledger.entry_posted domain event
  PERFORM public.emit_domain_event(
    _company_id,
    'ledger',
    'entry_posted',
    'journal_entry',
    _entry_id,
    jsonb_build_object(
      'reference', _reference,
      'entry_date', _entry_date,
      'total', _total_dr,
      'line_count', _count,
      'branch_id', _branch_id,
      'source_module', _source_module,
      'source_ref', _source_ref
    ),
    '{}'::jsonb,
    CASE WHEN _idempotency_key IS NOT NULL
         THEN 'ledger:'||_branch_id::text||':'||_idempotency_key
         ELSE NULL END
  );

  RETURN _entry_id;
END $$;

GRANT EXECUTE ON FUNCTION public.post_entry(
  date, text, text, jsonb, uuid, text, uuid, text, uuid
) TO authenticated;
