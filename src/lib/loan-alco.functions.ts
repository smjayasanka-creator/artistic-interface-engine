import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const upsertInput = z.object({
  product_id: z.string().uuid(),
  security_type_id: z.string().uuid().nullable().optional(),
  equipment_vehicle: z.string().trim().max(200).nullable().optional(),
  min_rate: z.number().min(0).max(100),
  max_rate: z.number().min(0).max(100),
  min_period_months: z.number().int().min(0),
  max_period_months: z.number().int().min(0),
  effective_from: z.string().datetime().optional(),
  note: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
}).refine((v) => v.max_rate >= v.min_rate, { message: "Max rate must be ≥ min rate" })
  .refine((v) => v.max_period_months >= v.min_period_months, { message: "Max period must be ≥ min period" });

/** List currently-active loan ALCO rate versions. */
export const listLoanAlcoRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("loan_alco_rate")
      .select("id, product_id, security_type_id, equipment_vehicle, min_rate, max_rate, min_period_months, max_period_months, active, effective_from, effective_to, note, product:product_id(name), security:security_type_id(name)")
      .is("effective_to", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

/** Insert a new version — routed through workflow when `loan_alco_rate_change` is enabled. */
export const upsertLoanAlcoRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: cid } = await supabase.rpc("current_company_id");
    const companyId = cid as string | null;

    let wfDefId: string | null = null;
    if (companyId) {
      const { data: wf } = await supabase
        .from("workflow_definition")
        .select("id")
        .eq("company_id", companyId)
        .eq("transaction_type", "loan_alco_rate_change")
        .eq("is_enabled", true)
        .maybeSingle();
      wfDefId = wf?.id ?? null;
    }

    // No workflow → apply immediately (legacy behaviour).
    if (!wfDefId || !companyId) {
      const { data: newId, error } = await supabase.rpc("upsert_loan_alco_rate_version", {
        _product_id: data.product_id,
        _security_type_id: (data.security_type_id ?? null) as unknown as string,
        _equipment_vehicle: (data.equipment_vehicle ?? null) as unknown as string,
        _min_rate: data.min_rate,
        _max_rate: data.max_rate,
        _min_period_months: data.min_period_months,
        _max_period_months: data.max_period_months,
        _effective_from: data.effective_from ?? new Date().toISOString(),
        _note: (data.note ?? null) as unknown as string | undefined,
        _active: data.active ?? true,
      });
      if (error) throw error;
      return { ok: true, id: newId as string, workflow_instance_id: null as string | null, pending: false };
    }

    // Workflow enabled → hold as proposal + create workflow instance.
    const { data: prop, error: pErr } = await supabase
      .from("loan_alco_rate_proposal")
      .insert({
        company_id: companyId,
        product_id: data.product_id,
        security_type_id: data.security_type_id ?? null,
        equipment_vehicle: data.equipment_vehicle ?? null,
        min_rate: data.min_rate,
        max_rate: data.max_rate,
        min_period_months: data.min_period_months,
        max_period_months: data.max_period_months,
        effective_from: data.effective_from ?? new Date().toISOString(),
        note: data.note ?? null,
        active: data.active ?? true,
        status: "pending",
        created_by: userId,
      })
      .select("id")
      .single();
    if (pErr) throw pErr;

    let workflowInstanceId: string | null = null;
    const { data: inst, error: wErr } = await supabase
      .from("workflow_instance")
      .insert({
        workflow_id: wfDefId,
        company_id: companyId,
        transaction_type: "loan_alco_rate_change",
        reference_id: prop.id,
        reference_label: "Loan ALCO rate change",
        amount: null,
        initiated_by: userId,
        current_step: 1,
      })
      .select("id")
      .single();
    if (!wErr && inst?.id) {
      workflowInstanceId = inst.id;
      await supabase.from("loan_alco_rate_proposal").update({ workflow_instance_id: inst.id }).eq("id", prop.id);
    }

    return { ok: true, id: prop.id, workflow_instance_id: workflowInstanceId, pending: true };
  });

/** List pending/recent loan ALCO proposals for the current company. */
export const listLoanAlcoProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("loan_alco_rate_proposal")
      .select("id, status, note, created_at, applied_at, workflow_instance_id, product_id, security_type_id, equipment_vehicle, min_rate, max_rate, min_period_months, max_period_months, effective_from, active, product:product_id(name), security:security_type_id(name), workflow:workflow_instance_id(status, current_step)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

/** Apply an approved proposal — writes into loan_alco_rate via RPC. */
export const applyLoanAlcoProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { proposal_id: string }) => z.object({ proposal_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prop, error } = await supabase
      .from("loan_alco_rate_proposal")
      .select("id, status, workflow_instance_id, product_id, security_type_id, equipment_vehicle, min_rate, max_rate, min_period_months, max_period_months, effective_from, note, active, workflow:workflow_instance_id(status)")
      .eq("id", data.proposal_id)
      .maybeSingle();
    if (error) throw error;
    if (!prop) throw new Error("Proposal not found");
    if (prop.status === "applied") throw new Error("Already applied");
    if (prop.status !== "pending") throw new Error(`Proposal is ${prop.status}`);

    const wfStatus = (prop as any).workflow?.status;
    if (prop.workflow_instance_id && wfStatus !== "approved") {
      throw new Error(`Workflow not approved (current: ${wfStatus ?? "n/a"})`);
    }

    const { error: rpcErr } = await supabase.rpc("upsert_loan_alco_rate_version", {
      _product_id: prop.product_id,
      _security_type_id: (prop.security_type_id ?? null) as unknown as string,
      _equipment_vehicle: (prop.equipment_vehicle ?? null) as unknown as string,
      _min_rate: prop.min_rate,
      _max_rate: prop.max_rate,
      _min_period_months: prop.min_period_months,
      _max_period_months: prop.max_period_months,
      _effective_from: prop.effective_from,
      _note: (prop.note ?? null) as unknown as string | undefined,
      _active: prop.active ?? true,
    });
    if (rpcErr) throw rpcErr;

    await supabase.from("loan_alco_rate_proposal").update({
      status: "applied", applied_at: new Date().toISOString(), applied_by: userId,
    }).eq("id", data.proposal_id);

    return { ok: true };
  });

/** Cancel a pending proposal. */
export const cancelLoanAlcoProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { proposal_id: string }) => z.object({ proposal_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("loan_alco_rate_proposal")
      .update({ status: "cancelled" })
      .eq("id", data.proposal_id)
      .in("status", ["pending"]);
    if (error) throw error;
    return { ok: true };
  });

/** Close the active version (equivalent to retiring the rate). */
export const deleteLoanAlcoRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("loan_alco_rate")
      .update({ effective_to: new Date().toISOString(), active: false })
      .eq("id", data.id)
      .is("effective_to", null);
    if (error) throw error;
    return { ok: true };
  });

/** Full history for one (product, security_type, equipment_vehicle) tuple. */
export const listLoanAlcoRateHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      product_id: z.string().uuid(),
      security_type_id: z.string().uuid().nullable().optional(),
      equipment_vehicle: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("loan_alco_rate")
      .select("id, min_rate, max_rate, min_period_months, max_period_months, active, effective_from, effective_to, note, created_by, created_at, security_type_id, equipment_vehicle")
      .eq("product_id", data.product_id)
      .order("effective_from", { ascending: false });
    if (data.security_type_id) q = q.eq("security_type_id", data.security_type_id);
    else q = q.is("security_type_id", null);
    const ev = (data.equipment_vehicle ?? "").trim();
    if (ev) q = q.ilike("equipment_vehicle", ev);
    else q = q.is("equipment_vehicle", null);
    const { data: rows, error } = await q;
    if (error) throw error;

    // Resolve creator display names via staff (created_by references auth.users; no PostgREST FK to join).
    const creatorIds = Array.from(new Set((rows ?? []).map((r: any) => r.created_by).filter(Boolean)));
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
      // Highest version number = most recent (rows are sorted DESC by effective_from).
      version_no: total - i,
      status: r.effective_to === null ? (r.active ? "active" : "retired") : "historical",
      created_by_name: r.created_by ? (nameById.get(r.created_by) ?? "—") : "System",
    }));
  });

/** All loan ALCO rate versions across products — for the "Previous versions" panel. */
export const listAllLoanAlcoVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("loan_alco_rate")
      .select("id, product_id, security_type_id, equipment_vehicle, min_rate, max_rate, min_period_months, max_period_months, active, effective_from, effective_to, note, created_by, created_at, product:product_id(name), security:security_type_id(name)")
      .order("effective_from", { ascending: false })
      .limit(500);
    if (error) throw error;

    const groups = new Map<string, any[]>();
    for (const r of (rows ?? []) as any[]) {
      const k = `${r.product_id}|${r.security_type_id ?? ""}|${(r.equipment_vehicle ?? "").toLowerCase()}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    for (const arr of groups.values()) {
      const total = arr.length;
      arr.forEach((r, i) => { r.version_no = total - i; });
    }

    const { data: proposals } = await context.supabase
      .from("loan_alco_rate_proposal")
      .select("product_id, security_type_id, equipment_vehicle, effective_from, applied_by, applied_at")
      .eq("status", "applied");
    const propKey = (p: any) =>
      `${p.product_id}|${p.security_type_id ?? ""}|${(p.equipment_vehicle ?? "").toLowerCase()}|${new Date(p.effective_from).toISOString()}`;
    const propByKey = new Map<string, any>();
    for (const p of (proposals ?? []) as any[]) propByKey.set(propKey(p), p);

    const ids = new Set<string>();
    for (const r of (rows ?? []) as any[]) if (r.created_by) ids.add(r.created_by);
    for (const p of (proposals ?? []) as any[]) if (p.applied_by) ids.add(p.applied_by);
    let nameById = new Map<string, string>();
    if (ids.size > 0) {
      const { data: staff } = await context.supabase
        .from("staff")
        .select("user_id, full_name, email")
        .in("user_id", Array.from(ids));
      nameById = new Map((staff ?? []).map((s: any) => [s.user_id, s.full_name || s.email || ""]));
    }

    return (rows ?? []).map((r: any) => {
      const k = `${r.product_id}|${r.security_type_id ?? ""}|${(r.equipment_vehicle ?? "").toLowerCase()}|${new Date(r.effective_from).toISOString()}`;
      const prop = propByKey.get(k);
      return {
        ...r,
        status: r.effective_to === null ? (r.active ? "active" : "retired") : "historical",
        created_by_name: r.created_by ? (nameById.get(r.created_by) ?? "—") : "System",
        approved_by_name: prop?.applied_by ? (nameById.get(prop.applied_by) ?? "—") : null,
        approved_at: prop?.applied_at ?? null,
      };
    });
  });



