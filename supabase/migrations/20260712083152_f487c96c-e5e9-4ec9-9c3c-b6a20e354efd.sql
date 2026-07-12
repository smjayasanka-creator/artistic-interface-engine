
-- Subscription plans catalog
CREATE TABLE public.subscription_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  price_monthly numeric(18,2) NOT NULL DEFAULT 0,
  price_annual numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'LKR',
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  seat_limit int,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plan TO authenticated;
GRANT ALL ON public.subscription_plan TO service_role;
ALTER TABLE public.subscription_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can view plans"
  ON public.subscription_plan FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Platform admins manage plans"
  ON public.subscription_plan FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

CREATE TRIGGER trg_subscription_plan_updated
  BEFORE UPDATE ON public.subscription_plan
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Per-company subscription
CREATE TABLE public.company_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.company(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plan(id),
  status text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','canceled','paused')),
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual')),
  seats int NOT NULL DEFAULT 5,
  mrr numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'LKR',
  started_on date NOT NULL DEFAULT current_date,
  current_period_end date,
  trial_ends_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_subscription TO authenticated;
GRANT ALL ON public.company_subscription TO service_role;
ALTER TABLE public.company_subscription ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view own subscription"
  ON public.company_subscription FOR SELECT
  TO authenticated USING (public.is_company_member(company_id));

CREATE POLICY "Platform admins can view all subscriptions"
  ON public.company_subscription FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "Platform admins manage subscriptions"
  ON public.company_subscription FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

CREATE TRIGGER trg_company_subscription_updated
  BEFORE UPDATE ON public.company_subscription
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Platform admin: read-across-companies policies (SELECT only)
CREATE POLICY "Platform admin reads all companies"
  ON public.company FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "Platform admin reads all branches"
  ON public.branch FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "Platform admin reads all staff"
  ON public.staff FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "Platform admin reads all clients"
  ON public.client FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "Platform admin reads all loans"
  ON public.loan FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "Platform admin reads all deposits"
  ON public.fixed_deposit FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));

-- Seed default plans
INSERT INTO public.subscription_plan (code, name, price_monthly, price_annual, currency, features, seat_limit, sort_order)
VALUES
  ('starter', 'Starter', 4900, 49000, 'LKR', '["1 branch","Up to 5 staff","500 customers","Email support"]'::jsonb, 5, 1),
  ('growth',  'Growth',  14900, 149000, 'LKR', '["Up to 5 branches","25 staff","Unlimited customers","Priority support","API access"]'::jsonb, 25, 2),
  ('enterprise','Enterprise', 49900, 499000, 'LKR', '["Unlimited branches","Unlimited staff","Dedicated CSM","SSO / SAML","Custom SLA"]'::jsonb, NULL, 3)
ON CONFLICT (code) DO NOTHING;
