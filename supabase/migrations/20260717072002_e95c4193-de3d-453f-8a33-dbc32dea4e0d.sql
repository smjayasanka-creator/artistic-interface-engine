CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _company_id uuid;
  _branch_id  uuid;
  _full_name  text;
  _company_name text;
  _invite     public.company_invite%ROWTYPE;
  _role       public.staff_role;
  _existing_staff_id uuid;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1));

  SELECT * INTO _invite
    FROM public.company_invite
   WHERE lower(email) = lower(NEW.email)
     AND accepted_at IS NULL
     AND expires_at > now()
   ORDER BY created_at ASC LIMIT 1;

  IF FOUND THEN
    _company_id := _invite.company_id;
    _role := _invite.role;
    _branch_id := COALESCE(
      _invite.branch_id,
      (SELECT id FROM public.branch WHERE company_id = _company_id ORDER BY created_at ASC LIMIT 1)
    );

    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, CASE WHEN _role = 'admin' THEN 'admin'::public.app_role
                           WHEN _role = 'branch_manager' THEN 'branch_manager'::public.app_role
                           ELSE 'loan_officer'::public.app_role END)
      ON CONFLICT DO NOTHING;

    -- Link to a pre-created staff row by email if one exists; otherwise insert.
    SELECT id INTO _existing_staff_id
      FROM public.staff
     WHERE lower(email) = lower(NEW.email)
     LIMIT 1;

    IF _existing_staff_id IS NOT NULL THEN
      UPDATE public.staff
         SET user_id = NEW.id,
             full_name = COALESCE(NULLIF(_full_name,''), full_name),
             is_active = true
       WHERE id = _existing_staff_id;
    ELSE
      INSERT INTO public.staff (user_id, branch_id, full_name, role, email)
        VALUES (NEW.id, _branch_id, _full_name, _role, NEW.email);
    END IF;

    UPDATE public.company_invite
       SET accepted_at = now(), accepted_by = NEW.id
     WHERE id = _invite.id;

  ELSE
    _company_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
                              _full_name || '''s Workspace');

    INSERT INTO public.company (name, owner_user_id,
                                currency, country, fy_end_month, fy_end_day, timezone)
      VALUES (_company_name, NEW.id,
              COALESCE(NULLIF(NEW.raw_user_meta_data->>'currency',''), 'KES'),
              COALESCE(NULLIF(NEW.raw_user_meta_data->>'country',''), 'Kenya'),
              12, 31, 'Africa/Nairobi')
      RETURNING id INTO _company_id;

    INSERT INTO public.branch (company_id, code, name, currency)
      VALUES (_company_id, 'HQ-' || substr(_company_id::text, 1, 4), 'Head Office',
              COALESCE(NULLIF(NEW.raw_user_meta_data->>'currency',''), 'KES'))
      RETURNING id INTO _branch_id;

    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin'::public.app_role)
      ON CONFLICT DO NOTHING;

    INSERT INTO public.staff (user_id, branch_id, full_name, role, email)
      VALUES (NEW.id, _branch_id, _full_name, 'admin', NEW.email);
  END IF;

  RETURN NEW;
END;
$$;