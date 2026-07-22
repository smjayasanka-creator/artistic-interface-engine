// Shared helper: verify a loan belongs to the API key's company via its branch.
// Returns null on miss so callers respond with a plain 404 (no cross-tenant
// enumeration).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function loadOwnedLoan(
  loan_id: string,
  company_id: string,
): Promise<{ id: string; contract_no: string | null; status: string } | null> {
  const { data } = await supabaseAdmin
    .from("loan")
    .select("id, contract_no, status, branch:branch_id(company_id)")
    .eq("id", loan_id)
    .maybeSingle();
  if (!data) return null;
  if ((data as any).branch?.company_id !== company_id) return null;
  return {
    id: (data as any).id,
    contract_no: (data as any).contract_no ?? null,
    status: (data as any).status,
  };
}
