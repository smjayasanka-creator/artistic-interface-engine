import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rateItem = z.object({
  product_id: z.string().uuid(),
  standard_rate: z.number().min(0).max(100).nullable(),
  maximum_rate: z.number().min(0).max(100).nullable(),
  cbsl_max_rate: z.number().min(0).max(100).nullable(),
});

// List active FD products with current ALCO rates.
export const listAlcoRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fd_product")
      .select("id, code, name, active, standard_rate, maximum_rate, cbsl_max_rate")
      .eq("active", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

// Submit a proposal — creates proposal + items and starts an approval workflow.
export const submitAlcoProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        notes: z.string().nullable().optional(),
        items: z.array(rateItem).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    const companyId = cid as string | null;
    if (!companyId) throw new Error("No active company");

    // Fetch current rates for change diff & to reject no-ops.
    const productIds = data.items.map((i) => i.product_id);
    const { data: products, error: pErr } = await supabase
      .from("fd_product")
      .select("id, name, code, standard_rate, maximum_rate, cbsl_max_rate")
      .in("id", productIds);
    if (pErr) throw pErr;
    const byId = new Map((products ?? []).map((p: any) => [p.id, p]));

    const changed = data.items.filter((it) => {
      const p = byId.get(it.product_id);
      if (!p) return false;
      return (
        Number(p.standard_rate ?? -1) !== Number(it.standard_rate ?? -1) ||
        Number(p.maximum_rate ?? -1) !== Number(it.maximum_rate ?? -1) ||
        Number(p.cbsl_max_rate ?? -1) !== Number(it.cbsl_max_rate ?? -1)
      );
    });
    if (changed.length === 0) throw new Error("No rate changes detected");

    // Create proposal
    const { data: prop, error: insErr } = await supabase
      .from("alco_rate_proposal")
      .insert({
        company_id: companyId,
        notes: data.notes ?? null,
        created_by: userId,
        status: "pending",
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const itemRows = changed.map((it) => {
      const p: any = byId.get(it.product_id);
      return {
        proposal_id: prop.id,
        product_id: it.product_id,
        old_standard_rate: p?.standard_rate ?? null,
        old_maximum_rate: p?.maximum_rate ?? null,
        old_cbsl_max_rate: p?.cbsl_max_rate ?? null,
        new_standard_rate: it.standard_rate,
        new_maximum_rate: it.maximum_rate,
        new_cbsl_max_rate: it.cbsl_max_rate,
      };
    });
    const { error: itErr } = await supabase.from("alco_rate_proposal_item").insert(itemRows);
    if (itErr) throw itErr;

    // Start workflow (best-effort; if no workflow configured, proposal remains pending without instance)
    let workflowInstanceId: string | null = null;
    try {
      const { data: wf } = await supabase
        .from("workflow_definition")
        .select("id")
        .eq("company_id", companyId)
        .eq("transaction_type", "alco_rate_change")
        .eq("is_enabled", true)
        .maybeSingle();
      if (wf?.id) {
        const { data: inst, error: wErr } = await supabase
          .from("workflow_instance")
          .insert({
            workflow_id: wf.id,
            company_id: companyId,
            transaction_type: "alco_rate_change",
            reference_id: prop.id,
            reference_label: `ALCO rate change (${changed.length} product${changed.length > 1 ? "s" : ""})`,
            amount: null,
            initiated_by: userId,
            current_step: 1,
          })
          .select("id")
          .single();
        if (!wErr && inst?.id) {
          workflowInstanceId = inst.id;
          await supabase
            .from("alco_rate_proposal")
            .update({ workflow_instance_id: inst.id })
            .eq("id", prop.id);
        }
      }
    } catch {
      /* ignore */
    }

    return {
      ok: true,
      proposal_id: prop.id,
      workflow_instance_id: workflowInstanceId,
      changed_count: changed.length,
    };
  });

export const listAlcoProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("alco_rate_proposal")
      .select(
        "id, status, notes, created_at, applied_at, workflow_instance_id, items:alco_rate_proposal_item(id, product_id, old_standard_rate, old_maximum_rate, old_cbsl_max_rate, new_standard_rate, new_maximum_rate, new_cbsl_max_rate, product:product_id(name, code)), workflow:workflow_instance_id(status, current_step)",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

// Apply an approved proposal — writes rates into fd_product.
export const applyAlcoProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { proposal_id: string }) =>
    z.object({ proposal_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prop, error } = await supabase
      .from("alco_rate_proposal")
      .select(
        "id, status, workflow_instance_id, items:alco_rate_proposal_item(product_id, new_standard_rate, new_maximum_rate, new_cbsl_max_rate), workflow:workflow_instance_id(status)",
      )
      .eq("id", data.proposal_id)
      .maybeSingle();
    if (error) throw error;
    if (!prop) throw new Error("Proposal not found");
    if (prop.status === "applied") throw new Error("Already applied");

    const wfStatus = (prop as any).workflow?.status;
    if (prop.workflow_instance_id && wfStatus !== "approved") {
      throw new Error(`Workflow not approved (current: ${wfStatus ?? "n/a"})`);
    }

    for (const it of (prop as any).items ?? []) {
      const { error: rpcErr } = await supabase.rpc("upsert_fd_alco_rate_version", {
        _product_id: it.product_id,
        _standard_rate: it.new_standard_rate,
        _maximum_rate: it.new_maximum_rate,
        _cbsl_max_rate: it.new_cbsl_max_rate,
        _effective_from: new Date().toISOString(),
        _note: (prop as any).notes ?? null,
        _active: true,
      });
      if (rpcErr) throw rpcErr;
    }

    await supabase
      .from("alco_rate_proposal")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
        applied_by: userId,
      })
      .eq("id", data.proposal_id);

    return { ok: true };
  });

export const cancelAlcoProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { proposal_id: string }) =>
    z.object({ proposal_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("alco_rate_proposal")
      .update({ status: "cancelled" })
      .eq("id", data.proposal_id)
      .in("status", ["pending"]);
    if (error) throw error;
    return { ok: true };
  });

/** Full version history for one FD product's ALCO rates. */
export const listAlcoRateHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ product_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("fd_alco_rate")
      .select(
        "id, standard_rate, maximum_rate, cbsl_max_rate, active, effective_from, effective_to, note, created_by, created_at",
      )
      .eq("product_id", data.product_id)
      .order("effective_from", { ascending: false });
    if (error) throw error;

    const creatorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.created_by).filter(Boolean)),
    );
    let nameById = new Map<string, string>();
    if (creatorIds.length > 0) {
      const { data: staff } = await context.supabase
        .from("staff")
        .select("user_id, full_name, email")
        .in("user_id", creatorIds);
      nameById = new Map((staff ?? []).map((s: any) => [s.user_id, s.full_name || s.email || ""]));
    }
    const total = (rows ?? []).length;
    return (rows ?? []).map((r: any, i: number) => ({
      ...r,
      version_no: total - i,
      status: r.effective_to === null ? (r.active ? "active" : "retired") : "historical",
      created_by_name: r.created_by ? (nameById.get(r.created_by) ?? "—") : "System",
    }));
  });
