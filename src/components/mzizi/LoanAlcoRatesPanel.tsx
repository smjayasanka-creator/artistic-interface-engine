import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Upload, Send } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import {
  FormGrid, FormField, FormActions, inputCls, selectCls, btnPrimaryCls, btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { listLoanAlcoRates, upsertLoanAlcoRate } from "@/lib/loan-alco.functions";
import { getAllLoanProducts } from "@/lib/mzizi.functions";
import { listSecurityTypes } from "@/lib/security.functions";

type RateRow = {
  id: string;
  product_id: string;
  security_type_id: string | null;
  equipment_vehicle: string | null;
  min_rate: number;
  max_rate: number;
  min_period_months: number;
  max_period_months: number;
  active: boolean;
};

type Draft = {
  rate_id?: string;
  security_type_id: string;
  equipment_vehicle: string;
  min_rate: string;
  max_rate: string;
  min_period_months: string;
  max_period_months: string;
  active: boolean;
};

function toDraft(r?: RateRow): Draft {
  return {
    rate_id: r?.id,
    security_type_id: r?.security_type_id ?? "",
    equipment_vehicle: r?.equipment_vehicle ?? "",
    min_rate: r ? String(r.min_rate) : "",
    max_rate: r ? String(r.max_rate) : "",
    min_period_months: r ? String(r.min_period_months) : "",
    max_period_months: r ? String(r.max_period_months) : "",
    active: r?.active ?? true,
  };
}

function draftEqual(a: Draft, b: Draft) {
  return a.security_type_id === b.security_type_id
    && a.equipment_vehicle === b.equipment_vehicle
    && a.min_rate === b.min_rate
    && a.max_rate === b.max_rate
    && a.min_period_months === b.min_period_months
    && a.max_period_months === b.max_period_months
    && a.active === b.active;
}

export function LoanAlcoRatesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLoanAlcoRates);
  const upsertFn = useServerFn(upsertLoanAlcoRate);
  const productsFn = useServerFn(getAllLoanProducts);
  const secTypesFn = useServerFn(listSecurityTypes);

  const { data: rates, isLoading } = useQuery({ queryKey: ["loan-alco", "rates"], queryFn: () => listFn() });
  const { data: products } = useQuery({ queryKey: ["loan-alco", "products"], queryFn: () => productsFn() });
  const { data: secTypes } = useQuery({ queryKey: ["loan-alco", "security-types"], queryFn: () => secTypesFn() });

  const activeProducts = useMemo(
    () => (products ?? []).filter((p: any) => p.is_active !== false),
    [products],
  );
  const activeSecTypes = useMemo(
    () => (secTypes ?? []).filter((s: any) => s.active !== false),
    [secTypes],
  );

  const rateByProduct = useMemo(() => {
    const m = new Map<string, RateRow>();
    for (const r of (rates ?? []) as RateRow[]) {
      if (!m.has(r.product_id)) m.set(r.product_id, r);
    }
    return m;
  }, [rates]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [csv, setCsv] = useState("");

  const getDraft = (productId: string): Draft => drafts[productId] ?? toDraft(rateByProduct.get(productId));

  const changed = useMemo(() => {
    return activeProducts.flatMap((p: any) => {
      const cur = drafts[p.id];
      if (!cur) return [];
      const base = toDraft(rateByProduct.get(p.id));
      return draftEqual(cur, base) ? [] : [{ product: p, draft: cur }];
    });
  }, [drafts, activeProducts, rateByProduct]);

  const save = useMutation({
    mutationFn: async () => {
      const results: string[] = [];
      for (const { product, draft } of changed) {
        const minR = Number(draft.min_rate);
        const maxR = Number(draft.max_rate);
        const minP = Number(draft.min_period_months);
        const maxP = Number(draft.max_period_months);
        if (![minR, maxR, minP, maxP].every((n) => Number.isFinite(n))) {
          throw new Error(`${product.name}: rates and periods must be numbers`);
        }
        if (maxR < minR) throw new Error(`${product.name}: max rate must be ≥ min rate`);
        if (maxP < minP) throw new Error(`${product.name}: max period must be ≥ min period`);
        await upsertFn({
          data: {
            id: draft.rate_id,
            product_id: product.id,
            security_type_id: draft.security_type_id || null,
            equipment_vehicle: draft.equipment_vehicle.trim() || null,
            min_rate: minR,
            max_rate: maxR,
            min_period_months: minP,
            max_period_months: maxP,
            active: draft.active,
          },
        });
        results.push(product.name);
      }
      return results;
    },
    onSuccess: (res) => {
      toast.success(`Saved ${res.length} product rate row(s)`);
      setDrafts({});
      qc.invalidateQueries({ queryKey: ["loan-alco"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function applyBulk() {
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return toast.error("Empty CSV");
    const byProdName = new Map(activeProducts.map((p: any) => [String(p.name).toLowerCase(), p]));
    const bySecName = new Map(activeSecTypes.map((s: any) => [String(s.name).toLowerCase(), s]));
    const next: Record<string, Draft> = { ...drafts };
    let ok = 0, skipped = 0;
    for (const line of lines) {
      const parts = line.split(/\t|,|;/).map((x) => x.trim());
      const [prodName, secName, equipment, minR, maxR, minP, maxP] = parts;
      if (!prodName || prodName.toLowerCase() === "product") { skipped++; continue; }
      const p: any = byProdName.get(prodName.toLowerCase());
      if (!p) { skipped++; continue; }
      const sec: any = secName ? bySecName.get(secName.toLowerCase()) : null;
      const existing = rateByProduct.get(p.id);
      next[p.id] = {
        rate_id: existing?.id,
        security_type_id: sec?.id ?? "",
        equipment_vehicle: equipment ?? "",
        min_rate: minR ?? "",
        max_rate: maxR ?? "",
        min_period_months: minP ?? "",
        max_period_months: maxP ?? "",
        active: existing?.active ?? true,
      };
      ok++;
    }
    setDrafts(next);
    setBulkOpen(false);
    setCsv("");
    toast.success(`Loaded ${ok} row(s)${skipped ? `, skipped ${skipped}` : ""}`);
  }

  function downloadTemplate() {
    const header = "product,security_type,equipment_vehicle,min_rate,max_rate,min_period_months,max_period_months";
    const rows = activeProducts.map((p: any) => {
      const r = rateByProduct.get(p.id);
      const sec = r?.security_type_id ? activeSecTypes.find((s: any) => s.id === r.security_type_id) : null;
      return [
        p.name,
        (sec as any)?.name ?? "",
        r?.equipment_vehicle ?? "",
        r?.min_rate ?? "",
        r?.max_rate ?? "",
        r?.min_period_months ?? "",
        r?.max_period_months ?? "",
      ].join(",");
    });
    const csvText = [header, ...rows].join("\n");
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "loan-alco-rates.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading loan ALCO rates…</div>;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <CardTitle>ALCO rates — Loan products</CardTitle>
          <p className="text-[12px] text-muted-foreground">
            Interest rate bands per loan product. Optionally scope by security type and equipment/vehicle. Edit inline and save.
          </p>
        </div>
        <div className="flex gap-2">
          <button className={btnSecondaryCls} onClick={downloadTemplate}>
            Download CSV
          </button>
          <button className={btnSecondaryCls} onClick={() => setBulkOpen((v) => !v)}>
            <Upload size={14} className="mr-1.5" /> Bulk upload
          </button>
        </div>
      </div>

      {bulkOpen && (
        <div className="mb-4 rounded-md border border-border p-3 bg-muted/30">
          <div className="text-[12px] font-semibold mb-1">Paste CSV / Excel rows</div>
          <div className="text-[11px] text-muted-foreground mb-2">
            Columns: <code>product,security_type,equipment_vehicle,min_rate,max_rate,min_period_months,max_period_months</code> (header optional).
            Product name must match exactly. Security type is optional. Copy-paste from Excel works.
          </div>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
            placeholder={"product,security_type,equipment_vehicle,min_rate,max_rate,min_period_months,max_period_months\nMicro Loan,,,,12,18,3,12"}
            className={inputCls + " font-mono text-[12px]"}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button className={btnSecondaryCls} onClick={() => { setBulkOpen(false); setCsv(""); }}>Cancel</button>
            <button className={btnPrimaryCls} onClick={applyBulk}>Load into table</button>
          </div>
        </div>
      )}

      <div className="overflow-auto rounded-md border border-border">
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Product</th>
              <th className="text-left px-2 py-2 w-40">Security type</th>
              <th className="text-left px-2 py-2 w-44">Equipment / Vehicle</th>
              <th className="text-right px-2 py-2 w-24">Min rate %</th>
              <th className="text-right px-2 py-2 w-24">Max rate %</th>
              <th className="text-right px-2 py-2 w-24">Min period</th>
              <th className="text-right px-2 py-2 w-24">Max period</th>
              <th className="text-center px-2 py-2 w-14">Active</th>
              <th className="text-center px-2 py-2 w-10">Δ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {activeProducts.map((p: any) => {
              const d = getDraft(p.id);
              const isChanged = changed.some((c) => c.product.id === p.id);
              const upd = (patch: Partial<Draft>) =>
                setDrafts((prev) => ({ ...prev, [p.id]: { ...getDraft(p.id), ...patch } }));
              return (
                <tr key={p.id} className={isChanged ? "bg-amber-500/5" : ""}>
                  <td className="px-3 py-1.5">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{p.segment ?? ""}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    <select className={selectCls + " py-1"} value={d.security_type_id}
                      onChange={(e) => upd({ security_type_id: e.target.value })}>
                      <option value="">— Any —</option>
                      {activeSecTypes.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={inputCls + " py-1"} value={d.equipment_vehicle}
                      onChange={(e) => upd({ equipment_vehicle: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" step="0.001" min="0" className={inputCls + " text-right font-mono py-1"}
                      value={d.min_rate} onChange={(e) => upd({ min_rate: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" step="0.001" min="0" className={inputCls + " text-right font-mono py-1"}
                      value={d.max_rate} onChange={(e) => upd({ max_rate: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" step="1" min="0" className={inputCls + " text-right font-mono py-1"}
                      value={d.min_period_months} onChange={(e) => upd({ min_period_months: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" step="1" min="0" className={inputCls + " text-right font-mono py-1"}
                      value={d.max_period_months} onChange={(e) => upd({ max_period_months: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={d.active}
                      onChange={(e) => upd({ active: e.target.checked })} />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {isChanged ? <span className="text-amber-600 font-bold">●</span> : <span className="text-muted-foreground">–</span>}
                  </td>
                </tr>
              );
            })}
            {activeProducts.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">No active loan products.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <FormActions align="between">
        <div className="text-[12px] text-muted-foreground">
          {changed.length === 0 ? "No changes" : `${changed.length} product(s) changed`}
        </div>
        <button
          className={btnPrimaryCls}
          disabled={changed.length === 0 || save.isPending}
          onClick={() => save.mutate()}
        >
          <Send size={14} className="mr-1.5" />
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </FormActions>
    </Card>
  );
}
