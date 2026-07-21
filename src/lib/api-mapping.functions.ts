// Server functions for the Field Mapping Studio.
//
// Deterministic matcher runs first (token overlap + Levenshtein on names +
// labels + type compatibility). AI Gateway is an opt-in fallback that only
// receives field NAME, LABEL, TYPE, DESCRIPTION — never customer data.
// Every AI suggestion carries a confidence score and requires user approval.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { API_CONTRACTS, type ApiResource } from "@/lib/api-contract";

type Env = "sandbox" | "production";

// ---------- Deterministic matcher (no PII, runs on server) ----------

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[._\-/]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length,
    n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

function normalizedEdit(a: string, b: string): number {
  const l = Math.max(a.length, b.length);
  return l === 0 ? 1 : 1 - levenshtein(a, b) / l;
}

function typeCompat(sourceType: string | undefined, targetType: string): number {
  if (!sourceType) return 0.5;
  const s = sourceType.toLowerCase();
  const t = targetType.toLowerCase();
  if (s === t) return 1;
  const groups = [
    ["string", "text", "varchar"],
    ["number", "int", "integer", "float", "double", "decimal"],
    ["date", "datetime", "timestamp"],
    ["bool", "boolean"],
    ["uuid", "string"],
  ];
  for (const g of groups) if (g.includes(s) && g.includes(t)) return 0.9;
  return 0.3;
}

export type SourceField = {
  name: string;
  label?: string;
  type?: string;
  description?: string;
  example?: string;
};

export type MappingSuggestion = {
  sourceName: string;
  targetPath: string;
  targetLabel: string;
  targetType: string;
  confidence: number; // 0..1
  method: "deterministic" | "ai";
  reason: string;
};

function scoreMatch(
  src: SourceField,
  tgt: { path: string; label: string; type: string },
): { score: number; reason: string } {
  const srcTokens = new Set([
    ...tokenize(src.name),
    ...(src.label ? tokenize(src.label) : []),
  ]);
  const tgtTokens = new Set([...tokenize(tgt.path), ...tokenize(tgt.label)]);
  let overlap = 0;
  for (const t of srcTokens) if (tgtTokens.has(t)) overlap++;
  const jaccard =
    overlap / (srcTokens.size + tgtTokens.size - overlap || 1);
  const edit = Math.max(
    normalizedEdit(src.name.toLowerCase(), tgt.path.toLowerCase()),
    src.label ? normalizedEdit(src.label.toLowerCase(), tgt.label.toLowerCase()) : 0,
  );
  const typeScore = typeCompat(src.type, tgt.type);
  const score = 0.55 * jaccard + 0.3 * edit + 0.15 * typeScore;
  const reason = `token=${overlap}/${srcTokens.size + tgtTokens.size - overlap}, edit=${edit.toFixed(2)}, type=${typeScore.toFixed(2)}`;
  return { score, reason };
}

// ---------- Server fns ----------

export const listMappingTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ env: z.enum(["sandbox", "production"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("api_mapping_template")
      .select(
        "id, name, description, target_resource, status, field_mappings, transformations, created_at, updated_at",
      )
      .eq("env", data.env)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { templates: rows ?? [] };
  });

const MappingRowSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  transform: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  method: z.enum(["deterministic", "ai", "manual"]).optional(),
});

export const saveMappingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        env: z.enum(["sandbox", "production"]),
        name: z.string().min(2).max(80),
        description: z.string().max(500).optional(),
        target_resource: z.string().min(2).max(60),
        status: z.enum(["draft", "active", "archived"]).default("draft"),
        field_mappings: z.array(MappingRowSchema).min(1),
        source_sample: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: staff } = await supabase
      .from("staff")
      .select("user_id, branch:branch_id(company_id)")
      .eq("user_id", context.userId)
      .maybeSingle();
    const company_id = (staff?.branch as { company_id?: string } | null)?.company_id;
    if (!company_id) throw new Error("No company context");
    const payload: Record<string, unknown> = {
      company_id,
      env: data.env,
      name: data.name,
      description: data.description ?? null,
      target_resource: data.target_resource,
      status: data.status,
      field_mappings: data.field_mappings,
      source_sample: data.source_sample ?? null,
      transformations: [],
      created_by: staff?.user_id ?? context.userId,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabase
        .from("api_mapping_template")
        .update(payload)
        .eq("id", data.id)
        .eq("env", data.env);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("api_mapping_template")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteMappingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), env: z.enum(["sandbox", "production"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("api_mapping_template")
      .delete()
      .eq("id", data.id)
      .eq("env", data.env);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const suggestFieldMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        contractId: z.string().min(1),
        sourceFields: z
          .array(
            z.object({
              name: z.string().min(1),
              label: z.string().optional(),
              type: z.string().optional(),
              description: z.string().max(300).optional(),
              example: z.string().max(200).optional(),
            }),
          )
          .min(1)
          .max(200),
        useAiFallback: z.boolean().default(false),
        confidenceFloor: z.number().min(0).max(1).default(0.55),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const contract = API_CONTRACTS.find((c) => c.id === data.contractId);
    if (!contract) throw new Error(`Unknown contract ${data.contractId}`);
    // Target = inbound fields (fields the customer must supply to us).
    const targets = contract.fields
      .filter((f) => f.inbound !== false)
      .map((f) => ({ path: f.path, label: f.label, type: f.type }));

    const deterministic: MappingSuggestion[] = [];
    const unresolved: SourceField[] = [];

    for (const src of data.sourceFields) {
      let best: { t: (typeof targets)[number]; score: number; reason: string } | null = null;
      for (const t of targets) {
        const { score, reason } = scoreMatch(src, t);
        if (!best || score > best.score) best = { t, score, reason };
      }
      if (best && best.score >= data.confidenceFloor) {
        deterministic.push({
          sourceName: src.name,
          targetPath: best.t.path,
          targetLabel: best.t.label,
          targetType: best.t.type,
          confidence: Math.round(best.score * 100) / 100,
          method: "deterministic",
          reason: best.reason,
        });
      } else {
        unresolved.push(src);
      }
    }

    let aiSuggestions: MappingSuggestion[] = [];
    let aiError: string | null = null;
    if (data.useAiFallback && unresolved.length > 0) {
      try {
        aiSuggestions = await runAiFallback(unresolved, targets);
      } catch (e) {
        aiError = e instanceof Error ? e.message : String(e);
      }
    }

    const allSuggested = new Set([
      ...deterministic.map((s) => s.sourceName),
      ...aiSuggestions.map((s) => s.sourceName),
    ]);
    const stillUnresolved = data.sourceFields
      .filter((s) => !allSuggested.has(s.name))
      .map((s) => s.name);

    return {
      contract: { id: contract.id, title: contract.title, resource: contract.resource as ApiResource },
      suggestions: [...deterministic, ...aiSuggestions],
      unresolved: stillUnresolved,
      aiUsed: data.useAiFallback,
      aiError,
    };
  });

async function runAiFallback(
  sources: SourceField[],
  targets: { path: string; label: string; type: string }[],
): Promise<MappingSuggestion[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI Gateway not configured");

  // PII guardrail: strip anything that looks like a value/example.
  const safeSources = sources.map((s) => ({
    name: s.name,
    label: s.label ?? "",
    type: s.type ?? "string",
    description: (s.description ?? "").slice(0, 200),
  }));

  const system = `You map source data fields to a fixed target schema.
Only use field NAMES, LABELS, TYPES and DESCRIPTIONS — never invent or repeat sample values.
For each source field pick the SINGLE best target from the provided list, or return null if none is a reasonable match.
Return strict JSON: { "matches": [{ "source": string, "target": string|null, "confidence": number 0..1, "reason": string }] }.
Confidence must reflect only name/label/type similarity, never guesses about business context.`;

  const user = JSON.stringify({ sources: safeSources, targets });

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("AI rate limit reached");
  if (res.status === 402) throw new Error("AI credits exhausted");
  if (!res.ok) throw new Error(`AI Gateway ${res.status}`);

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: { matches?: { source: string; target: string | null; confidence: number; reason: string }[] } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }
  const targetIndex = new Map(targets.map((t) => [t.path, t]));
  const out: MappingSuggestion[] = [];
  for (const m of parsed.matches ?? []) {
    if (!m.target) continue;
    const t = targetIndex.get(m.target);
    if (!t) continue;
    out.push({
      sourceName: m.source,
      targetPath: t.path,
      targetLabel: t.label,
      targetType: t.type,
      confidence: Math.max(0, Math.min(1, Number(m.confidence) || 0)),
      method: "ai",
      reason: (m.reason || "").slice(0, 200),
    });
  }
  return out;
}
