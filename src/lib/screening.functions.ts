import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  name: z.string().trim().min(1),
  customer_id: z.string().trim().min(1),
});

export type ScreeningMatch = {
  list_type: string;
  ref: string;
  score?: number;
};

export type ScreeningResult = {
  direct_matches: ScreeningMatch[];
  fuzzy_matches: ScreeningMatch[];
};

export const screenCustomer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<ScreeningResult> => {
    const token = process.env.FIUSL_SCREENING_TOKEN;
    if (!token) {
      throw new Error("FIUSL_SCREENING_TOKEN is not configured");
    }
    const res = await fetch("https://fiusl-screening.web.lk/api/screen", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Screening failed [${res.status}]: ${body}`);
    }
    const json = (await res.json()) as ScreeningResult;
    return {
      direct_matches: Array.isArray(json.direct_matches) ? json.direct_matches : [],
      fuzzy_matches: Array.isArray(json.fuzzy_matches) ? json.fuzzy_matches : [],
    };
  });

// ─────────── Screening thresholds (per company) ───────────

export type ScreeningConfig = {
  tier1_min_score: number;
  tier2_min_score: number;
  auto_escalate_direct: boolean;
};

export const getScreeningConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ScreeningConfig> => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");
    const { data, error } = await supabase
      .from("screening_config")
      .select("tier1_min_score, tier2_min_score, auto_escalate_direct")
      .eq("company_id", cid as string)
      .maybeSingle();
    if (error) throw error;
    return {
      tier1_min_score: Number(data?.tier1_min_score ?? 60),
      tier2_min_score: Number(data?.tier2_min_score ?? 85),
      auto_escalate_direct: data?.auto_escalate_direct ?? true,
    };
  });

export const saveScreeningConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tier1_min_score: z.number().min(0).max(100),
      tier2_min_score: z.number().min(0).max(100),
      auto_escalate_direct: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");
    if (data.tier2_min_score < data.tier1_min_score) {
      throw new Error("Tier 2 threshold must be greater than or equal to Tier 1");
    }
    const { error } = await supabase
      .from("screening_config")
      .upsert(
        {
          company_id: cid as string,
          tier1_min_score: data.tier1_min_score,
          tier2_min_score: data.tier2_min_score,
          auto_escalate_direct: data.auto_escalate_direct,
        },
        { onConflict: "company_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

// ─────────── Tiering + approval routing ───────────

export type ScreeningTier = "clear" | "tier1" | "tier2";

export function classifyScreening(
  result: ScreeningResult,
  cfg: ScreeningConfig,
): { tier: ScreeningTier; maxScore: number; hasDirect: boolean } {
  const hasDirect = result.direct_matches.length > 0;
  const maxScore = result.fuzzy_matches.reduce(
    (m, x) => (typeof x.score === "number" && x.score > m ? x.score : m),
    0,
  );
  if (hasDirect && cfg.auto_escalate_direct) return { tier: "tier2", maxScore, hasDirect };
  if (maxScore >= cfg.tier2_min_score) return { tier: "tier2", maxScore, hasDirect };
  if (hasDirect || maxScore >= cfg.tier1_min_score) return { tier: "tier1", maxScore, hasDirect };
  return { tier: "clear", maxScore, hasDirect };
}

export const requestScreeningApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tier: z.enum(["tier1", "tier2"]),
      customer_name: z.string().min(1),
      national_id: z.string().min(1),
      max_score: z.number().min(0).max(100),
      has_direct: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    const companyId = cid as string | null;
    if (!companyId) throw new Error("No active company");

    const txType = data.tier === "tier2" ? "customer_screening_tier2" : "customer_screening_tier1";

    const { data: wf, error: wErr } = await supabase
      .from("workflow_definition")
      .select("id")
      .eq("company_id", companyId)
      .eq("transaction_type", txType)
      .eq("is_enabled", true)
      .maybeSingle();
    if (wErr) throw wErr;
    if (!wf) throw new Error(`No active workflow configured for "${txType}". Add one in Administration → Workflows.`);

    const label = `Screening: ${data.customer_name} (${data.national_id}) — ${data.has_direct ? "direct hit" : `score ${data.max_score.toFixed(1)}`}`;
    const { data: inst, error } = await supabase
      .from("workflow_instance")
      .insert({
        workflow_id: wf.id,
        company_id: companyId,
        transaction_type: txType,
        reference_id: null,
        reference_label: label,
        amount: data.max_score,
        initiated_by: userId,
        current_step: 1,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, instance_id: inst.id, tx_type: txType };
  });
