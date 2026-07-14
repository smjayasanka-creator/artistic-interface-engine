import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ListInput = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
  entity_type: z.string().min(1).optional(),
  action_prefix: z.string().min(1).optional(),
});

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: z.infer<typeof ListInput>) => ListInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Resolve caller's company
    const { data: staff } = await supabase
      .from("staff")
      .select("branch:branch_id(company_id)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const companyId = (staff?.branch as any)?.company_id as string | undefined;
    if (!companyId) return { rows: [], company_id: null, totalCount: 0 };

    const { data: rows, error } = await supabase.rpc("list_audit_log", {
      _company_id: companyId,
      _limit: data.limit ?? 100,
      _offset: data.offset ?? 0,
      _entity_type: data.entity_type ?? (undefined as any),
      _action_prefix: data.action_prefix ?? (undefined as any),
    });
    if (error) throw new Error(error.message);

    // Total count for pagination (same filters, ignoring limit/offset)
    let countQ = supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if (data.entity_type) countQ = countQ.eq("entity_type", data.entity_type);
    if (data.action_prefix) countQ = countQ.ilike("action", `${data.action_prefix}%`);
    const { count } = await countQ;

    return { rows: rows ?? [], company_id: companyId, totalCount: count ?? 0 };
  });
