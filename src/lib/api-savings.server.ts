// Shared helper: verify a savings account belongs to the API key's company.
// Returns null on miss so callers can respond with a plain 404 (no
// cross-tenant enumeration).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function loadOwnedSavingsAccount(
  account_id: string,
  company_id: string,
): Promise<{ id: string; account_no: string } | null> {
  const { data } = await supabaseAdmin
    .from("savings_account")
    .select("id, account_no, company_id")
    .eq("id", account_id)
    .maybeSingle();
  if (!data) return null;
  if ((data as any).company_id !== company_id) return null;
  return { id: (data as any).id, account_no: (data as any).account_no };
}
