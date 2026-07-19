import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function currentCompanyId(supabase: any) {
  const { data, error } = await supabase.rpc("current_company_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No company for current user");
  return data as string;
}

/* ---------------- Authority master ---------------- */

export const listAuthorities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("delegation_authority_master")
      .select("*, members:delegation_authority_member(*), delegates:delegation_authority_delegate(*)")
      .order("level", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const upsertAuthoritySchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  level: z.number().int().min(1).max(99),
  effective_from: z.string(),
  effective_to: z.string().nullable().optional(),
  status: z.enum(["active", "inactive"]),
});

export const upsertAuthority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertAuthoritySchema.parse(d))
  .handler(async ({ data, context }) => {
    const company_id = await currentCompanyId(context.supabase);
    const payload: any = { ...data, company_id };
    if (!data.id) payload.created_by = context.userId;
    const q = data.id
      ? context.supabase.from("delegation_authority_master").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("delegation_authority_master").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAuthority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("delegation_authority_master").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Members ---------------- */

const memberSchema = z.object({
  authority_id: z.string().uuid(),
  member_type: z.enum(["user", "custom_role", "staff_role"]),
  member_ref: z.string().min(1),
  is_backup: z.boolean().default(false),
});

export const addAuthorityMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => memberSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("delegation_authority_member")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeAuthorityMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("delegation_authority_member").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Absence delegates ---------------- */

const delegateSchema = z.object({
  id: z.string().uuid().optional(),
  authority_id: z.string().uuid(),
  from_user_id: z.string().uuid(),
  to_user_id: z.string().uuid(),
  from_date: z.string(),
  to_date: z.string(),
  reason: z.string().max(300).optional().nullable(),
});

export const upsertDelegate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => delegateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const q = data.id
      ? context.supabase.from("delegation_authority_delegate").update(data).eq("id", data.id).select().single()
      : context.supabase.from("delegation_authority_delegate").insert(data).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteDelegate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("delegation_authority_delegate").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Rules ---------------- */

export const listRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("delegation_rule")
      .select("*, steps:delegation_rule_step(*, authority:authority_id(id, code, name, level))")
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const ruleStepSchema = z.object({
  seq: z.number().int().min(1),
  authority_id: z.string().uuid(),
  mode: z.enum(["sequential", "parallel"]).default("sequential"),
  required_approvals: z.number().int().min(1).default(1),
  sla_hours: z.number().int().min(0).nullable().optional(),
  escalate_to_authority_id: z.string().uuid().nullable().optional(),
});

const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  active: z.boolean().default(true),
  priority: z.number().int().min(1).max(9999).default(100),
  rule_scope: z.enum(["user", "branch", "region", "product", "default"]),
  user_id: z.string().uuid().nullable().optional(),
  custom_role_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  region: z.string().nullable().optional(),
  product_id: z.string().uuid().nullable().optional(),
  security_type_id: z.string().uuid().nullable().optional(),
  amount_min: z.number().nullable().optional(),
  amount_max: z.number().nullable().optional(),
  rate_min: z.number().nullable().optional(),
  rate_max: z.number().nullable().optional(),
  risk_grade: z.string().nullable().optional(),
  effective_from: z.string(),
  effective_to: z.string().nullable().optional(),
  steps: z.array(ruleStepSchema).min(1),
});

export const upsertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ruleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const company_id = await currentCompanyId(context.supabase);
    const { steps, id, ...rest } = data;
    const payload: any = { ...rest, company_id };
    if (!id) payload.created_by = context.userId;
    const q = id
      ? context.supabase.from("delegation_rule").update(payload).eq("id", id).select().single()
      : context.supabase.from("delegation_rule").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);

    // Replace steps
    await context.supabase.from("delegation_rule_step").delete().eq("rule_id", row.id);
    if (steps.length) {
      const stepRows = steps.map((s) => ({ ...s, rule_id: row.id }));
      const { error: se } = await context.supabase.from("delegation_rule_step").insert(stepRows);
      if (se) throw new Error(se.message);
    }
    return row;
  });

export const deleteRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("delegation_rule").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Resolver preview ---------------- */

export const previewLoanApprovalChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ loan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("resolve_loan_approval_chain", { _loan_id: data.loan_id });
    if (error) throw new Error(error.message);
    return r as { rule_id: string | null; rule_name: string | null; steps: any[] };
  });

/* ---------------- Lookups for UI ---------------- */

export const listDelegationLookups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [staff, branches, products, roles, secTypes] = await Promise.all([
      context.supabase.from("staff").select("id, user_id, full_name, email, role, branch_id").order("full_name"),
      context.supabase.from("branch").select("id, code, name, region").order("code"),
      context.supabase.from("loan_product").select("id, code, name").order("name"),
      context.supabase.from("custom_role").select("id, name").order("name"),
      context.supabase.from("security_type").select("id, name, kind, category").order("name"),
    ]);
    return {
      staff: staff.data ?? [],
      branches: branches.data ?? [],
      products: products.data ?? [],
      roles: roles.data ?? [],
      securityTypes: secTypes.data ?? [],
      staffRoles: ["admin", "branch_manager", "loan_officer", "teller", "auditor"],
    };
  });
