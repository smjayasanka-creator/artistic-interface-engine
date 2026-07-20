CREATE OR REPLACE FUNCTION public.next_contract_no(_company_id uuid, _branch_id uuid, _product_id uuid, _segment integer)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.next_contract_no(_company_id, _branch_id, _product_id, _segment::smallint);
$$;
GRANT EXECUTE ON FUNCTION public.next_contract_no(uuid,uuid,uuid,integer) TO authenticated, service_role;