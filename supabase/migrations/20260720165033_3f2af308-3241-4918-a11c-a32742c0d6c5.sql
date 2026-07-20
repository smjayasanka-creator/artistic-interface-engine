
ALTER TABLE public.client
  ADD COLUMN IF NOT EXISTS residency text NOT NULL DEFAULT 'resident'
    CHECK (residency IN ('resident','nonresident')),
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'individual'
    CHECK (entity_type IN ('individual','entity'));

CREATE OR REPLACE FUNCTION public.resolve_savings_wht_rule(
  _company_id uuid, _account_id uuid, _as_of date
) RETURNS TABLE(rule_id uuid, rate_pct numeric, threshold numeric, wht_gl_account_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH acct AS (
    SELECT sa.product_id, sa.id AS account_id
      FROM public.savings_account sa
     WHERE sa.id = _account_id
  ),
  owner AS (
    SELECT c.residency, c.entity_type
      FROM public.savings_account_holder h
      JOIN public.client c ON c.id = h.client_id
     WHERE h.account_id = _account_id
     ORDER BY CASE h.role WHEN 'primary' THEN 0 ELSE 1 END,
              h.created_at
     LIMIT 1
  ),
  ctx AS (
    SELECT COALESCE((SELECT residency   FROM owner), 'resident')   AS residency,
           COALESCE((SELECT entity_type FROM owner), 'individual') AS entity_type,
           (SELECT product_id FROM acct)                           AS product_id
  ),
  cand AS (
    SELECT r.*,
      ( (CASE WHEN r.product_id IS NOT NULL THEN 4 ELSE 0 END)
      + (CASE WHEN r.entity_type <> 'any' THEN 2 ELSE 0 END)
      + (CASE WHEN r.residency   <> 'any' THEN 1 ELSE 0 END) ) AS score
      FROM public.savings_wht_rule r, ctx
     WHERE r.company_id = _company_id
       AND r.active
       AND r.effective_from <= _as_of
       AND (r.effective_to IS NULL OR r.effective_to >= _as_of)
       AND (r.product_id  IS NULL OR r.product_id  = ctx.product_id)
       AND (r.entity_type = 'any' OR r.entity_type = ctx.entity_type)
       AND (r.residency   = 'any' OR r.residency   = ctx.residency)
  )
  SELECT id, rate_pct, threshold, wht_gl_account_id
    FROM cand
   ORDER BY score DESC, effective_from DESC
   LIMIT 1;
$$;
