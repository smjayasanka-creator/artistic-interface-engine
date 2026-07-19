import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function currentCompanyId(supabase: any) {
  const { data, error } = await supabase.rpc("current_company_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No company for current user");
  return data as string;
}

/* ---------------- Section master ---------------- */

export const listEvaluationSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("evaluation_section")
      .select("*")
      .eq("active", true)
      .order("display_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const fieldSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(120),
  type: z.string(),
  optional: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

const upsertSectionSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  description: z.string().optional().nullable(),
  component_name: z.string().default("generic"),
  display_order: z.number().int().default(0),
  active: z.boolean().default(true),
  fields: z.array(fieldSchema).default([]),
});

export const upsertEvaluationSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSectionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const company_id = await currentCompanyId(context.supabase);
    const { error } = await context.supabase
      .from("evaluation_section")
      .upsert({ ...data, company_id }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Product mapping ---------------- */

export const getProductEvaluationConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { loan_product_id: string }) =>
    z.object({ loan_product_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [{ data: sections, error: sErr }, { data: mapping, error: mErr }] = await Promise.all([
      context.supabase
        .from("evaluation_section")
        .select("*")
        .eq("active", true)
        .order("display_order", { ascending: true }),
      context.supabase
        .from("loan_product_evaluation_section")
        .select("*")
        .eq("loan_product_id", data.loan_product_id),
    ]);
    if (sErr) throw new Error(sErr.message);
    if (mErr) throw new Error(mErr.message);
    return { sections: sections ?? [], mapping: mapping ?? [] };
  });

const mappingRowSchema = z.object({
  section_id: z.string().uuid(),
  is_visible: z.boolean(),
  is_mandatory: z.boolean(),
  display_order: z.number().int(),
  enabled_fields: z.array(z.string()).nullable(),
});

const upsertMappingSchema = z.object({
  loan_product_id: z.string().uuid(),
  rows: z.array(mappingRowSchema),
});

export const upsertProductEvaluationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertMappingSchema.parse(d))
  .handler(async ({ data, context }) => {
    const company_id = await currentCompanyId(context.supabase);
    // Replace strategy: delete then insert
    const { error: delErr } = await context.supabase
      .from("loan_product_evaluation_section")
      .delete()
      .eq("loan_product_id", data.loan_product_id);
    if (delErr) throw new Error(delErr.message);
    if (data.rows.length) {
      const payload = data.rows.map((r) => ({
        ...r,
        company_id,
        loan_product_id: data.loan_product_id,
      }));
      const { error } = await context.supabase
        .from("loan_product_evaluation_section")
        .insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* ---------------- Per-loan evaluation data ---------------- */

export const getLoanEvaluation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { loan_id?: string; loan_product_id?: string }) =>
    z
      .object({
        loan_id: z.string().uuid().optional(),
        loan_product_id: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let productId = data.loan_product_id ?? null;
    let existing: any = null;
    if (data.loan_id) {
      const { data: row } = await context.supabase
        .from("loan_evaluation")
        .select("*")
        .eq("loan_id", data.loan_id)
        .maybeSingle();
      existing = row;
      if (!productId) {
        const { data: loan } = await context.supabase
          .from("loan")
          .select("product_id")
          .eq("id", data.loan_id)
          .maybeSingle();
        productId = loan?.product_id ?? null;
      }
    }

    // If we have a snapshot, use it
    if (existing?.product_snapshot) {
      return {
        sections: existing.product_snapshot.sections ?? [],
        data: existing.data ?? {},
        from_snapshot: true,
      };
    }

    // Otherwise build from current product mapping
    if (!productId) return { sections: [], data: existing?.data ?? {}, from_snapshot: false };

    const [{ data: sections }, { data: mapping }] = await Promise.all([
      context.supabase
        .from("evaluation_section")
        .select("*")
        .eq("active", true)
        .order("display_order", { ascending: true }),
      context.supabase
        .from("loan_product_evaluation_section")
        .select("*")
        .eq("loan_product_id", productId),
    ]);

    const map = new Map((mapping ?? []).map((m: any) => [m.section_id, m]));
    const composed = (sections ?? [])
      .map((s: any) => {
        const m: any = map.get(s.id);
        if (!m || !m.is_visible) return null;
        const enabled: string[] | null = m.enabled_fields ?? null;
        const fields = (s.fields ?? []).filter((f: any) => !enabled || enabled.includes(f.key));
        return {
          section_id: s.id,
          code: s.code,
          name: s.name,
          description: s.description,
          component_name: s.component_name,
          display_order: m.display_order ?? s.display_order,
          is_mandatory: m.is_mandatory,
          fields,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.display_order - b.display_order);

    return { sections: composed, data: existing?.data ?? {}, from_snapshot: false };
  });

const saveEvalSchema = z.object({
  loan_id: z.string().uuid(),
  data: z.record(z.string(), z.record(z.string(), z.any())),
});

export const saveLoanEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveEvalSchema.parse(d))
  .handler(async ({ data, context }) => {
    const company_id = await currentCompanyId(context.supabase);

    const { data: existing } = await context.supabase
      .from("loan_evaluation")
      .select("id, product_snapshot")
      .eq("loan_id", data.loan_id)
      .maybeSingle();

    let snapshot = existing?.product_snapshot ?? null;
    if (!snapshot) {
      const { data: loan } = await context.supabase
        .from("loan")
        .select("product_id")
        .eq("id", data.loan_id)
        .maybeSingle();
      if (loan?.product_id) {
        const [{ data: sections }, { data: mapping }] = await Promise.all([
          context.supabase
            .from("evaluation_section")
            .select("*")
            .eq("active", true)
            .order("display_order", { ascending: true }),
          context.supabase
            .from("loan_product_evaluation_section")
            .select("*")
            .eq("loan_product_id", loan.product_id),
        ]);
        const map = new Map((mapping ?? []).map((m: any) => [m.section_id, m]));
        const composed = (sections ?? [])
          .map((s: any) => {
            const m: any = map.get(s.id);
            if (!m || !m.is_visible) return null;
            const enabled: string[] | null = m.enabled_fields ?? null;
            const fields = (s.fields ?? []).filter((f: any) => !enabled || enabled.includes(f.key));
            return {
              section_id: s.id,
              code: s.code,
              name: s.name,
              component_name: s.component_name,
              display_order: m.display_order ?? s.display_order,
              is_mandatory: m.is_mandatory,
              fields,
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => a.display_order - b.display_order);
        snapshot = { sections: composed };
      }
    }

    const payload: any = {
      loan_id: data.loan_id,
      company_id,
      data: data.data,
      product_snapshot: snapshot,
    };
    if (existing?.id) payload.id = existing.id;

    const { error } = await context.supabase
      .from("loan_evaluation")
      .upsert(payload, { onConflict: "loan_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
