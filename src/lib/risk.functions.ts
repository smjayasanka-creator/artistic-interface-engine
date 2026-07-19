import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Types ──────────────────────────────────────────────────────────────────

export type RiskBandLevel = "low" | "medium" | "high";
export type RiskAppliesTo = "both" | "individual" | "corporate";

export type RiskOption = {
  id: string;
  factor_id: string;
  label: string;
  band: RiskBandLevel;
  score: number;
  sort_order: number;
  active: boolean;
};

export type RiskFactor = {
  id: string;
  company_id: string;
  code: string;
  label: string;
  applies_to: RiskAppliesTo;
  multi_select: boolean;
  sort_order: number;
  active: boolean;
  options: RiskOption[];
};

export type RiskBandRow = {
  id: string;
  band: RiskBandLevel;
  min_pct: number;
  max_pct: number;
};

export type RiskScheme = {
  factors: RiskFactor[];
  bands: RiskBandRow[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getCompanyId(ctx: { supabase: any; userId: string }) {
  const { data: staff } = await ctx.supabase
    .from("staff")
    .select("id, branch:branch_id(company_id)")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const companyId = (staff as any)?.branch?.company_id ?? null;
  if (!companyId) throw new Error("No company context");
  return { companyId: companyId as string, staffId: staff?.id ?? null };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export const getRiskScheme = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RiskScheme> => {
    const { supabase } = context;
    const { companyId } = await getCompanyId(context);

    let { data: factors } = await supabase
      .from("risk_factor")
      .select("*")
      .eq("company_id", companyId)
      .order("sort_order");

    if (!factors || factors.length === 0) {
      await supabase.rpc("seed_default_risk_scheme", { _company_id: companyId });
      const reload = await supabase
        .from("risk_factor")
        .select("*")
        .eq("company_id", companyId)
        .order("sort_order");
      factors = reload.data ?? [];
    }

    const factorIds = (factors ?? []).map((f: any) => f.id);
    const { data: options } = factorIds.length
      ? await supabase
          .from("risk_option")
          .select("*")
          .in("factor_id", factorIds)
          .order("sort_order")
      : { data: [] as any[] };

    const { data: bands } = await supabase
      .from("risk_band")
      .select("*")
      .eq("company_id", companyId)
      .order("min_pct");

    const byFactor = new Map<string, RiskOption[]>();
    for (const o of options ?? []) {
      const arr = byFactor.get(o.factor_id) ?? [];
      arr.push(o as any);
      byFactor.set(o.factor_id, arr);
    }
    return {
      factors: (factors ?? []).map((f: any) => ({ ...f, options: byFactor.get(f.id) ?? [] })),
      bands: (bands ?? []) as any,
    };
  });

export const getClientRiskAssessment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { client_id: string }) => z.object({ client_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase
      .from("client_risk_assessment")
      .select("*")
      .eq("client_id", data.client_id)
      .maybeSingle();
    return row ?? null;
  });

// ─── Admin CRUD ─────────────────────────────────────────────────────────────

const factorInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(200),
  applies_to: z.enum(["both", "individual", "corporate"]),
  multi_select: z.boolean(),
  sort_order: z.number().int().min(0).max(9999),
  active: z.boolean(),
});

export const upsertRiskFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof factorInput>) => factorInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { companyId } = await getCompanyId(context);
    if (data.id) {
      const { error } = await supabase
        .from("risk_factor")
        .update({
          code: data.code,
          label: data.label,
          applies_to: data.applies_to,
          multi_select: data.multi_select,
          sort_order: data.sort_order,
          active: data.active,
        })
        .eq("id", data.id)
        .eq("company_id", companyId);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("risk_factor")
      .insert({
        company_id: companyId,
        code: data.code,
        label: data.label,
        applies_to: data.applies_to,
        multi_select: data.multi_select,
        sort_order: data.sort_order,
        active: data.active,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const deleteRiskFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { companyId } = await getCompanyId(context);
    const { error } = await context.supabase
      .from("risk_factor")
      .delete()
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw error;
    return { ok: true };
  });

const optionInput = z.object({
  id: z.string().uuid().optional(),
  factor_id: z.string().uuid(),
  label: z.string().trim().min(1).max(200),
  band: z.enum(["low", "medium", "high"]),
  score: z.number().min(0).max(1000),
  sort_order: z.number().int().min(0).max(9999),
  active: z.boolean(),
});

export const upsertRiskOption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof optionInput>) => optionInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    if (data.id) {
      const { error } = await supabase
        .from("risk_option")
        .update({
          label: data.label,
          band: data.band,
          score: data.score,
          sort_order: data.sort_order,
          active: data.active,
        })
        .eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("risk_option")
      .insert({
        factor_id: data.factor_id,
        label: data.label,
        band: data.band,
        score: data.score,
        sort_order: data.sort_order,
        active: data.active,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const deleteRiskOption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("risk_option").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const bandInput = z.object({
  band: z.enum(["low", "medium", "high"]),
  min_pct: z.number().min(0).max(100),
  max_pct: z.number().min(0).max(100),
});

export const upsertRiskBand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof bandInput>) => bandInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { companyId } = await getCompanyId(context);
    if (data.max_pct < data.min_pct) throw new Error("max_pct must be >= min_pct");
    const { data: existing } = await supabase
      .from("risk_band")
      .select("id")
      .eq("company_id", companyId)
      .eq("band", data.band)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("risk_band")
        .update({ min_pct: data.min_pct, max_pct: data.max_pct })
        .eq("id", (existing as any).id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("risk_band")
        .insert({
          company_id: companyId,
          band: data.band,
          min_pct: data.min_pct,
          max_pct: data.max_pct,
        });
      if (error) throw error;
    }
    return { ok: true };
  });

// ─── Client assessment save ─────────────────────────────────────────────────

const answerInput = z.object({
  factor_id: z.string().uuid(),
  option_ids: z.array(z.string().uuid()).min(1),
});
const saveInput = z.object({
  client_id: z.string().uuid(),
  answers: z.array(answerInput).min(1),
});

export const saveClientRiskAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof saveInput>) => saveInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { companyId, staffId } = await getCompanyId(context);

    // Load factors + options in this company
    const { data: factors } = await supabase
      .from("risk_factor")
      .select("id, applies_to, multi_select, active")
      .eq("company_id", companyId)
      .eq("active", true);
    const factorMap = new Map((factors ?? []).map((f: any) => [f.id, f]));

    const optionIds = data.answers.flatMap((a) => a.option_ids);
    const { data: opts } = await supabase
      .from("risk_option")
      .select("id, factor_id, score, band")
      .in("id", optionIds);
    const optMap = new Map((opts ?? []).map((o: any) => [o.id, o]));

    let totalScore = 0;
    for (const ans of data.answers) {
      const factor = factorMap.get(ans.factor_id) as any;
      if (!factor) throw new Error("Unknown factor in assessment");
      if (!factor.multi_select && ans.option_ids.length > 1) {
        throw new Error("Single-select factor received multiple options");
      }
      for (const oid of ans.option_ids) {
        const o = optMap.get(oid) as any;
        if (!o || o.factor_id !== ans.factor_id) throw new Error("Invalid option for factor");
        totalScore += Number(o.score);
      }
    }

    // Compute max score = sum over active applicable factors of their max option score
    // (or sum of all option scores for multi-select).
    const allFactorIds = (factors ?? []).map((f: any) => f.id);
    const { data: allOpts } = allFactorIds.length
      ? await supabase
          .from("risk_option")
          .select("factor_id, score, active")
          .in("factor_id", allFactorIds)
          .eq("active", true)
      : { data: [] as any[] };
    const answeredFactors = new Set(data.answers.map((a) => a.factor_id));
    let maxScore = 0;
    for (const f of factors ?? []) {
      if (!answeredFactors.has(f.id)) continue;
      const os = (allOpts ?? [])
        .filter((o: any) => o.factor_id === f.id)
        .map((o: any) => Number(o.score));
      if (!os.length) continue;
      maxScore += (f as any).multi_select
        ? os.reduce((a: number, b: number) => a + b, 0)
        : Math.max(...os);
    }
    const pct = maxScore > 0 ? Number(((totalScore / maxScore) * 100).toFixed(2)) : 0;

    const { data: bands } = await supabase
      .from("risk_band")
      .select("band, min_pct, max_pct")
      .eq("company_id", companyId);
    let band: RiskBandLevel = "low";
    for (const b of bands ?? []) {
      if (pct >= Number(b.min_pct) && pct <= Number(b.max_pct)) {
        band = b.band as RiskBandLevel;
        break;
      }
    }
    if (pct > 55) band = "high";
    else if (pct > 40) band = band === "low" ? "medium" : band;

    const { data: existing } = await supabase
      .from("client_risk_assessment")
      .select("id")
      .eq("client_id", data.client_id)
      .maybeSingle();

    const row = {
      client_id: data.client_id,
      company_id: companyId,
      total_score: totalScore,
      max_score: maxScore,
      pct,
      band,
      answers: data.answers as any,
      assessed_by: staffId,
      assessed_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase
        .from("client_risk_assessment")
        .update(row)
        .eq("id", (existing as any).id);
      if (error) throw error;
      return { ...row, id: (existing as any).id };
    }
    const { data: inserted, error } = await supabase
      .from("client_risk_assessment")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { ...row, id: (inserted as any).id };
  });
