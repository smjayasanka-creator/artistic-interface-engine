// Shared helper: verify a client belongs to the API key's company by joining
// through branch. Returns null on miss (used for plain 404s, no enumeration).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function loadOwnedClient(
  client_id: string,
  company_id: string,
): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin
    .from("client")
    .select("id, branch:branch_id(company_id)")
    .eq("id", client_id)
    .maybeSingle();
  if (!data) return null;
  if ((data as any).branch?.company_id !== company_id) return null;
  return { id: (data as any).id };
}
