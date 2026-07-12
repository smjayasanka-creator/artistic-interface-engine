
CREATE OR REPLACE FUNCTION public.hardening_autocheck()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  v_bool boolean;
  v_count int;
  v_total int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: platform admin only';
  END IF;

  -- double-entry
  SELECT EXISTS(
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname='posting' AND t.tgname ILIKE '%balanc%' AND NOT t.tgisinternal
  ) INTO v_bool;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','double-entry',
    'status', CASE WHEN v_bool THEN 'done' ELSE 'missing' END,
    'evidence', CASE WHEN v_bool THEN 'Balance-check trigger present on posting' ELSE 'No balance-check trigger on posting' END));

  -- money-type
  SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posting'
      AND column_name IN ('debit','credit') AND data_type='numeric'
  INTO v_count;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','money-type',
    'status', CASE WHEN v_count=2 THEN 'done' ELSE 'missing' END,
    'evidence', 'posting.debit/credit numeric columns: '||v_count||'/2'));

  -- postings-immutable
  SELECT EXISTS(
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname='posting'
      AND (t.tgname ILIKE '%immutab%' OR t.tgname ILIKE '%append%' OR t.tgname ILIKE '%no_update%' OR t.tgname ILIKE '%no_delete%')
      AND NOT t.tgisinternal
  ) INTO v_bool;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','postings-immutable',
    'status', CASE WHEN v_bool THEN 'done' ELSE 'missing' END,
    'evidence', CASE WHEN v_bool THEN 'Immutability trigger detected on posting' ELSE 'No append-only enforcement trigger on posting' END));

  -- idempotency
  SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema='public' AND column_name='idempotency_key'
      AND table_name IN ('repayment','loan','fixed_deposit','fd_transaction')
  INTO v_count;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','idempotency',
    'status', CASE WHEN v_count>=3 THEN 'done' WHEN v_count>0 THEN 'partial' ELSE 'missing' END,
    'evidence', 'idempotency_key present on '||v_count||'/4 money tables'));

  -- audit-log
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ('audit_log','audit_trail')) INTO v_bool;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','audit-log',
    'status', CASE WHEN v_bool THEN 'partial' ELSE 'missing' END,
    'evidence', CASE WHEN v_bool THEN 'audit_log table exists (verify append-only + triggers)' ELSE 'No audit_log table found' END));

  -- rls coverage
  SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' INTO v_total;
  SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity=true INTO v_count;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','rls',
    'status', CASE WHEN v_total>0 AND v_count=v_total THEN 'done' WHEN v_count>0 THEN 'partial' ELSE 'missing' END,
    'evidence', 'RLS enabled on '||v_count||'/'||v_total||' public tables'));

  -- partitioning
  SELECT EXISTS(SELECT 1 FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid=pt.partrelid
    WHERE c.relname IN ('posting','fd_accrual','journal_entry')) INTO v_bool;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','partitioning',
    'status', CASE WHEN v_bool THEN 'done' ELSE 'missing' END,
    'evidence', CASE WHEN v_bool THEN 'Partitioning detected on ledger tables' ELSE 'No partitioning on posting/fd_accrual/journal_entry' END));

  -- indexes on hot paths
  SELECT COUNT(*) FROM pg_indexes
    WHERE schemaname='public'
      AND (indexdef ILIKE '%(loan_id%' OR indexdef ILIKE '%client_id%'
        OR indexdef ILIKE '%value_date%' OR indexdef ILIKE '%entry_id%'
        OR indexdef ILIKE '%branch_id%')
  INTO v_count;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','indexes',
    'status', CASE WHEN v_count>=5 THEN 'done' WHEN v_count>0 THEN 'partial' ELSE 'missing' END,
    'evidence', 'Hot-path indexes detected: '||v_count));

  -- fx-policy
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name ILIKE '%fx%rate%') INTO v_bool;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','fx-policy',
    'status', CASE WHEN v_bool THEN 'partial' ELSE 'missing' END,
    'evidence', CASE WHEN v_bool THEN 'FX rate table exists' ELSE 'No FX rate table' END));

  -- kyc-aml
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND (table_name ILIKE '%kyc%' OR table_name ILIKE '%sanction%' OR table_name ILIKE '%aml%')) INTO v_bool;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','kyc-aml',
    'status', CASE WHEN v_bool THEN 'partial' ELSE 'missing' END,
    'evidence', CASE WHEN v_bool THEN 'KYC/AML/sanctions table detected' ELSE 'No KYC/AML/sanctions tables' END));

  -- encrypted-pii (pgcrypto)
  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pgcrypto') INTO v_bool;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','encrypted-pii',
    'status', CASE WHEN v_bool THEN 'partial' ELSE 'missing' END,
    'evidence', CASE WHEN v_bool THEN 'pgcrypto extension available (verify columns are encrypted)' ELSE 'pgcrypto extension not enabled' END));

  -- maker-checker
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='workflow_action') INTO v_bool;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','maker-checker',
    'status', CASE WHEN v_bool THEN 'partial' ELSE 'missing' END,
    'evidence', CASE WHEN v_bool THEN 'Workflow tables present (verify enforcement on high-risk actions)' ELSE 'No workflow tables' END));

  -- sod
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_roles') INTO v_bool;
  result := result || jsonb_build_array(jsonb_build_object(
    'item_id','sod',
    'status', CASE WHEN v_bool THEN 'partial' ELSE 'missing' END,
    'evidence', CASE WHEN v_bool THEN 'user_roles role matrix in place (verify assignments)' ELSE 'No user_roles table' END));

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.hardening_autocheck() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hardening_autocheck() TO authenticated;
