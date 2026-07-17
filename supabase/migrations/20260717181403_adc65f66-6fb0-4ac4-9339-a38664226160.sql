
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  cefts_enabled boolean NOT NULL DEFAULT false,
  slips_enabled boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bank TO authenticated;
GRANT ALL ON public.bank TO service_role;
ALTER TABLE public.bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_read_all" ON public.bank FOR SELECT TO authenticated USING (true);
CREATE POLICY "bank_platform_admin_write" ON public.bank FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

CREATE TABLE public.bank_branch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES public.bank(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  address text,
  city text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_id, code)
);
CREATE INDEX bank_branch_bank_idx ON public.bank_branch(bank_id);
GRANT SELECT ON public.bank_branch TO authenticated;
GRANT ALL ON public.bank_branch TO service_role;
ALTER TABLE public.bank_branch ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_branch_read_all" ON public.bank_branch FOR SELECT TO authenticated USING (true);
CREATE POLICY "bank_branch_platform_admin_write" ON public.bank_branch FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

CREATE TRIGGER bank_set_updated BEFORE UPDATE ON public.bank
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bank_branch_set_updated BEFORE UPDATE ON public.bank_branch
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.bank (code, name, cefts_enabled, slips_enabled) VALUES
('7010','Bank of Ceylon',true,true),
('7038','Standard Chartered Bank',true,true),
('7047','Citi bank N. A.',true,true),
('7056','Commercial Bank Of Ceylon PLC',true,true),
('7074','Habib Bank Limited',true,true),
('7083','Hatton National Bank PLC',true,true),
('7092','Hongkong and Shanghai Banking Corporation',true,true),
('7108','Indian Bank',true,true),
('7117','Indian Overseas Bank',true,true),
('7135','People''s Bank',true,true),
('7144','State Bank of India',true,true),
('7162','Nations Trust Bank PLC',true,true),
('7205','Deutsche Bank AG',true,true),
('7214','National Development Bank PLC',true,true),
('7269','MCB Bank Limited',true,true),
('7278','Sampath Bank PLC',true,true),
('7287','Seylan Bank PLC',true,true),
('7296','Public Bank Berhad',true,true),
('7302','Union Bank Of Colombo PLC',true,true),
('7311','Pan Asia Banking Corporation PLC',true,true),
('7454','DFCC Bank PLC',true,true),
('7463','Amana Bank PLC',true,true),
('7481','Cargills Bank PLC',true,true),
('7603','Softologic Finance PLC',true,false),
('7612','Polgahawela Co-operative Regional Rural Bank',false,true),
('7630','Singer Finance (Lanka) PLC',true,false),
('7658','Lanka Credit and Business Finance PLC',false,true),
('7667','CBC Finance Limited',true,false),
('7676','Asia Asset Finance PLC',true,false),
('7700','Bank of China Limited',true,false),
('7719','National Savings Bank',true,true),
('7728','SANASA Development Bank Ltd',true,true),
('7737','HDFC Bank',true,true),
('7746','Citizen Development Business Finance PLC',true,true),
('7755','Regional Development Bank',true,true),
('7764','State Mortgage and Investment Bank',false,true),
('7773','L B Finance PLC',true,true),
('7782','Senkadagala Finance PLC',true,true),
('7816','Vallibel Finance PLC',true,true),
('7825','Central Finance PLC',true,true),
('7834','Kanrich Finance Limited',false,true),
('7852','Alliance Finance Company PLC',false,true),
('7861','LOLC Finance PLC',true,true),
('6870','Commercial Credit and Finance PLC',true,false),
('7889','Richard Pieris Finance Limited',true,false),
('7898','Merchant Bank of Sri Lanka & Finance PLC',true,true),
('7904','HNB Finance PLC',true,true),
('7913','Mercantile Investments And Finance PLC',true,true),
('7922','People Leasing & Finance PLC',true,true),
('7931','Sarvodhaya Development Finance Limited',true,false),
('7940','Fintrex Finance Limited',true,false),
('7995','Dialog Finance PLC',true,true),
('8004','Central Bank of Sri Lanka',false,true),
('4649','Global Payments Asia Pacific Lanka',false,false);
