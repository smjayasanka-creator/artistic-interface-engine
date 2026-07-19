import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FIELD_TYPE = z.enum(["text", "number", "date"]);

/* ---------------- Security types ---------------- */

export const listSecurityTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("security_type")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

async function currentCompanyId(supabase: any) {
  const { data, error } = await supabase.rpc("current_company_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No company for current user");
  return data as string;
}

const fieldDefSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(80),
  type: FIELD_TYPE,
  required: z.boolean().default(false),
});

const upsertSecurityTypeSchema = z.object({
  id: z.string().uuid().optional(),
  category: z.string().trim().min(2).max(60),
  kind: z.string().trim().min(2).max(60),
  fields: z
    .object({ definitions: z.array(fieldDefSchema).default([]) })
    .default({ definitions: [] }),
  active: z.boolean().default(true),
});

export const upsertSecurityType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSecurityTypeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const company_id = await currentCompanyId(context.supabase);
    const payload = { ...data, company_id, name: data.kind };
    const { error } = await context.supabase
      .from("security_type")
      .upsert(payload, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSecurityType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("security_type").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Delegation authority ---------------- */

export const listDelegationAuthorities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("delegation_authority")
      .select("*, security_type:security_type_id(id,name,kind,category)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const upsertDelegationSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(80),
    security_type_id: z.string().uuid(),
    ltv_min: z.number().min(0).max(100),
    ltv_max: z.number().min(0).max(100),
    amount_min: z.number().min(0),
    amount_max: z.number().min(0),
    rate_min: z.number().min(0).max(100),
    rate_max: z.number().min(0).max(100),
    active: z.boolean().default(true),
  })
  .refine((v) => v.ltv_min <= v.ltv_max, { message: "LTV min must be ≤ max", path: ["ltv_max"] })
  .refine((v) => v.amount_min <= v.amount_max, {
    message: "Amount min must be ≤ max",
    path: ["amount_max"],
  })
  .refine((v) => v.rate_min <= v.rate_max, {
    message: "Rate min must be ≤ max",
    path: ["rate_max"],
  });

export const upsertDelegationAuthority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertDelegationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const company_id = await currentCompanyId(context.supabase);
    const payload = { ...data, company_id };
    const { error } = await context.supabase
      .from("delegation_authority")
      .upsert(payload, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDelegationAuthority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("delegation_authority")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
