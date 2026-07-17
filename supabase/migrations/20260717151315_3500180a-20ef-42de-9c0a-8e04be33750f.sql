
ALTER TABLE public.loan_product
  ADD COLUMN IF NOT EXISTS bad_debt_expense_account_id uuid NULL REFERENCES public.gl_account(id),
  ADD COLUMN IF NOT EXISTS loan_loss_provision_account_id uuid NULL REFERENCES public.gl_account(id),
  ADD COLUMN IF NOT EXISTS suspended_interest_account_id uuid NULL REFERENCES public.gl_account(id);

ALTER TABLE public.savings_product
  ADD COLUMN IF NOT EXISTS unclaimed_deposit_liability_account_id uuid NULL REFERENCES public.gl_account(id);

ALTER TABLE public.fd_product
  ADD COLUMN IF NOT EXISTS unclaimed_deposit_liability_account_id uuid NULL REFERENCES public.gl_account(id);

-- Per-company integrity: any mapped GL must belong to the product's company.
CREATE OR REPLACE FUNCTION public.assert_product_gl_same_company()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _ids uuid[]; _id uuid; _acc_company uuid;
BEGIN
  IF TG_TABLE_NAME = 'loan_product' THEN
    _ids := ARRAY[NEW.bad_debt_expense_account_id, NEW.loan_loss_provision_account_id, NEW.suspended_interest_account_id];
  ELSIF TG_TABLE_NAME = 'savings_product' THEN
    _ids := ARRAY[NEW.unclaimed_deposit_liability_account_id];
  ELSIF TG_TABLE_NAME = 'fd_product' THEN
    _ids := ARRAY[NEW.unclaimed_deposit_liability_account_id];
  END IF;
  FOREACH _id IN ARRAY _ids LOOP
    IF _id IS NOT NULL THEN
      SELECT company_id INTO _acc_company FROM public.gl_account WHERE id = _id;
      IF _acc_company IS NULL OR _acc_company <> NEW.company_id THEN
        RAISE EXCEPTION 'GL account % does not belong to product company %', _id, NEW.company_id;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_loan_product_gl_company ON public.loan_product;
CREATE TRIGGER trg_loan_product_gl_company BEFORE INSERT OR UPDATE ON public.loan_product
  FOR EACH ROW EXECUTE FUNCTION public.assert_product_gl_same_company();

DROP TRIGGER IF EXISTS trg_savings_product_gl_company ON public.savings_product;
CREATE TRIGGER trg_savings_product_gl_company BEFORE INSERT OR UPDATE ON public.savings_product
  FOR EACH ROW EXECUTE FUNCTION public.assert_product_gl_same_company();

DROP TRIGGER IF EXISTS trg_fd_product_gl_company ON public.fd_product;
CREATE TRIGGER trg_fd_product_gl_company BEFORE INSERT OR UPDATE ON public.fd_product
  FOR EACH ROW EXECUTE FUNCTION public.assert_product_gl_same_company();
