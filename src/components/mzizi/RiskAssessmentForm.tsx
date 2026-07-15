import { useMemo } from "react";
import type { RiskScheme, RiskFactor, RiskBandLevel } from "@/lib/risk.functions";
import { cn } from "@/lib/utils";

export type RiskAnswer = { factor_id: string; option_ids: string[] };

const BAND_TONE: Record<RiskBandLevel, string> = {
  low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  high: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

export function computeRisk(scheme: RiskScheme, answers: RiskAnswer[]) {
  const activeFactors = scheme.factors.filter((f) => f.active);
  const optById = new Map<string, { factor_id: string; score: number }>();
  for (const f of activeFactors) for (const o of f.options) if (o.active) optById.set(o.id, { factor_id: f.id, score: Number(o.score) });

  let total = 0;
  const answeredIds = new Set<string>();
  for (const a of answers) {
    answeredIds.add(a.factor_id);
    for (const oid of a.option_ids) {
      const o = optById.get(oid);
      if (o) total += o.score;
    }
  }
  let max = 0;
  for (const f of activeFactors) {
    if (!answeredIds.has(f.id)) continue;
    const scores = f.options.filter((o) => o.active).map((o) => Number(o.score));
    if (!scores.length) continue;
    max += f.multi_select ? scores.reduce((a, b) => a + b, 0) : Math.max(...scores);
  }
  const pct = max > 0 ? (total / max) * 100 : 0;
  let band: RiskBandLevel = "low";
  const bands = scheme.bands.slice().sort((a, b) => Number(a.min_pct) - Number(b.min_pct));
  for (const b of bands) if (pct >= Number(b.min_pct) && pct <= Number(b.max_pct)) { band = b.band; break; }
  if (pct > 55) band = "high"; else if (pct > 40 && band === "low") band = "medium";
  return { total, max, pct, band };
}

export function applicableFactors(scheme: RiskScheme, clientCategory: "individual" | "corporate" | null): RiskFactor[] {
  return scheme.factors
    .filter((f) => f.active)
    .filter((f) => f.applies_to === "both" || !clientCategory || f.applies_to === clientCategory)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function RiskAssessmentForm({
  scheme,
  answers,
  onChange,
  clientCategoryHint,
}: {
  scheme: RiskScheme;
  answers: RiskAnswer[];
  onChange: (a: RiskAnswer[]) => void;
  clientCategoryHint?: "individual" | "corporate" | null;
}) {
  // Derive current category from the client_category factor selection (if any).
  const categoryFactor = scheme.factors.find((f) => f.code === "client_category");
  const catAnswer = answers.find((a) => a.factor_id === categoryFactor?.id);
  const catLabel = categoryFactor?.options.find((o) => o.id === catAnswer?.option_ids[0])?.label?.toLowerCase();
  const category: "individual" | "corporate" | null =
    catLabel?.includes("corporate") ? "corporate" : catLabel?.includes("individual") ? "individual" : clientCategoryHint ?? null;

  const factors = useMemo(() => applicableFactors(scheme, category), [scheme, category]);
  const { total, max, pct, band } = useMemo(() => computeRisk(scheme, answers), [scheme, answers]);

  function toggle(factor: RiskFactor, optionId: string) {
    const others = answers.filter((a) => a.factor_id !== factor.id);
    const existing = answers.find((a) => a.factor_id === factor.id);
    if (factor.multi_select) {
      const cur = existing?.option_ids ?? [];
      const next = cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId];
      if (next.length === 0) onChange(others);
      else onChange([...others, { factor_id: factor.id, option_ids: next }]);
    } else {
      onChange([...others, { factor_id: factor.id, option_ids: [optionId] }]);
    }
  }

  const missing = factors.filter((f) => !answers.find((a) => a.factor_id === f.id && a.option_ids.length > 0));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-border bg-card p-4 flex flex-wrap items-center gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">Score</div>
          <div className="font-mono text-lg font-semibold">{total.toFixed(1)} / {max.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">Risk %</div>
          <div className="font-mono text-lg font-semibold">{pct.toFixed(2)}%</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">Risk level</div>
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border", BAND_TONE[band])}>
            {band.toUpperCase()}
          </span>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">Completion</div>
          <div className="text-sm">{factors.length - missing.length} / {factors.length} factors</div>
        </div>
      </div>

      {factors.map((f) => {
        const cur = answers.find((a) => a.factor_id === f.id)?.option_ids ?? [];
        return (
          <div key={f.id} className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-sm font-semibold">{f.label}</div>
              {f.multi_select && <span className="text-[10px] rounded-full bg-primary/10 text-primary px-1.5 py-0.5 uppercase">multi</span>}
              {cur.length === 0 && <span className="text-[10px] rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5 uppercase">required</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {f.options.filter((o) => o.active).map((o) => {
                const selected = cur.includes(o.id);
                return (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => toggle(f, o.id)}
                    className={cn(
                      "text-left flex items-center gap-3 px-3 py-2 rounded-md border text-[13px] transition-colors",
                      selected ? "border-primary bg-primary/5" : "border-border hover:bg-row-hover",
                    )}
                  >
                    <span className={cn(
                      "w-4 h-4 shrink-0 flex items-center justify-center border",
                      f.multi_select ? "rounded" : "rounded-full",
                      selected ? "bg-primary border-primary text-primary-foreground" : "border-border",
                    )}>
                      {selected && <span className="text-[10px]">✓</span>}
                    </span>
                    <span className="flex-1 min-w-0">{o.label}</span>
                    <span className={cn("text-[10px] rounded-full px-1.5 py-0.5 border shrink-0", BAND_TONE[o.band])}>
                      {o.band.toUpperCase()} · {Number(o.score)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
