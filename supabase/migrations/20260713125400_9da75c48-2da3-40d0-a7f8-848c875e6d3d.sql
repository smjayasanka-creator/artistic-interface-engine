CREATE INDEX IF NOT EXISTS posting_account_idx ON public.posting(account_id);
CREATE INDEX IF NOT EXISTS posting_entry_idx ON public.posting(entry_id);
CREATE INDEX IF NOT EXISTS journal_entry_branch_date_idx ON public.journal_entry(branch_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS journal_entry_loan_idx ON public.journal_entry(loan_id) WHERE loan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS journal_entry_source_idx ON public.journal_entry(source_module, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS repayment_loan_idx ON public.repayment(loan_id);
CREATE INDEX IF NOT EXISTS loan_installment_loan_idx ON public.loan_installment(loan_id);
CREATE INDEX IF NOT EXISTS fd_transaction_deposit_idx ON public.fd_transaction(deposit_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS fd_accrual_deposit_idx ON public.fd_accrual(deposit_id, accrual_date DESC);
CREATE INDEX IF NOT EXISTS savings_transaction_account_idx ON public.savings_transaction(account_id, txn_date DESC);

CREATE OR REPLACE FUNCTION public.list_audit_log(
  _company_id uuid,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0,
  _entity_type text DEFAULT NULL,
  _action_prefix text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, created_at timestamptz, actor_user_id uuid, action text,
  entity_type text, entity_id uuid, metadata jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.created_at, a.actor_user_id, a.action,
         a.entity_type, a.entity_id, a.metadata
    FROM public.audit_log a
   WHERE a.company_id = _company_id
     AND (public.is_company_member(_company_id) OR public.has_role(auth.uid(), 'platform_admin'::public.app_role))
     AND (_entity_type IS NULL OR a.entity_type = _entity_type)
     AND (_action_prefix IS NULL OR a.action LIKE _action_prefix || '%')
   ORDER BY a.created_at DESC
   LIMIT LEAST(_limit, 500) OFFSET _offset;
$$;

GRANT EXECUTE ON FUNCTION public.list_audit_log(uuid, int, int, text, text) TO authenticated;