import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  security_type_id: z.string().uuid().nullable().optional(),
  equipment_vehicle: z.string().trim().max(200).nullable().optional(),
  min_rate: z.number().min(0).max(100),
  max_rate: z.number().min(0).max(100),
  min_period_months: z.number().int().min(0),
  max_period_months: z.number().int().min(0),
  active: z.boolean().optional(),
}).refine((v) => v.max_rate >= v.min_rate, { message: "Max rate must be ≥ min rate" })
  .refine((v) => v.max_period_months >= v.min_period_months, { message: "Max period must be ≥ min period" });

export const listLoanAlcoRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("loan_alco_rate")
      .select("id, product_id, security_type_id, equipment_vehicle, min_rate, max_rate, min_period_months, max_period_months, active, product:product_id(name), security:security_type_id(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const upsertLoanAlcoRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    const companyId = cid as string | null;
    if (!companyId) throw new Error("No active company");

    const payload = {
      company_id: companyId,
      product_id: data.product_id,
      security_type_id: data.security_type_id ?? null,
      equipment_vehicle: data.equipment_vehicle?.trim() || null,
      min_rate: data.min_rate,
      max_rate: data.max_rate,
      min_period_months: data.min_period_months,
      max_period_months: data.max_period_months,
      active: data.active ?? true,
    };

    if (data.id) {
      const { error } = await supabase.from("loan_alco_rate").update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabase.from("loan_alco_rate").insert(payload).select("id").single();
    if (error) throw error;
    return { ok: true, id: row.id };
  });

export const deleteLoanAlcoRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("loan_alco_rate").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
