// Shared helper: verify a fixed deposit belongs to the API key's company.
// Returns null on miss so callers respond with a plain 404 (no cross-tenant
// enumeration).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function loadOwnedFixedDeposit(
  deposit_id: string,
  company_id: string,
): Promise<{ id: string; certificate_no: string } | null> {
  const { data } = await supabaseAdmin
    .from("fixed_deposit")
    .select("id, certificate_no, company_id")
    .eq("id", deposit_id)
    .maybeSingle();
  if (!data) return null;
  if ((data as any).company_id !== company_id) return null;
  return { id: (data as any).id, certificate_no: (data as any).certificate_no };
}
