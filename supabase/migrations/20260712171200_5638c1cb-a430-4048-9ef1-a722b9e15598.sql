
CREATE OR REPLACE FUNCTION public.hardening_autocheck()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  _sql text;
  _rows jsonb;
  _cnt int;
  _total int;
  _match_cnt int;
  _status text;
  _evidence text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: platform admin only';
  END IF;

  -- double-entry
  _sql := $Q$SELECT t.tgname AS trigger_name, c.relname AS table_name
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE c.relname='posting' AND t.tgname ILIKE '%balanc%' AND NOT t.tgisinternal$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s LIMIT 20) t', _sql) INTO _rows;
  _cnt := jsonb_array_length(_rows);
  _status := CASE WHEN _cnt>0 THEN 'done' ELSE 'missing' END;
  _evidence := CASE WHEN _cnt>0 THEN 'Balance-check trigger present on posting ('||_cnt||')' ELSE 'No balance-check trigger on posting' END;
  result := result || jsonb_build_array(jsonb_build_object('item_id','double-entry','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  -- money-type
  _sql := $Q$SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posting'
      AND column_name IN ('debit','credit')$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', _sql) INTO _rows;
  SELECT COUNT(*) INTO _match_cnt FROM jsonb_array_elements(_rows) x WHERE x->>'data_type'='numeric';
  _status := CASE WHEN _match_cnt=2 THEN 'done' ELSE 'missing' END;
  _evidence := 'posting.debit/credit numeric columns: '||_match_cnt||'/2';
  result := result || jsonb_build_array(jsonb_build_object('item_id','money-type','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  -- postings-immutable
  _sql := $Q$SELECT t.tgname AS trigger_name, c.relname AS table_name
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE c.relname='posting'
      AND (t.tgname ILIKE '%immutab%' OR t.tgname ILIKE '%append%'
        OR t.tgname ILIKE '%no_update%' OR t.tgname ILIKE '%no_delete%')
      AND NOT t.tgisinternal$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s LIMIT 20) t', _sql) INTO _rows;
  _cnt := jsonb_array_length(_rows);
  _status := CASE WHEN _cnt>0 THEN 'done' ELSE 'missing' END;
  _evidence := CASE WHEN _cnt>0 THEN 'Immutability trigger detected ('||_cnt||')' ELSE 'No append-only enforcement trigger on posting' END;
  result := result || jsonb_build_array(jsonb_build_object('item_id','postings-immutable','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  -- idempotency
  _sql := $Q$SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND column_name='idempotency_key'
      AND table_name IN ('repayment','loan','fixed_deposit','fd_transaction')$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', _sql) INTO _rows;
  _cnt := jsonb_array_length(_rows);
  _status := CASE WHEN _cnt>=3 THEN 'done' WHEN _cnt>0 THEN 'partial' ELSE 'missing' END;
  _evidence := 'idempotency_key present on '||_cnt||'/4 money tables';
  result := result || jsonb_build_array(jsonb_build_object('item_id','idempotency','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  -- audit-log
  _sql := $Q$SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ('audit_log','audit_trail')$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', _sql) INTO _rows;
  _cnt := jsonb_array_length(_rows);
  _status := CASE WHEN _cnt>0 THEN 'partial' ELSE 'missing' END;
  _evidence := CASE WHEN _cnt>0 THEN 'audit_log table exists (verify append-only + triggers)' ELSE 'No audit_log table found' END;
  result := result || jsonb_build_array(jsonb_build_object('item_id','audit-log','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  -- rls coverage
  _sql := $Q$SELECT schemaname, tablename, rowsecurity
    FROM pg_tables WHERE schemaname='public' ORDER BY rowsecurity, tablename$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', _sql) INTO _rows;
  SELECT COUNT(*) INTO _total FROM jsonb_array_elements(_rows);
  SELECT COUNT(*) INTO _match_cnt FROM jsonb_array_elements(_rows) x WHERE (x->>'rowsecurity')::bool = true;
  _status := CASE WHEN _total>0 AND _match_cnt=_total THEN 'done' WHEN _match_cnt>0 THEN 'partial' ELSE 'missing' END;
  _evidence := 'RLS enabled on '||_match_cnt||'/'||_total||' public tables';
  result := result || jsonb_build_array(jsonb_build_object('item_id','rls','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  -- partitioning
  _sql := $Q$SELECT c.relname AS table_name
    FROM pg_partitioned_table pt JOIN pg_class c ON c.oid=pt.partrelid
    WHERE c.relname IN ('posting','fd_accrual','journal_entry')$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', _sql) INTO _rows;
  _cnt := jsonb_array_length(_rows);
  _status := CASE WHEN _cnt>0 THEN 'done' ELSE 'missing' END;
  _evidence := CASE WHEN _cnt>0 THEN 'Partitioning detected on '||_cnt||' ledger table(s)' ELSE 'No partitioning on posting/fd_accrual/journal_entry' END;
  result := result || jsonb_build_array(jsonb_build_object('item_id','partitioning','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  -- indexes
  _sql := $Q$SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname='public'
      AND (indexdef ILIKE '%(loan_id%' OR indexdef ILIKE '%client_id%'
        OR indexdef ILIKE '%value_date%' OR indexdef ILIKE '%entry_id%'
        OR indexdef ILIKE '%branch_id%')
    ORDER BY tablename, indexname$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s LIMIT 50) t', _sql) INTO _rows;
  _cnt := jsonb_array_length(_rows);
  _status := CASE WHEN _cnt>=5 THEN 'done' WHEN _cnt>0 THEN 'partial' ELSE 'missing' END;
  _evidence := 'Hot-path indexes detected: '||_cnt;
  result := result || jsonb_build_array(jsonb_build_object('item_id','indexes','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  -- fx-policy
  _sql := $Q$SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name ILIKE '%fx%rate%'$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', _sql) INTO _rows;
  _cnt := jsonb_array_length(_rows);
  _status := CASE WHEN _cnt>0 THEN 'partial' ELSE 'missing' END;
  _evidence := CASE WHEN _cnt>0 THEN 'FX rate table exists' ELSE 'No FX rate table' END;
  result := result || jsonb_build_array(jsonb_build_object('item_id','fx-policy','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  -- kyc-aml
  _sql := $Q$SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
      AND (table_name ILIKE '%kyc%' OR table_name ILIKE '%sanction%' OR table_name ILIKE '%aml%')$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', _sql) INTO _rows;
  _cnt := jsonb_array_length(_rows);
  _status := CASE WHEN _cnt>0 THEN 'partial' ELSE 'missing' END;
  _evidence := CASE WHEN _cnt>0 THEN 'KYC/AML/sanctions table detected' ELSE 'No KYC/AML/sanctions tables' END;
  result := result || jsonb_build_array(jsonb_build_object('item_id','kyc-aml','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  -- encrypted-pii
  _sql := $Q$SELECT extname, extversion FROM pg_extension WHERE extname='pgcrypto'$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', _sql) INTO _rows;
  _cnt := jsonb_array_length(_rows);
  _status := CASE WHEN _cnt>0 THEN 'partial' ELSE 'missing' END;
  _evidence := CASE WHEN _cnt>0 THEN 'pgcrypto available (verify columns are encrypted)' ELSE 'pgcrypto extension not enabled' END;
  result := result || jsonb_build_array(jsonb_build_object('item_id','encrypted-pii','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  -- maker-checker
  _sql := $Q$SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ('workflow_action','workflow_definition','workflow_instance','workflow_step')$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', _sql) INTO _rows;
  _cnt := jsonb_array_length(_rows);
  _status := CASE WHEN _cnt>0 THEN 'partial' ELSE 'missing' END;
  _evidence := CASE WHEN _cnt>0 THEN 'Workflow tables present ('||_cnt||') — verify enforcement on high-risk actions' ELSE 'No workflow tables' END;
  result := result || jsonb_build_array(jsonb_build_object('item_id','maker-checker','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  -- sod
  _sql := $Q$SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_roles'$Q$;
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', _sql) INTO _rows;
  _cnt := jsonb_array_length(_rows);
  _status := CASE WHEN _cnt>0 THEN 'partial' ELSE 'missing' END;
  _evidence := CASE WHEN _cnt>0 THEN 'user_roles role matrix in place (verify assignments)' ELSE 'No user_roles table' END;
  result := result || jsonb_build_array(jsonb_build_object('item_id','sod','status',_status,'evidence',_evidence,'check_sql',_sql,'matches',_rows));

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.hardening_autocheck() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hardening_autocheck() TO authenticated;
