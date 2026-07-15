import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, ChevronDown, ChevronRight } from "lucide-react";
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

const BAND_TONE: Record<RiskBandLevel, string> = {
  low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  high: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

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
        <div className="mb-3">
          <div className="text-sm font-semibold">Risk bands</div>
          <div className="text-[11.5px] text-muted-foreground">Total risk % is bucketed into these bands.</div>
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
            <div className="text-sm font-semibold">Risk assessment scheme</div>
            <div className="text-[11.5px] text-muted-foreground">Categories (factors) group their options. Set the Assigned Risk Level and Risk Score for each option.</div>
          </div>
          <button
            className={btnPrimaryCls + " inline-flex items-center gap-1"}
            onClick={() => upFactor.mutate({ data: { code: `factor_${Date.now()}`, label: "New category", applies_to: "both", multi_select: false, sort_order: scheme.factors.length + 1, active: true } })}
          >
            <Plus size={14} /> Add category
          </button>
        </div>

        <div className="overflow-x-auto border border-border rounded-md">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-faint">
              <tr>
                <th className="text-left px-3 py-2 w-8"></th>
                <th className="text-left px-3 py-2">Option / Category</th>
                <th className="text-left px-3 py-2 w-40">Assigned Risk Level</th>
                <th className="text-left px-3 py-2 w-28">Risk Score</th>
                <th className="text-left px-3 py-2 w-20">Sort</th>
                <th className="text-left px-3 py-2 w-20">Active</th>
                <th className="text-right px-3 py-2 w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {scheme.factors.map((f) => (
                <FactorGroup
                  key={f.id}
                  factor={f}
                  onSaveFactor={(patch) => upFactor.mutate({ data: { id: f.id, ...patch } })}
                  onDeleteFactor={() => { if (confirm(`Delete category "${f.label}"?`)) delFactor.mutate({ data: { id: f.id } }); }}
                  onSaveOption={(opt) => upOption.mutate({ data: opt })}
                  onDeleteOption={(id) => delOption.mutate({ data: { id } })}
                />
              ))}
            </tbody>
          </table>
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

function FactorGroup({
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
  const [open, setOpen] = useState(true);
  const [editingHeader, setEditingHeader] = useState(false);
  const [label, setLabel] = useState(factor.label);
  const [code, setCode] = useState(factor.code);
  const [applies, setApplies] = useState<RiskAppliesTo>(factor.applies_to);
  const [multi, setMulti] = useState<boolean>(factor.multi_select);
  const [sort, setSort] = useState<number>(factor.sort_order);
  const [active, setActive] = useState<boolean>(factor.active);
  const dirty = label !== factor.label || code !== factor.code || applies !== factor.applies_to || multi !== factor.multi_select || sort !== factor.sort_order || active !== factor.active;

  return (
    <>
      {/* Category separator row */}
      <tr className="bg-primary/5 border-t-2 border-primary/30">
        <td className="px-2 py-2">
          <button onClick={() => setOpen((x) => !x)} className="text-muted-foreground hover:text-foreground">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className="px-3 py-2" colSpan={editingHeader ? 1 : 5}>
          {editingHeader ? (
            <div className="flex flex-wrap items-center gap-2">
              <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls + " flex-1 min-w-[200px] font-semibold"} />
              <input value={code} onChange={(e) => setCode(e.target.value)} className={inputCls + " font-mono w-36"} placeholder="code" />
              <select value={applies} onChange={(e) => setApplies(e.target.value as RiskAppliesTo)} className={selectCls + " w-32"}>
                {APPLIES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> multi</label>
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> active</label>
              <input type="number" value={sort} onChange={(e) => setSort(Number(e.target.value))} className={inputCls + " w-16 font-mono"} title="Sort" />
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">Category</span>
              <span className="font-semibold text-[13px]">{factor.label}</span>
              <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 uppercase">{factor.applies_to}</span>
              {factor.multi_select && <span className="text-[10px] rounded-full bg-primary/10 text-primary px-1.5 py-0.5 uppercase">multi</span>}
              {!factor.active && <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 uppercase">inactive</span>}
            </div>
          )}
        </td>
        {editingHeader && <td colSpan={4} />}
        <td className="px-3 py-2 text-right">
          <div className="inline-flex items-center gap-1">
            {editingHeader && (
              <button disabled={!dirty} onClick={() => { onSaveFactor({ code, label, applies_to: applies, multi_select: multi, sort_order: sort, active }); setEditingHeader(false); }} className={btnSecondaryCls + " inline-flex items-center gap-1 disabled:opacity-50"}>
                <Save size={12} /> Save
              </button>
            )}
            <button onClick={() => setEditingHeader((x) => !x)} className={btnSecondaryCls}>
              {editingHeader ? "Done" : "Edit"}
            </button>
            <button onClick={onDeleteFactor} className="text-destructive hover:text-destructive/80 p-1.5" title="Delete category">
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
      {open && factor.options.map((o: any) => (
        <OptionRow key={o.id} option={o} factorId={factor.id} onSave={onSaveOption} onDelete={() => onDeleteOption(o.id)} />
      ))}
      {open && (
        <tr>
          <td></td>
          <td colSpan={6} className="px-3 py-2">
            <button
              className={btnSecondaryCls + " inline-flex items-center gap-1"}
              onClick={() => onSaveOption({ factor_id: factor.id, label: "New option", band: "low", score: 0, sort_order: (factor.options.length || 0) + 1, active: true })}
            >
              <Plus size={12} /> Add option
            </button>
          </td>
        </tr>
      )}
    </>
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
    <tr className="border-t border-border hover:bg-row-hover">
      <td></td>
      <td className="px-3 py-1.5">
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls + " w-full"} />
      </td>
      <td className="px-3 py-1.5">
        <select value={band} onChange={(e) => setBand(e.target.value as RiskBandLevel)} className={cn(selectCls, "w-full border", BAND_TONE[band])}>
          {BANDS.map((b) => <option key={b} value={b}>{b.toUpperCase()}</option>)}
        </select>
      </td>
      <td className="px-3 py-1.5">
        <input type="number" step="0.01" value={score} onChange={(e) => setScore(Number(e.target.value))} className={inputCls + " w-full font-mono"} />
      </td>
      <td className="px-3 py-1.5">
        <input type="number" value={sort} onChange={(e) => setSort(Number(e.target.value))} className={inputCls + " w-full font-mono"} />
      </td>
      <td className="px-3 py-1.5">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td className="px-3 py-1.5 text-right">
        <div className="inline-flex items-center gap-1">
          <button disabled={!dirty} onClick={() => onSave({ id: option.id, factor_id: factorId, label, band, score, sort_order: sort, active })} className={btnSecondaryCls + " inline-flex items-center gap-1 disabled:opacity-50"} title="Save">
            <Save size={12} />
          </button>
          <button onClick={onDelete} className="text-destructive hover:text-destructive/80 p-1.5" title="Delete option">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}
