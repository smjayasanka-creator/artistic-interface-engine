CREATE OR REPLACE FUNCTION public.post_manual_journal(
  p_reference text,
  p_description text,
  p_lines jsonb,
  p_entry_date date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_branch_id uuid;
  v_staff_id uuid;
  v_total_dr numeric(18,2) := 0;
  v_total_cr numeric(18,2) := 0;
  v_line jsonb;
  v_account_id uuid;
  v_debit numeric(18,2);
  v_credit numeric(18,2);
BEGIN
  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    RAISE EXCEPTION 'Reference is required';
  END IF;
  IF p_entry_date IS NULL THEN
    RAISE EXCEPTION 'Entry date is required';
  END IF;
  IF p_entry_date > current_date THEN
    RAISE EXCEPTION 'Entry date cannot be in the future';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'At least two posting lines are required';
  END IF;

  SELECT id, branch_id INTO v_staff_id, v_branch_id
  FROM public.staff
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Caller must be linked to a branch to post a journal entry';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_debit  := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit')::numeric, 0);
    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'Debit and credit must be non-negative';
    END IF;
    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'A single line cannot have both debit and credit';
    END IF;
    IF v_debit = 0 AND v_credit = 0 THEN
      RAISE EXCEPTION 'Each line must have a debit or a credit';
    END IF;
    v_total_dr := v_total_dr + v_debit;
    v_total_cr := v_total_cr + v_credit;
  END LOOP;

  IF round(v_total_dr, 2) <> round(v_total_cr, 2) THEN
    RAISE EXCEPTION 'Journal not balanced: DR % vs CR %', v_total_dr, v_total_cr;
  END IF;

  INSERT INTO public.journal_entry (reference, entry_date, branch_id, description, posted_by)
  VALUES (p_reference, p_entry_date, v_branch_id, p_description, v_staff_id)
  RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_debit  := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit')::numeric, 0);
    SELECT id INTO v_account_id
    FROM public.gl_account
    WHERE code = v_line->>'account_code';
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'Unknown GL account code: %', v_line->>'account_code';
    END IF;
    INSERT INTO public.posting (entry_id, account_id, debit, credit)
    VALUES (v_entry_id, v_account_id, v_debit, v_credit);
  END LOOP;

  RETURN jsonb_build_object('entry_id', v_entry_id, 'reference', p_reference);
END;
$$;

REVOKE ALL ON FUNCTION public.post_manual_journal(text, text, jsonb, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_manual_journal(text, text, jsonb, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.compute_trial_balance(
  _company_id uuid,
  _as_at date
) RETURNS TABLE (
  account_id uuid,
  code text,
  name text,
  debits numeric,
  credits numeric,
  balance numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id                                                  AS account_id,
    a.code,
    a.name,
    COALESCE(SUM(p.debit), 0)                             AS debits,
    COALESCE(SUM(p.credit), 0)                            AS credits,
    (COALESCE(SUM(p.debit), 0) - COALESCE(SUM(p.credit), 0)) * a.normal_balance AS balance
  FROM public.gl_account a
  LEFT JOIN public.posting p        ON p.account_id = a.id
  LEFT JOIN public.journal_entry je ON je.id = p.entry_id AND je.entry_date <= _as_at
  LEFT JOIN public.branch b         ON b.id = je.branch_id AND b.company_id = _company_id
  WHERE p.id IS NULL OR b.id IS NOT NULL
  GROUP BY a.id, a.code, a.name, a.normal_balance
  ORDER BY a.code;
$$;

REVOKE ALL ON FUNCTION public.compute_trial_balance(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_trial_balance(uuid, date) TO authenticated;