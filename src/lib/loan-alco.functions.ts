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

/** Insert a new version (closes any currently-active version at the given effective_from). */
export const upsertLoanAlcoRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
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
    return { ok: true, id: newId as string };
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
      .select("id, min_rate, max_rate, min_period_months, max_period_months, active, effective_from, effective_to, note, created_by, created_at, security_type_id, equipment_vehicle, creator:created_by(full_name, email)")
      .eq("product_id", data.product_id)
      .order("effective_from", { ascending: false });
    if (data.security_type_id) q = q.eq("security_type_id", data.security_type_id);
    else q = q.is("security_type_id", null);
    const ev = (data.equipment_vehicle ?? "").trim();
    if (ev) q = q.ilike("equipment_vehicle", ev);
    else q = q.is("equipment_vehicle", null);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

