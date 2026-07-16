
ALTER TABLE public.loan_product ADD COLUMN IF NOT EXISTS code text;

WITH r AS (
  SELECT id, lpad(ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at, id)::text, 3, '0') AS c
    FROM public.branch
)
UPDATE public.branch b SET code = r.c FROM r WHERE b.id = r.id;

WITH r AS (
  SELECT id, lpad(ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at, id)::text, 3, '0') AS c
    FROM public.savings_product
)
UPDATE public.savings_product p SET code = r.c FROM r WHERE p.id = r.id;

WITH r AS (
  SELECT id, lpad(ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at, id)::text, 3, '0') AS c
    FROM public.fd_product
)
UPDATE public.fd_product p SET code = r.c FROM r WHERE p.id = r.id;

WITH r AS (
  SELECT id, lpad(ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY id)::text, 3, '0') AS c
    FROM public.loan_product
)
UPDATE public.loan_product p SET code = r.c FROM r WHERE p.id = r.id;

ALTER TABLE public.loan_product ALTER COLUMN code SET NOT NULL;
ALTER TABLE public.loan_product
  ADD CONSTRAINT loan_product_company_id_code_key UNIQUE (company_id, code);

ALTER TABLE public.branch
  ADD CONSTRAINT branch_code_format_chk CHECK (code ~ '^[0-9]{3}$');
ALTER TABLE public.savings_product
  ADD CONSTRAINT savings_product_code_format_chk CHECK (code ~ '^[0-9]{3}$');
ALTER TABLE public.fd_product
  ADD CONSTRAINT fd_product_code_format_chk CHECK (code ~ '^[0-9]{3}$');
ALTER TABLE public.loan_product
  ADD CONSTRAINT loan_product_code_format_chk CHECK (code ~ '^[0-9]{3}$');

ALTER TABLE public.loan ADD COLUMN IF NOT EXISTS contract_no text;

ALTER TABLE public.fixed_deposit DROP CONSTRAINT IF EXISTS fixed_deposit_certificate_no_key;
ALTER TABLE public.fixed_deposit
  ADD CONSTRAINT fixed_deposit_company_certificate_no_key UNIQUE (company_id, certificate_no);

CREATE TABLE IF NOT EXISTS public.contract_no_seq (
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  branch_id  uuid NOT NULL REFERENCES public.branch(id)  ON DELETE CASCADE,
  segment    smallint NOT NULL CHECK (segment IN (1,2,3)),
  product_id uuid NOT NULL,
  last_no    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, branch_id, segment, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_no_seq TO authenticated;
GRANT ALL ON public.contract_no_seq TO service_role;
ALTER TABLE public.contract_no_seq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company members manage contract_no_seq" ON public.contract_no_seq
  FOR ALL TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

WITH r AS (
  SELECT sa.id, b.code AS bcode, p.code AS pcode, sa.branch_id, sa.product_id, sa.company_id,
    ROW_NUMBER() OVER (PARTITION BY sa.branch_id, sa.product_id ORDER BY sa.created_at, sa.id) AS rn
  FROM public.savings_account sa
  JOIN public.branch b ON b.id = sa.branch_id
  JOIN public.savings_product p ON p.id = sa.product_id
)
UPDATE public.savings_account sa
   SET account_no = r.bcode || '-1-' || r.pcode || '-' || lpad(r.rn::text, 5, '0')
  FROM r WHERE sa.id = r.id;

INSERT INTO public.contract_no_seq (company_id, branch_id, segment, product_id, last_no)
SELECT company_id, branch_id, 1::smallint, product_id, COUNT(*)::int
  FROM public.savings_account
 GROUP BY company_id, branch_id, product_id
ON CONFLICT (company_id, branch_id, segment, product_id)
  DO UPDATE SET last_no = GREATEST(public.contract_no_seq.last_no, EXCLUDED.last_no);

WITH r AS (
  SELECT fd.id, b.code AS bcode, p.code AS pcode, fd.branch_id, fd.product_id, fd.company_id,
    ROW_NUMBER() OVER (PARTITION BY fd.branch_id, fd.product_id ORDER BY fd.created_at, fd.id) AS rn
  FROM public.fixed_deposit fd
  JOIN public.branch b ON b.id = fd.branch_id
  JOIN public.fd_product p ON p.id = fd.product_id
)
UPDATE public.fixed_deposit fd
   SET certificate_no = r.bcode || '-2-' || r.pcode || '-' || lpad(r.rn::text, 5, '0')
  FROM r WHERE fd.id = r.id;

INSERT INTO public.contract_no_seq (company_id, branch_id, segment, product_id, last_no)
SELECT company_id, branch_id, 2::smallint, product_id, COUNT(*)::int
  FROM public.fixed_deposit
 GROUP BY company_id, branch_id, product_id
ON CONFLICT (company_id, branch_id, segment, product_id)
  DO UPDATE SET last_no = GREATEST(public.contract_no_seq.last_no, EXCLUDED.last_no);

WITH r AS (
  SELECT ln.id, b.code AS bcode, p.code AS pcode, ln.branch_id, ln.product_id, b.company_id,
    ROW_NUMBER() OVER (PARTITION BY ln.branch_id, ln.product_id ORDER BY ln.created_at, ln.id) AS rn
  FROM public.loan ln
  JOIN public.branch b ON b.id = ln.branch_id
  JOIN public.loan_product p ON p.id = ln.product_id
)
UPDATE public.loan ln
   SET contract_no = r.bcode || '-3-' || r.pcode || '-' || lpad(r.rn::text, 5, '0')
  FROM r WHERE ln.id = r.id;

INSERT INTO public.contract_no_seq (company_id, branch_id, segment, product_id, last_no)
SELECT b.company_id, ln.branch_id, 3::smallint, ln.product_id, COUNT(*)::int
  FROM public.loan ln
  JOIN public.branch b ON b.id = ln.branch_id
 GROUP BY b.company_id, ln.branch_id, ln.product_id
ON CONFLICT (company_id, branch_id, segment, product_id)
  DO UPDATE SET last_no = GREATEST(public.contract_no_seq.last_no, EXCLUDED.last_no);

CREATE UNIQUE INDEX IF NOT EXISTS loan_branch_contract_no_uidx
  ON public.loan (branch_id, contract_no) WHERE contract_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.next_contract_no(
  _company_id uuid,
  _branch_id  uuid,
  _product_id uuid,
  _segment    smallint
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _bcode text;
  _pcode text;
  _next  integer;
BEGIN
  IF _segment NOT IN (1,2,3) THEN
    RAISE EXCEPTION 'segment must be 1 (savings), 2 (fd) or 3 (loan)';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of company %', _company_id;
  END IF;

  SELECT code INTO _bcode FROM public.branch WHERE id = _branch_id AND company_id = _company_id;
  IF _bcode IS NULL THEN RAISE EXCEPTION 'Branch % not found in company %', _branch_id, _company_id; END IF;

  IF _segment = 1 THEN
    SELECT code INTO _pcode FROM public.savings_product WHERE id = _product_id AND company_id = _company_id;
  ELSIF _segment = 2 THEN
    SELECT code INTO _pcode FROM public.fd_product WHERE id = _product_id AND company_id = _company_id;
  ELSE
    SELECT code INTO _pcode FROM public.loan_product WHERE id = _product_id AND company_id = _company_id;
  END IF;
  IF _pcode IS NULL THEN RAISE EXCEPTION 'Product % not found in company %', _product_id, _company_id; END IF;

  INSERT INTO public.contract_no_seq (company_id, branch_id, segment, product_id, last_no)
       VALUES (_company_id, _branch_id, _segment, _product_id, 1)
  ON CONFLICT (company_id, branch_id, segment, product_id)
    DO UPDATE SET last_no = public.contract_no_seq.last_no + 1
  RETURNING last_no INTO _next;

  RETURN _bcode || '-' || _segment::text || '-' || _pcode || '-' || lpad(_next::text, 5, '0');
END $$;

GRANT EXECUTE ON FUNCTION public.next_contract_no(uuid,uuid,uuid,smallint) TO authenticated;
