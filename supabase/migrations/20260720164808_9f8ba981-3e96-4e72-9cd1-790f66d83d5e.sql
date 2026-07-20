
ALTER TABLE public.savings_product
  ADD COLUMN IF NOT EXISTS adjustment_account_id uuid REFERENCES public.gl_account(id);

INSERT INTO public.permission (code, module, label, description, sort_order)
VALUES ('savings.standing_order.execute','Savings','Execute standing orders',
        'Trigger execution of standing orders', 60)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_savings_txn(
  _account_id uuid,
  _txn_type text,
  _amount numeric,
  _channel text DEFAULT 'branch',
  _reference text DEFAULT NULL,
  _external_ref text DEFAULT NULL,
  _narration text DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _payment_details jsonb DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acct        RECORD;
  v_product     RECORD;
  v_staff_id    uuid;
  v_company_id  uuid;
  v_signed      numeric;
  v_new_bal     numeric;
  v_new_avail   numeric;
  v_holds       numeric;
  v_txn_id      uuid;
  v_existing_id uuid;
  v_gl_cash     uuid;
  v_gl_liab     uuid;
  v_gl_fee      uuid;
  v_gl_intr     uuid;
  v_gl_adj      uuid;
  v_gl_entry    uuid;
  v_lines       jsonb;
  v_ref_prefix  text;
  v_amt_abs     numeric := ABS(_amount);
  v_hold_dir    text;
BEGIN
  IF _amount IS NULL OR _amount = 0 THEN
    RAISE EXCEPTION 'Amount must be non-zero';
  END IF;
  IF _txn_type NOT IN
     ('deposit','withdrawal','fee','interest','adjustment','transfer_in','transfer_out') THEN
    RAISE EXCEPTION 'Unsupported txn_type %', _txn_type;
  END IF;

  PERFORM public.assert_savings_txn_permission(_txn_type);

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.savings_transaction
      WHERE account_id = _account_id AND idempotency_key = _idempotency_key LIMIT 1;
    IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;
  END IF;

  SELECT * INTO v_acct FROM public.savings_account
    WHERE id = _account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  v_company_id := v_acct.company_id;

  IF NOT public.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_acct.status = 'closed' THEN RAISE EXCEPTION 'Account is closed'; END IF;
  IF v_acct.status = 'fully_blocked' THEN RAISE EXCEPTION 'Account is fully blocked'; END IF;
  IF v_acct.status = 'frozen' THEN RAISE EXCEPTION 'Account is frozen'; END IF;

  IF _txn_type IN ('withdrawal','fee','transfer_out') THEN
    v_signed := -v_amt_abs;
  ELSIF _txn_type IN ('adjustment','interest') THEN
    v_signed := _amount;
  ELSE
    v_signed := v_amt_abs;
  END IF;

  IF v_signed < 0 THEN
    v_hold_dir := 'debit';
    IF v_acct.status = 'debit_blocked' THEN
      RAISE EXCEPTION 'Debits are blocked on this account';
    END IF;
  ELSE
    v_hold_dir := 'credit';
    IF v_acct.status = 'credit_blocked' AND _txn_type <> 'interest' THEN
      RAISE EXCEPTION 'Credits are blocked on this account';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.savings_hold
    WHERE account_id = _account_id
      AND active
      AND approval_state = 'approved'
      AND (expires_at IS NULL OR expires_at > now())
      AND (
        hold_type = 'full_block'
        OR (v_hold_dir = 'debit'  AND hold_type = 'debit_block')
        OR (v_hold_dir = 'credit' AND hold_type = 'credit_block')
      )
  ) THEN
    RAISE EXCEPTION 'Active hold prevents % on this account', v_hold_dir;
  END IF;

  SELECT * INTO v_product FROM public.savings_product WHERE id = v_acct.product_id;
  v_holds := public.savings_active_hold_amount(_account_id);
  v_new_bal := COALESCE(v_acct.balance,0) + v_signed;
  v_new_avail := v_new_bal - v_holds;

  IF v_signed < 0 THEN
    IF v_new_bal < COALESCE(v_product.min_balance,0) THEN
      RAISE EXCEPTION 'Balance would fall below product minimum (%)', v_product.min_balance;
    END IF;
    IF v_new_avail < 0 THEN
      RAISE EXCEPTION 'Insufficient available balance (holds: %)', v_holds;
    END IF;
  END IF;

  SELECT id INTO v_staff_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.savings_transaction (
    company_id, account_id, txn_type, channel, amount, running_balance,
    reference, external_ref, narration, performed_by, idempotency_key,
    payment_method, payment_details
  ) VALUES (
    v_company_id, _account_id, _txn_type::savings_txn_type,
    COALESCE(_channel,'branch')::savings_channel,
    v_signed, v_new_bal, _reference, _external_ref, _narration, v_staff_id,
    _idempotency_key, _payment_method, _payment_details
  ) RETURNING id INTO v_txn_id;

  UPDATE public.savings_account
     SET balance = v_new_bal,
         available_balance = v_new_avail,
         last_txn_at = now()
   WHERE id = _account_id;

  v_gl_cash := v_product.cash_account_id;
  v_gl_liab := v_product.deposit_liability_account_id;
  v_gl_fee  := v_product.fee_income_account_id;
  v_gl_intr := v_product.interest_expense_account_id;
  v_gl_adj  := v_product.adjustment_account_id;

  IF _txn_type = 'deposit' THEN
    IF v_gl_cash IS NULL OR v_gl_liab IS NULL THEN
      RAISE EXCEPTION 'Missing GL mapping (cash / deposit liability) for product';
    END IF;
    v_ref_prefix := 'SAV-DEP';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_gl_cash, 'debit', v_amt_abs, 'credit', 0),
      jsonb_build_object('account_id', v_gl_liab, 'debit', 0, 'credit', v_amt_abs)
    );
  ELSIF _txn_type = 'withdrawal' THEN
    IF v_gl_cash IS NULL OR v_gl_liab IS NULL THEN
      RAISE EXCEPTION 'Missing GL mapping (cash / deposit liability) for product';
    END IF;
    v_ref_prefix := 'SAV-WD';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_gl_liab, 'debit', v_amt_abs, 'credit', 0),
      jsonb_build_object('account_id', v_gl_cash, 'debit', 0, 'credit', v_amt_abs)
    );
  ELSIF _txn_type IN ('transfer_in','transfer_out') THEN
    v_lines := NULL;
  ELSIF _txn_type = 'fee' THEN
    IF v_gl_liab IS NULL OR v_gl_fee IS NULL THEN
      RAISE EXCEPTION 'Missing GL mapping (liability / fee income)';
    END IF;
    v_ref_prefix := 'SAV-FEE';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_gl_liab, 'debit', v_amt_abs, 'credit', 0),
      jsonb_build_object('account_id', v_gl_fee,  'debit', 0, 'credit', v_amt_abs)
    );
  ELSIF _txn_type = 'interest' THEN
    IF v_gl_liab IS NULL OR v_gl_intr IS NULL THEN
      RAISE EXCEPTION 'Missing GL mapping (liability / interest expense)';
    END IF;
    v_ref_prefix := 'SAV-INT';
    IF v_signed >= 0 THEN
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_gl_intr, 'debit', v_amt_abs, 'credit', 0),
        jsonb_build_object('account_id', v_gl_liab, 'debit', 0, 'credit', v_amt_abs)
      );
    ELSE
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_gl_liab, 'debit', v_amt_abs, 'credit', 0),
        jsonb_build_object('account_id', v_gl_intr, 'debit', 0, 'credit', v_amt_abs)
      );
    END IF;
  ELSIF _txn_type = 'adjustment' THEN
    IF v_gl_liab IS NULL OR v_gl_adj IS NULL THEN
      RAISE EXCEPTION 'Missing GL mapping (liability / adjustment) for product';
    END IF;
    v_ref_prefix := 'SAV-ADJ';
    IF v_signed >= 0 THEN
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_gl_adj,  'debit', v_amt_abs, 'credit', 0),
        jsonb_build_object('account_id', v_gl_liab, 'debit', 0, 'credit', v_amt_abs)
      );
    ELSE
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_gl_liab, 'debit', v_amt_abs, 'credit', 0),
        jsonb_build_object('account_id', v_gl_adj,  'debit', 0, 'credit', v_amt_abs)
      );
    END IF;
  END IF;

  IF v_lines IS NOT NULL THEN
    v_gl_entry := public.post_entry(
      _entry_date := CURRENT_DATE,
      _reference := v_ref_prefix || '-' || v_acct.account_no,
      _description := COALESCE(_narration, _txn_type || ' · ' || v_acct.account_no),
      _lines := v_lines,
      _branch_id := v_acct.branch_id,
      _source_module := 'savings',
      _source_ref := v_txn_id,
      _idempotency_key := 'savings:txn:' || COALESCE(_idempotency_key, v_txn_id::text)
    );
    UPDATE public.savings_transaction SET gl_entry_id = v_gl_entry WHERE id = v_txn_id;
  END IF;

  RETURN v_txn_id;
END $$;

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
  v_from    RECORD;
  v_to      RECORD;
  v_key     text := COALESCE(_idempotency_key, gen_random_uuid()::text);
  v_out_id  uuid;
  v_in_id   uuid;
  v_gl_id   uuid;
  v_ref     text := COALESCE(_reference, 'XFER-' || substr(v_key, 1, 8));
  v_from_liab uuid;
  v_to_liab   uuid;
BEGIN
  PERFORM public.assert_savings_txn_permission('transfer');

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF _from_account_id = _to_account_id THEN
    RAISE EXCEPTION 'From and to accounts must differ';
  END IF;

  SELECT * INTO v_from FROM public.savings_account WHERE id = _from_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source account not found'; END IF;
  SELECT * INTO v_to   FROM public.savings_account WHERE id = _to_account_id   FOR UPDATE;
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
    _narration  := COALESCE(_narration, 'Transfer to ' || v_to.account_no),
    _idempotency_key := 'xfer-out:' || v_key
  );
  v_in_id := public.record_savings_txn(
    _account_id := _to_account_id,
    _txn_type   := 'transfer_in',
    _amount     := _amount,
    _channel    := _channel,
    _reference  := v_ref,
    _narration  := COALESCE(_narration, 'Transfer from ' || v_from.account_no),
    _idempotency_key := 'xfer-in:'  || v_key
  );

  UPDATE public.savings_transaction
     SET external_ref = COALESCE(external_ref, v_key)
   WHERE id IN (v_out_id, v_in_id);

  SELECT deposit_liability_account_id INTO v_from_liab
    FROM public.savings_product WHERE id = v_from.product_id;
  SELECT deposit_liability_account_id INTO v_to_liab
    FROM public.savings_product WHERE id = v_to.product_id;
  IF v_from_liab IS NULL OR v_to_liab IS NULL THEN
    RAISE EXCEPTION 'Missing deposit liability GL mapping for one of the products';
  END IF;

  v_gl_id := public.post_entry(
    _entry_date := CURRENT_DATE,
    _reference := 'SAV-XFER-' || substr(v_key,1,8),
    _description := COALESCE(_narration,
      'Transfer ' || v_from.account_no || ' -> ' || v_to.account_no),
    _lines := jsonb_build_array(
      jsonb_build_object('account_id', v_from_liab, 'debit', _amount, 'credit', 0),
      jsonb_build_object('account_id', v_to_liab,   'debit', 0,       'credit', _amount)
    ),
    _branch_id := v_from.branch_id,
    _source_module := 'savings',
    _source_ref := v_out_id,
    _idempotency_key := 'savings:xfer:' || v_key
  );

  UPDATE public.savings_transaction SET gl_entry_id = v_gl_id
    WHERE id IN (v_out_id, v_in_id);

  RETURN jsonb_build_object(
    'ok', true,
    'out_txn_id', v_out_id,
    'in_txn_id',  v_in_id,
    'gl_entry_id', v_gl_id,
    'reference',  v_ref
  );
END $$;

CREATE OR REPLACE FUNCTION public.reverse_savings_txn(
  _txn_id uuid,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_orig       RECORD;
  v_acct       RECORD;
  v_staff_id   uuid;
  v_new_bal    numeric;
  v_new_avail  numeric;
  v_holds      numeric;
  v_new_txn    uuid;
  v_new_gl     uuid;
  v_lines      jsonb;
  v_signed     numeric;
BEGIN
  PERFORM public.assert_savings_txn_permission('reversal');

  SELECT * INTO v_orig FROM public.savings_transaction WHERE id = _txn_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT public.is_company_member(v_orig.company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_orig.reversed_by_txn_id IS NOT NULL THEN RAISE EXCEPTION 'Already reversed'; END IF;
  IF v_orig.txn_type::text = 'reversal' THEN RAISE EXCEPTION 'Cannot reverse a reversal'; END IF;

  SELECT * INTO v_acct FROM public.savings_account
    WHERE id = v_orig.account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;

  v_signed := -v_orig.amount;
  v_holds  := public.savings_active_hold_amount(v_orig.account_id);
  v_new_bal   := COALESCE(v_acct.balance,0) + v_signed;
  v_new_avail := v_new_bal - v_holds;

  IF v_new_bal < 0 THEN
    RAISE EXCEPTION 'Reversal would drive account negative (%.2f)', v_new_bal;
  END IF;

  SELECT id INTO v_staff_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.savings_transaction (
    company_id, account_id, txn_type, channel, amount, running_balance,
    reference, external_ref, narration, performed_by, idempotency_key,
    payment_method, payment_details, reverses_txn_id
  ) VALUES (
    v_orig.company_id, v_orig.account_id, 'reversal'::savings_txn_type,
    v_orig.channel, v_signed, v_new_bal,
    'REV ' || COALESCE(v_orig.reference, v_orig.id::text),
    v_orig.external_ref,
    'Reversal: ' || _reason,
    v_staff_id,
    'reverse:' || v_orig.id::text,
    v_orig.payment_method, v_orig.payment_details,
    v_orig.id
  ) RETURNING id INTO v_new_txn;

  UPDATE public.savings_account
     SET balance = v_new_bal,
         available_balance = v_new_avail,
         last_txn_at = now()
   WHERE id = v_orig.account_id;

  UPDATE public.savings_transaction
     SET reversed_by_txn_id = v_new_txn
   WHERE id = v_orig.id;

  IF v_orig.gl_entry_id IS NOT NULL THEN
    SELECT jsonb_agg(
             jsonb_build_object(
               'account_id', p.account_id,
               'debit',  p.credit,
               'credit', p.debit
             ) ORDER BY p.id)
      INTO v_lines
      FROM public.posting p
     WHERE p.entry_id = v_orig.gl_entry_id;

    IF v_lines IS NOT NULL AND jsonb_array_length(v_lines) > 0 THEN
      v_new_gl := public.post_entry(
        _entry_date := CURRENT_DATE,
        _reference  := 'REV-' || COALESCE(v_orig.reference, v_orig.id::text),
        _description := 'Reversal of ' || v_orig.id::text || ' — ' || _reason,
        _lines := v_lines,
        _branch_id := v_acct.branch_id,
        _source_module := 'savings',
        _source_ref := v_new_txn,
        _idempotency_key := 'savings:rev:' || v_orig.id::text
      );
      UPDATE public.savings_transaction SET gl_entry_id = v_new_gl WHERE id = v_new_txn;
    END IF;
  END IF;

  RETURN v_new_txn;
END $$;

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

  IF current_setting('role', true) <> 'service_role' THEN
    IF NOT public.is_company_member(v_so.company_id) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    IF NOT public.has_permission(auth.uid(),
                                 'savings.standing_order.execute',
                                 v_so.company_id) THEN
      RAISE EXCEPTION 'Missing permission savings.standing_order.execute';
    END IF;
  END IF;

  IF v_so.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_active', 'status', v_so.status);
  END IF;
  IF v_so.next_run_date > _business_date THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_due',
                              'next_run_date', v_so.next_run_date);
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
           WHEN v_so.max_runs IS NOT NULL
                AND (runs_completed + 1) >= v_so.max_runs
             THEN 'completed'::public.standing_order_status
           WHEN v_so.end_date IS NOT NULL AND v_next > v_so.end_date
             THEN 'completed'::public.standing_order_status
           ELSE status
         END
   WHERE id = _id;

  RETURN jsonb_build_object('ok', true, 'result', v_result, 'next_run_date', v_next);
END $$;

REVOKE EXECUTE ON FUNCTION public.run_savings_standing_orders(uuid,date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_savings_standing_orders(uuid,date) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.run_savings_standing_orders(uuid,date) TO service_role;
