import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import {
  getRiskScheme,
  upsertRiskFactor,
  deleteRiskFactor,
  upsertRiskOption,
  deleteRiskOption,
  upsertRiskBand,
  type RiskAppliesTo,
  type RiskBandLevel,
} from "@/lib/risk.functions";
import { Card } from "@/components/mzizi/Card";
import { inputCls, selectCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";

const BANDS: RiskBandLevel[] = ["low", "medium", "high"];
const APPLIES: RiskAppliesTo[] = ["both", "individual", "corporate"];

export function RiskProfilingTab() {
  const qc = useQueryClient();
  const fetchScheme = useServerFn(getRiskScheme);
  const { data: scheme } = useQuery({ queryKey: ["risk-scheme"], queryFn: () => fetchScheme() });

  const upFactor = useMutation({ mutationFn: useServerFn(upsertRiskFactor), onSuccess: () => qc.invalidateQueries({ queryKey: ["risk-scheme"] }), onError: (e: Error) => toast.error(e.message) });
  const delFactor = useMutation({ mutationFn: useServerFn(deleteRiskFactor), onSuccess: () => qc.invalidateQueries({ queryKey: ["risk-scheme"] }), onError: (e: Error) => toast.error(e.message) });
  const upOption = useMutation({ mutationFn: useServerFn(upsertRiskOption), onSuccess: () => qc.invalidateQueries({ queryKey: ["risk-scheme"] }), onError: (e: Error) => toast.error(e.message) });
  const delOption = useMutation({ mutationFn: useServerFn(deleteRiskOption), onSuccess: () => qc.invalidateQueries({ queryKey: ["risk-scheme"] }), onError: (e: Error) => toast.error(e.message) });
  const upBand = useMutation({ mutationFn: useServerFn(upsertRiskBand), onSuccess: () => qc.invalidateQueries({ queryKey: ["risk-scheme"] }), onError: (e: Error) => toast.error(e.message) });

  if (!scheme) return <Card className="p-6 text-sm text-muted-foreground">Loading risk scheme…</Card>;

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">Risk bands</div>
            <div className="text-[11.5px] text-muted-foreground">Total risk % is bucketed into these bands.</div>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {BANDS.map((b) => {
            const row = scheme.bands.find((x) => x.band === b);
            return (
              <BandEditor key={b} band={b} minPct={row?.min_pct ?? 0} maxPct={row?.max_pct ?? 0} onSave={(min, max) => upBand.mutate({ data: { band: b, min_pct: min, max_pct: max } })} />
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">Risk factors</div>
            <div className="text-[11.5px] text-muted-foreground">Each factor's options carry a score. Sum ÷ max × 100 = Risk %.</div>
          </div>
          <button
            className={btnPrimaryCls + " inline-flex items-center gap-1"}
            onClick={() => upFactor.mutate({ data: { code: `factor_${Date.now()}`, label: "New factor", applies_to: "both", multi_select: false, sort_order: scheme.factors.length + 1, active: true } })}
          >
            <Plus size={14} /> Add factor
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {scheme.factors.map((f) => (
            <FactorRow
              key={f.id}
              factor={f}
              onSaveFactor={(patch) => upFactor.mutate({ data: { id: f.id, code: patch.code, label: patch.label, applies_to: patch.applies_to, multi_select: patch.multi_select, sort_order: patch.sort_order, active: patch.active } })}
              onDeleteFactor={() => { if (confirm(`Delete factor "${f.label}"? Options and existing assessments will keep their historic answers.`)) delFactor.mutate({ data: { id: f.id } }); }}
              onSaveOption={(opt) => upOption.mutate({ data: opt })}
              onDeleteOption={(id) => delOption.mutate({ data: { id } })}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function BandEditor({ band, minPct, maxPct, onSave }: { band: RiskBandLevel; minPct: number; maxPct: number; onSave: (min: number, max: number) => void }) {
  const [min, setMin] = useState(Number(minPct));
  const [max, setMax] = useState(Number(maxPct));
  const dirty = min !== Number(minPct) || max !== Number(maxPct);
  const tone = band === "low" ? "border-emerald-500/40" : band === "medium" ? "border-amber-500/40" : "border-rose-500/40";
  return (
    <div className={cn("border rounded-md p-3", tone)}>
      <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-2">{band}</div>
      <div className="flex items-center gap-2">
        <input type="number" step="0.01" value={min} onChange={(e) => setMin(Number(e.target.value))} className={inputCls + " font-mono w-24"} />
        <span className="text-xs">–</span>
        <input type="number" step="0.01" value={max} onChange={(e) => setMax(Number(e.target.value))} className={inputCls + " font-mono w-24"} />
        <span className="text-xs text-muted-foreground">%</span>
        <button disabled={!dirty} onClick={() => onSave(min, max)} className={btnSecondaryCls + " ml-auto inline-flex items-center gap-1 disabled:opacity-50"}>
          <Save size={12} /> Save
        </button>
      </div>
    </div>
  );
}

function FactorRow({
  factor,
  onSaveFactor,
  onDeleteFactor,
  onSaveOption,
  onDeleteOption,
}: {
  factor: any;
  onSaveFactor: (patch: { code: string; label: string; applies_to: RiskAppliesTo; multi_select: boolean; sort_order: number; active: boolean }) => void;
  onDeleteFactor: () => void;
  onSaveOption: (opt: { id?: string; factor_id: string; label: string; band: RiskBandLevel; score: number; sort_order: number; active: boolean }) => void;
  onDeleteOption: (id: string) => void;
}) {
  const [label, setLabel] = useState(factor.label);
  const [code, setCode] = useState(factor.code);
  const [applies, setApplies] = useState<RiskAppliesTo>(factor.applies_to);
  const [multi, setMulti] = useState<boolean>(factor.multi_select);
  const [sort, setSort] = useState<number>(factor.sort_order);
  const [active, setActive] = useState<boolean>(factor.active);
  const [expanded, setExpanded] = useState(false);
  const dirty = label !== factor.label || code !== factor.code || applies !== factor.applies_to || multi !== factor.multi_select || sort !== factor.sort_order || active !== factor.active;

  return (
    <div className="border border-border rounded-md">
      <div className="flex items-center gap-2 p-3 flex-wrap">
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls + " flex-1 min-w-[220px]"} />
        <input value={code} onChange={(e) => setCode(e.target.value)} className={inputCls + " font-mono w-40"} />
        <select value={applies} onChange={(e) => setApplies(e.target.value as RiskAppliesTo)} className={selectCls + " w-32"}>
          {APPLIES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> multi</label>
        <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> active</label>
        <input type="number" value={sort} onChange={(e) => setSort(Number(e.target.value))} className={inputCls + " w-16 font-mono"} />
        <button disabled={!dirty} onClick={() => onSaveFactor({ code, label, applies_to: applies, multi_select: multi, sort_order: sort, active })} className={btnSecondaryCls + " inline-flex items-center gap-1 disabled:opacity-50"}>
          <Save size={12} /> Save
        </button>
        <button onClick={() => setExpanded((x) => !x)} className={btnSecondaryCls}>
          {expanded ? "Hide options" : `Options (${factor.options.length})`}
        </button>
        <button onClick={onDeleteFactor} className="text-destructive hover:text-destructive/80 p-1.5" title="Delete factor">
          <Trash2 size={14} />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border p-3 flex flex-col gap-2 bg-muted/20">
          {factor.options.map((o: any) => (
            <OptionRow key={o.id} option={o} factorId={factor.id} onSave={onSaveOption} onDelete={() => onDeleteOption(o.id)} />
          ))}
          <button
            className={btnSecondaryCls + " self-start inline-flex items-center gap-1"}
            onClick={() => onSaveOption({ factor_id: factor.id, label: "New option", band: "low", score: 0, sort_order: (factor.options.length || 0) + 1, active: true })}
          >
            <Plus size={12} /> Add option
          </button>
        </div>
      )}
    </div>
  );
}

function OptionRow({
  option, factorId, onSave, onDelete,
}: {
  option: any;
  factorId: string;
  onSave: (opt: { id?: string; factor_id: string; label: string; band: RiskBandLevel; score: number; sort_order: number; active: boolean }) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(option.label);
  const [band, setBand] = useState<RiskBandLevel>(option.band);
  const [score, setScore] = useState<number>(Number(option.score));
  const [sort, setSort] = useState<number>(option.sort_order);
  const [active, setActive] = useState<boolean>(option.active);
  const dirty = label !== option.label || band !== option.band || score !== Number(option.score) || sort !== option.sort_order || active !== option.active;

  return (
    <div className="flex items-center gap-2 flex-wrap bg-card border border-border rounded-md p-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls + " flex-1 min-w-[220px]"} />
      <select value={band} onChange={(e) => setBand(e.target.value as RiskBandLevel)} className={selectCls + " w-28"}>
        {BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      <input type="number" step="0.01" value={score} onChange={(e) => setScore(Number(e.target.value))} className={inputCls + " w-24 font-mono"} />
      <input type="number" value={sort} onChange={(e) => setSort(Number(e.target.value))} className={inputCls + " w-16 font-mono"} />
      <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> active</label>
      <button disabled={!dirty} onClick={() => onSave({ id: option.id, factor_id: factorId, label, band, score, sort_order: sort, active })} className={btnSecondaryCls + " disabled:opacity-50"}>
        <Save size={12} />
      </button>
      <button onClick={onDelete} className="text-destructive hover:text-destructive/80 p-1.5" title="Delete option">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
