// Shared helper: verify a loan_application belongs to the API key's company
// and return {application_id, application_no}. Returns null on miss so callers
// can respond with a plain 404 (no cross-tenant enumeration).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function loadOwnedApplication(
  application_id: string,
  company_id: string,
): Promise<{ id: string; application_no: string; status: string } | null> {
  const { data } = await supabaseAdmin
    .from("loan_application" as any)
    .select("id, application_no, status, company_id")
    .eq("id", application_id)
    .maybeSingle();
  if (!data) return null;
  const r = data as any;
  if (r.company_id !== company_id) return null;
  return { id: r.id, application_no: r.application_no, status: r.status };
}
