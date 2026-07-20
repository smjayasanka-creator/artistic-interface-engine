import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function currentCompanyId(supabase: any) {
  const { data, error } = await supabase.rpc("current_company_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No company for current user");
  return data as string;
}

/* ─────────── WHT rules ─────────── */

export const listWhtRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await currentCompanyId(context.supabase);
    const { data, error } = await (context.supabase as any)
      .from("savings_wht_rule")
      .select("*, product:product_id(id,name,code), wht_gl:wht_gl_account_id(id,code,name)")
      .eq("company_id", cid)
      .order("effective_from", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const whtSchema = z
  .object({
    id: z.string().uuid().optional(),
    jurisdiction: z.string().trim().min(2).max(10),
    tax_type: z.enum(["wht", "ait"]),
    residency: z.enum(["resident", "nonresident", "any"]),
    entity_type: z.enum(["individual", "entity", "any"]),
    product_id: z.string().uuid().nullable().optional(),
    effective_from: z.string().min(10),
    effective_to: z.string().min(10).nullable().optional(),
    rate_pct: z.number().min(0).max(100),
    threshold: z.number().min(0).default(0),
    exemption_type: z.string().max(60).nullable().optional(),
    exemption_ref: z.string().max(120).nullable().optional(),
    exemption_expiry: z.string().min(10).nullable().optional(),
    wht_gl_account_id: z.string().uuid().nullable().optional(),
    active: z.boolean().default(true),
  })
  .refine((v) => !v.effective_to || v.effective_to >= v.effective_from, {
    message: "Effective-to must be on/after effective-from",
    path: ["effective_to"],
  });


export const upsertWhtRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => whtSchema.parse(d))
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase);
    const payload: any = { ...data, company_id: cid };
    if (!payload.id) delete payload.id;
    const { error } = await (context.supabase as any)
      .from("savings_wht_rule")
      .upsert(payload, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWhtRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("savings_wht_rule")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ─────────── Auto-collection config ─────────── */

export const getAutoCollectionConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await currentCompanyId(context.supabase);
    const { data, error } = await (context.supabase as any)
      .from("savings_auto_collection_config")
      .select("*")
      .eq("company_id", cid)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;
    // Auto-create default if missing (fresh company)
    const { data: created, error: cerr } = await (context.supabase as any)
      .from("savings_auto_collection_config")
      .insert({ company_id: cid })
      .select()
      .single();
    if (cerr) throw new Error(cerr.message);
    return created;
  });

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const configSchema = z.object({
  morning_enabled: z.boolean(),
  morning_time: z.string().regex(timeRe, "Use HH:MM"),
  afternoon_enabled: z.boolean(),
  afternoon_time: z.string().regex(timeRe, "Use HH:MM"),
  timezone_override: z.string().max(60).nullable().optional(),
  max_retries: z.number().int().min(0).max(5),
});

export const updateAutoCollectionConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => configSchema.parse(d))
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase);
    const payload = {
      ...data,
      // Persist HH:MM as HH:MM:00 for time column
      morning_time: `${data.morning_time}:00`,
      afternoon_time: `${data.afternoon_time}:00`,
      timezone_override: data.timezone_override || null,
    };
    const { error } = await (context.supabase as any)
      .from("savings_auto_collection_config")
      .update(payload)
      .eq("company_id", cid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
