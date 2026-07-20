
-- Company-scoped permission check
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_custom_role ucr
    JOIN public.staff s          ON s.id = ucr.staff_id
    JOIN public.custom_role r    ON r.id = ucr.role_id AND r.active = true
    JOIN public.custom_role_permission crp ON crp.role_id = r.id
    JOIN public.branch b         ON b.id = s.branch_id
    WHERE s.user_id = _user_id
      AND crp.permission_code = _permission
      AND r.company_id = _company_id
      AND b.company_id = _company_id
  );
$function$;

-- Replace loan_application_approval policy to use company-scoped permission check
DROP POLICY IF EXISTS "loan_application_approval privileged insert" ON public.loan_application_approval;
CREATE POLICY "loan_application_approval privileged insert"
ON public.loan_application_approval
FOR INSERT
WITH CHECK (
  _app_row_company_ok(application_id)
  AND (
    has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM loan_application a
      WHERE a.id = loan_application_approval.application_id
        AND (
          has_permission(auth.uid(), 'loans.approve'::text, a.company_id)
          OR is_company_admin(a.company_id)
        )
    )
  )
);

-- Replace loan_application_status_history policy to use company-scoped permission check
DROP POLICY IF EXISTS "loan_application_status_history privileged insert" ON public.loan_application_status_history;
CREATE POLICY "loan_application_status_history privileged insert"
ON public.loan_application_status_history
FOR INSERT
WITH CHECK (
  _app_row_company_ok(application_id)
  AND (
    has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM loan_application a
      WHERE a.id = loan_application_status_history.application_id
        AND (
          has_permission(auth.uid(), 'loans.approve'::text, a.company_id)
          OR is_company_admin(a.company_id)
        )
    )
  )
);
