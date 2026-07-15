-- Enable RLS on every existing partition of the EOD snapshot tables.
-- Postgres does not propagate the RLS flag from a partitioned parent to its
-- children, so the linter flags each partition individually. We also patch
-- ensure_eod_partitions so future partitions are created with RLS on.

DO $$
DECLARE _child TEXT;
BEGIN
  FOR _child IN
    SELECT c.relname
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_class p ON p.oid = i.inhparent
     WHERE p.relname IN ('savings_eod_balance','fd_eod_balance','loan_eod_balance','gl_eod_balance')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _child);
  END LOOP;
END $$;

-- Ensure future partitions are created with RLS enabled too.
CREATE OR REPLACE FUNCTION public.ensure_eod_partitions(_month DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _start  DATE := date_trunc('month', _month)::date;
  _end    DATE := (date_trunc('month', _month) + interval '1 month')::date;
  _suffix TEXT := to_char(_start, 'YYYYMM');
  _tables TEXT[] := ARRAY['savings_eod_balance','fd_eod_balance','loan_eod_balance','gl_eod_balance'];
  _tbl    TEXT;
  _child  TEXT;
BEGIN
  FOREACH _tbl IN ARRAY _tables LOOP
    _child := _tbl || '_' || _suffix;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
      _child, _tbl, _start, _end
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _child);
  END LOOP;
END $$;
