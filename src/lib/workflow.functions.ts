import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export const APPROVER_KINDS = ["role", "branch_role", "user"] as const;
export const SLA_ACTIONS = ["flag", "escalate"] as const;
export const STAFF_ROLES = ["loan_officer", "branch_manager", "teller", "operations", "admin"] as const;

// Canonical transaction types; companies can also register custom codes.
export const CANONICAL_TX_TYPES: { code: string; label: string }[] = [
  { code: "loan_approval", label: "Loan approval" },
  { code: "loan_disbursement", label: "Loan disbursement" },
  { code: "fd_new", label: "Fixed deposit opening" },
  { code: "fd_maturity", label: "FD maturity payout" },
  { code: "journal_entry", label: "Journal entry" },
  { code: "payment", label: "Payment" },
];

const stepSchema = z.object({
  id: z.string().uuid().optional(),
  step_order: z.number().int().min(1),
  name: z.string().min(1),
  approver_kind: z.enum(APPROVER_KINDS),
  role: z.enum(STAFF_ROLES).nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
  required_approvals: z.number().int().min(1).default(1),
  sla_hours: z.number().int().min(0).nullable().optional(),
  sla_action: z.enum(SLA_ACTIONS).default("flag"),
  escalation_role: z.enum(STAFF_ROLES).nullable().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// READS
// ─────────────────────────────────────────────────────────────────────────────

export const listWorkflows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workflow_definition")
      .select("id, name, transaction_type, description, is_enabled, created_at, updated_at, steps:workflow_step(id, step_order, name, approver_kind, role, branch_id, user_id, required_approvals, sla_hours, sla_action, escalation_role)")
      .order("transaction_type", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((w: any) => ({
      ...w,
      steps: (w.steps ?? []).sort((a: any, b: any) => a.step_order - b.step_order),
    }));
  });

export const getWorkflow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: wf, error } = await context.supabase
      .from("workflow_definition")
      .select("id, name, transaction_type, description, is_enabled, steps:workflow_step(id, step_order, name, approver_kind, role, branch_id, user_id, required_approvals, sla_hours, sla_action, escalation_role)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!wf) throw new Error("Workflow not found");
    return { ...wf, steps: (wf.steps ?? []).sort((a: any, b: any) => a.step_order - b.step_order) };
  });

// ─────────────────────────────────────────────────────────────────────────────
// WRITES: definitions & steps
// ─────────────────────────────────────────────────────────────────────────────

export const upsertWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().nullable().optional(),
      name: z.string().min(1),
      transaction_type: z.string().min(1),
      description: z.string().nullable().optional(),
      is_enabled: z.boolean().default(true),
      steps: z.array(stepSchema).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");
    const companyId = cid as string;

    let wfId = data.id ?? null;
    if (wfId) {
      const { error } = await supabase
        .from("workflow_definition")
        .update({
          name: data.name,
          transaction_type: data.transaction_type,
          description: data.description ?? null,
          is_enabled: data.is_enabled,
        })
        .eq("id", wfId);
      if (error) throw error;
    } else {
      const { data: ins, error } = await supabase
        .from("workflow_definition")
        .insert({
          company_id: companyId,
          name: data.name,
          transaction_type: data.transaction_type,
          description: data.description ?? null,
          is_enabled: data.is_enabled,
        })
        .select("id")
        .single();
      if (error) throw error;
      wfId = ins.id;
    }

    // Replace steps atomically
    await supabase.from("workflow_step").delete().eq("workflow_id", wfId);
    const rows = data.steps.map((s) => ({
      workflow_id: wfId!,
      step_order: s.step_order,
      name: s.name,
      approver_kind: s.approver_kind,
      role: s.approver_kind === "user" ? null : s.role ?? null,
      branch_id: s.approver_kind === "branch_role" ? s.branch_id ?? null : null,
      user_id: s.approver_kind === "user" ? s.user_id ?? null : null,
      required_approvals: s.required_approvals ?? 1,
      sla_hours: s.sla_hours ?? null,
      sla_action: s.sla_action ?? "flag",
      escalation_role: s.sla_action === "escalate" ? s.escalation_role ?? null : null,
    }));
    const { error: stErr } = await supabase.from("workflow_step").insert(rows);
    if (stErr) throw stErr;

    return { ok: true, id: wfId };
  });

export const toggleWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_enabled: boolean }) =>
    z.object({ id: z.string().uuid(), is_enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workflow_definition")
      .update({ is_enabled: data.is_enabled })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workflow_definition").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// INSTANCES
// ─────────────────────────────────────────────────────────────────────────────

export const startWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      transaction_type: z.string().min(1),
      reference_id: z.string().uuid().nullable().optional(),
      reference_label: z.string().min(1),
      amount: z.number().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    const companyId = cid as string | null;
    if (!companyId) throw new Error("No active company");

    const { data: wf, error: wErr } = await supabase
      .from("workflow_definition")
      .select("id, is_enabled, steps:workflow_step(id, sla_hours)")
      .eq("company_id", companyId)
      .eq("transaction_type", data.transaction_type)
      .eq("is_enabled", true)
      .maybeSingle();
    if (wErr) throw wErr;
    if (!wf) throw new Error("No active workflow for " + data.transaction_type);

    const { data: inst, error } = await supabase
      .from("workflow_instance")
      .insert({
        workflow_id: wf.id,
        company_id: companyId,
        transaction_type: data.transaction_type,
        reference_id: data.reference_id ?? null,
        reference_label: data.reference_label,
        amount: data.amount ?? null,
        initiated_by: userId,
        current_step: 1,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, instance_id: inst.id };
  });

export const listInstances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.enum(["pending", "approved", "declined", "cancelled", "all"]).default("pending"),
      mine: z.boolean().default(false),
    }).partial().parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("workflow_instance")
      .select("id, transaction_type, reference_label, amount, status, current_step, initiated_at, completed_at, workflow:workflow_id(id, name, steps:workflow_step(id, step_order, name, approver_kind, role, branch_id, user_id, required_approvals, sla_hours, sla_action, escalation_role)), actions:workflow_action(id, step_order, actor_user_id, decision, comment, acted_at)")
      .order("initiated_at", { ascending: false })
      .limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;

    // If mine=true, filter to those where the current step targets this user's role/branch/user.
    let filtered = rows ?? [];
    if (data.mine) {
      const { data: staff } = await supabase
        .from("staff")
        .select("user_id, role, branch_id")
        .eq("user_id", userId)
        .maybeSingle();
      const myRole = staff?.role as string | undefined;
      const myBranch = staff?.branch_id as string | undefined;
      filtered = filtered.filter((r: any) => {
        if (r.status !== "pending") return false;
        const step = (r.workflow?.steps ?? []).find((s: any) => s.step_order === r.current_step);
        if (!step) return false;
        if (step.approver_kind === "user") return step.user_id === userId;
        if (step.approver_kind === "role") return step.role === myRole;
        if (step.approver_kind === "branch_role") return step.role === myRole && step.branch_id === myBranch;
        return false;
      });
    }

    // Enrich with SLA
    const now = Date.now();
    return filtered.map((r: any) => {
      const step = (r.workflow?.steps ?? []).find((s: any) => s.step_order === r.current_step);
      const dueAt = step?.sla_hours ? new Date(new Date(r.initiated_at).getTime() + step.sla_hours * 3600e3) : null;
      const overdue = dueAt ? now > dueAt.getTime() && r.status === "pending" : false;
      const approvalsForStep = (r.actions ?? []).filter((a: any) => a.step_order === r.current_step && a.decision === "approve").length;
      return { ...r, step_config: step, due_at: dueAt?.toISOString() ?? null, overdue, approvals_recorded: approvalsForStep };
    });
  });

export const actOnInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      instance_id: z.string().uuid(),
      decision: z.enum(["approve", "decline"]),
      comment: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inst, error: iErr } = await supabase
      .from("workflow_instance")
      .select("id, status, current_step, workflow:workflow_id(steps:workflow_step(step_order, approver_kind, role, branch_id, user_id, required_approvals))")
      .eq("id", data.instance_id)
      .maybeSingle();
    if (iErr) throw iErr;
    if (!inst) throw new Error("Instance not found");
    if (inst.status !== "pending") throw new Error("Instance is not pending");

    const steps = ((inst as any).workflow?.steps ?? []).sort((a: any, b: any) => a.step_order - b.step_order);
    const step = steps.find((s: any) => s.step_order === inst.current_step);
    if (!step) throw new Error("Step config missing");

    // Verify authorization
    const { data: staff } = await supabase
      .from("staff").select("role, branch_id").eq("user_id", userId).maybeSingle();
    const okUser = step.approver_kind === "user" && step.user_id === userId;
    const okRole = step.approver_kind === "role" && step.role === staff?.role;
    const okBranchRole = step.approver_kind === "branch_role" && step.role === staff?.role && step.branch_id === staff?.branch_id;
    if (!okUser && !okRole && !okBranchRole) throw new Error("Not authorized to act on this step");

    // Insert action (unique per actor/step)
    const { error: aErr } = await supabase.from("workflow_action").insert({
      instance_id: data.instance_id,
      step_order: inst.current_step,
      actor_user_id: userId,
      decision: data.decision,
      comment: data.comment ?? null,
    });
    if (aErr) throw aErr;

    if (data.decision === "decline") {
      await supabase.from("workflow_instance")
        .update({ status: "declined", completed_at: new Date().toISOString() })
        .eq("id", data.instance_id);
      return { ok: true, status: "declined" };
    }

    // Count approvals for this step
    const { data: acts } = await supabase
      .from("workflow_action").select("id")
      .eq("instance_id", data.instance_id)
      .eq("step_order", inst.current_step)
      .eq("decision", "approve");
    const approvals = acts?.length ?? 0;

    if (approvals < (step.required_approvals ?? 1)) {
      return { ok: true, status: "pending", approvals };
    }

    // Advance or complete
    const nextOrder = inst.current_step + 1;
    const hasNext = steps.some((s: any) => s.step_order === nextOrder);
    if (hasNext) {
      await supabase.from("workflow_instance").update({ current_step: nextOrder }).eq("id", data.instance_id);
      return { ok: true, status: "pending", advanced_to: nextOrder };
    }
    await supabase.from("workflow_instance")
      .update({ status: "approved", completed_at: new Date().toISOString() })
      .eq("id", data.instance_id);
    return { ok: true, status: "approved" };
  });

export const cancelInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instance_id: string }) => z.object({ instance_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workflow_instance")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", data.instance_id)
      .eq("status", "pending");
    if (error) throw error;
    return { ok: true };
  });
