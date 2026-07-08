
ALTER VIEW public.v_loan_outstanding SET (security_invoker = true);
ALTER VIEW public.v_par_aging SET (security_invoker = true);
ALTER FUNCTION public.assert_entry_balanced() SET search_path = public;
