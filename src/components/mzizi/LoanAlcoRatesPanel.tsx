import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Upload, Send, Plus, Trash2, History } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import {
  FormActions, inputCls, selectCls, btnPrimaryCls, btnSecondaryCls, btnGhostCls,
} from "@/components/mzizi/FormGrid";
import { Modal } from "@/components/mzizi/Modal";
import {
  listLoanAlcoRates, upsertLoanAlcoRate, deleteLoanAlcoRate, listLoanAlcoRateHistory,
} from "@/lib/loan-alco.functions";
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
  effective_from: string;
  effective_to: string | null;
  note: string | null;
};

type Draft = {
  key: string;              // stable client-side key
  rate_id?: string;         // DB id of the current active version
  product_id: string;
  security_type_id: string;
  equipment_vehicle: string;
  min_rate: string;
  max_rate: string;
  min_period_months: string;
  max_period_months: string;
  active: boolean;
  effective_from: string;   // ISO string bound to <input type="datetime-local">
  note: string;
  _new?: boolean;
};

// Format ISO string for <input type="datetime-local"> (yyyy-MM-ddTHH:mm)
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(local: string): string {
  if (!local) return new Date().toISOString();
  return new Date(local).toISOString();
}
function nowLocal(): string {
  return toLocalInput(new Date().toISOString());
}

function rowToDraft(r: RateRow): Draft {
  return {
    key: r.id,
    rate_id: r.id,
    product_id: r.product_id,
    security_type_id: r.security_type_id ?? "",
    equipment_vehicle: r.equipment_vehicle ?? "",
    min_rate: String(r.min_rate),
    max_rate: String(r.max_rate),
    min_period_months: String(r.min_period_months),
    max_period_months: String(r.max_period_months),
    active: r.active,
    effective_from: toLocalInput(r.effective_from),
    note: r.note ?? "",
  };
}

function blankDraft(product_id: string): Draft {
  return {
    key: `new-${crypto.randomUUID()}`,
    product_id,
    security_type_id: "",
    equipment_vehicle: "",
    min_rate: "",
    max_rate: "",
    min_period_months: "",
    max_period_months: "",
    active: true,
    effective_from: nowLocal(),
    note: "",
    _new: true,
  };
}

function draftEqualToRow(d: Draft, r?: RateRow) {
  if (!r) return false;
  return d.security_type_id === (r.security_type_id ?? "")
    && d.equipment_vehicle === (r.equipment_vehicle ?? "")
    && d.min_rate === String(r.min_rate)
    && d.max_rate === String(r.max_rate)
    && d.min_period_months === String(r.min_period_months)
    && d.max_period_months === String(r.max_period_months)
    && d.active === r.active
    && d.note === (r.note ?? "")
    && d.effective_from === toLocalInput(r.effective_from);
}

export function LoanAlcoRatesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLoanAlcoRates);
  const upsertFn = useServerFn(upsertLoanAlcoRate);
  const deleteFn = useServerFn(deleteLoanAlcoRate);
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

  const ratesById = useMemo(() => {
    const m = new Map<string, RateRow>();
    for (const r of (rates ?? []) as RateRow[]) m.set(r.id, r);
    return m;
  }, [rates]);

  // Rows state: initialized from DB, augmented by user-added blank rows.
  const [rows, setRows] = useState<Draft[]>([]);

  // Sync DB rows into state (preserve local edits + new rows).
  useEffect(() => {
    if (!rates) return;
    setRows((prev) => {
      const prevById = new Map(prev.filter((r) => r.rate_id).map((r) => [r.rate_id!, r]));
      const newRows = prev.filter((r) => r._new);
      const dbRows = (rates as RateRow[]).map((r) => {
        const existing = prevById.get(r.id);
        // If user has edited this row, keep their edits; else refresh from DB.
        if (existing && !draftEqualToRow(existing, r)) return existing;
        return rowToDraft(r);
      });
      // Order: DB rows first (by product, then created order preserved), then new rows.
      return [...dbRows, ...newRows];
    });
  }, [rates]);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [csv, setCsv] = useState("");

  const productName = (id: string) => activeProducts.find((p: any) => p.id === id)?.name ?? "—";

  // Group rows for display: for each active product, list its rows in order.
  const grouped = useMemo(() => {
    return activeProducts.map((p: any) => ({
      product: p,
      rows: rows.filter((r) => r.product_id === p.id),
    }));
  }, [activeProducts, rows]);

  const changedRows = useMemo(() => {
    return rows.filter((r) => {
      if (r._new) {
        // include new rows only if any field filled
        return r.min_rate || r.max_rate || r.min_period_months || r.max_period_months
          || r.security_type_id || r.equipment_vehicle;
      }
      return !draftEqualToRow(r, r.rate_id ? ratesById.get(r.rate_id) : undefined);
    });
  }, [rows, ratesById]);

  const save = useMutation({
    mutationFn: async () => {
      const results: string[] = [];
      for (const d of changedRows) {
        const minR = Number(d.min_rate);
        const maxR = Number(d.max_rate);
        const minP = Number(d.min_period_months);
        const maxP = Number(d.max_period_months);
        const label = `${productName(d.product_id)}${d.equipment_vehicle ? ` / ${d.equipment_vehicle}` : ""}`;
        if (![minR, maxR, minP, maxP].every((n) => Number.isFinite(n))) {
          throw new Error(`${label}: rates and periods must be numbers`);
        }
        if (maxR < minR) throw new Error(`${label}: max rate must be ≥ min rate`);
        if (maxP < minP) throw new Error(`${label}: max period must be ≥ min period`);
        await upsertFn({
          data: {
            id: d.rate_id,
            product_id: d.product_id,
            security_type_id: d.security_type_id || null,
            equipment_vehicle: d.equipment_vehicle.trim() || null,
            min_rate: minR,
            max_rate: maxR,
            min_period_months: minP,
            max_period_months: maxP,
            active: d.active,
          },
        });
        results.push(label);
      }
      return results;
    },
    onSuccess: (res) => {
      toast.success(`Saved ${res.length} row(s)`);
      qc.invalidateQueries({ queryKey: ["loan-alco"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: Draft) => {
      if (row.rate_id) await deleteFn({ data: { id: row.rate_id } });
      return row.key;
    },
    onSuccess: (key) => {
      setRows((prev) => prev.filter((r) => r.key !== key));
      qc.invalidateQueries({ queryKey: ["loan-alco"] });
      toast.success("Row removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateRow(key: string, patch: Partial<Draft>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow(productId: string) {
    setRows((prev) => [...prev, blankDraft(productId)]);
  }

  function applyBulk() {
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return toast.error("Empty CSV");
    const byProdName = new Map(activeProducts.map((p: any) => [String(p.name).toLowerCase(), p]));
    const bySecName = new Map(activeSecTypes.map((s: any) => [String(s.name).toLowerCase(), s]));
    let ok = 0, skipped = 0;
    const added: Draft[] = [];
    for (const line of lines) {
      const parts = line.split(/\t|,|;/).map((x) => x.trim());
      const [prodName, secName, equipment, minR, maxR, minP, maxP, effFrom] = parts;
      if (!prodName || prodName.toLowerCase() === "product") { skipped++; continue; }
      const p: any = byProdName.get(prodName.toLowerCase());
      if (!p) { skipped++; continue; }
      const sec: any = secName ? bySecName.get(secName.toLowerCase()) : null;
      let effLocal = nowLocal();
      if (effFrom) {
        const d = new Date(effFrom);
        if (!isNaN(d.getTime())) effLocal = toLocalInput(d.toISOString());
      }
      added.push({
        key: `new-${crypto.randomUUID()}`,
        product_id: p.id,
        security_type_id: sec?.id ?? "",
        equipment_vehicle: equipment ?? "",
        min_rate: minR ?? "",
        max_rate: maxR ?? "",
        min_period_months: minP ?? "",
        max_period_months: maxP ?? "",
        active: true,
        effective_from: effLocal,
        note: "",
        _new: true,
      });
      ok++;
    }
    setRows((prev) => [...prev, ...added]);
    setBulkOpen(false);
    setCsv("");
    toast.success(`Loaded ${ok} row(s)${skipped ? `, skipped ${skipped}` : ""}`);
  }

  function downloadTemplate() {
    const header = "product,security_type,equipment_vehicle,min_rate,max_rate,min_period_months,max_period_months";
    const csvRows = (rates as RateRow[] ?? []).map((r) => {
      const sec = r.security_type_id ? activeSecTypes.find((s: any) => s.id === r.security_type_id) : null;
      return [
        productName(r.product_id),
        (sec as any)?.name ?? "",
        r.equipment_vehicle ?? "",
        r.min_rate ?? "",
        r.max_rate ?? "",
        r.min_period_months ?? "",
        r.max_period_months ?? "",
      ].join(",");
    });
    const csvText = [header, ...csvRows].join("\n");
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
            Interest rate bands per loan product. Add multiple rows per product for different security types or equipment/vehicles.
          </p>
        </div>
        <div className="flex gap-2">
          <button className={btnSecondaryCls} onClick={downloadTemplate}>Download CSV</button>
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
            Each row becomes a new entry — you may repeat the same product for different equipment.
          </div>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
            placeholder={"product,security_type,equipment_vehicle,min_rate,max_rate,min_period_months,max_period_months\nLeasing,Vehicle,Toyota Hilux,12,18,3,60"}
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
              <th className="text-center px-2 py-2 w-20">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {grouped.map(({ product: p, rows: prodRows }) => {
              const list = prodRows.length > 0 ? prodRows : [];
              return (
                <>
                  {list.map((d, idx) => {
                    const base = d.rate_id ? ratesById.get(d.rate_id) : undefined;
                    const isChanged = d._new
                      ? changedRows.some((c) => c.key === d.key)
                      : !draftEqualToRow(d, base);
                    return (
                      <tr key={d.key} className={isChanged ? "bg-amber-500/5" : ""}>
                        <td className="px-3 py-1.5">
                          {idx === 0 ? (
                            <>
                              <div className="font-semibold">{p.name}</div>
                              <div className="text-[11px] text-muted-foreground">{p.segment ?? ""}</div>
                            </>
                          ) : (
                            <div className="text-[11px] text-muted-foreground pl-2">↳ {p.name}</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <select className={selectCls + " py-1"} value={d.security_type_id}
                            onChange={(e) => updateRow(d.key, { security_type_id: e.target.value })}>
                            <option value="">— Any —</option>
                            {activeSecTypes.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input className={inputCls + " py-1"} value={d.equipment_vehicle}
                            onChange={(e) => updateRow(d.key, { equipment_vehicle: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.001" min="0" className={inputCls + " text-right font-mono py-1"}
                            value={d.min_rate} onChange={(e) => updateRow(d.key, { min_rate: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.001" min="0" className={inputCls + " text-right font-mono py-1"}
                            value={d.max_rate} onChange={(e) => updateRow(d.key, { max_rate: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="1" min="0" className={inputCls + " text-right font-mono py-1"}
                            value={d.min_period_months} onChange={(e) => updateRow(d.key, { min_period_months: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="1" min="0" className={inputCls + " text-right font-mono py-1"}
                            value={d.max_period_months} onChange={(e) => updateRow(d.key, { max_period_months: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input type="checkbox" checked={d.active}
                            onChange={(e) => updateRow(d.key, { active: e.target.checked })} />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            className="text-destructive hover:bg-destructive/10 rounded p-1"
                            title="Remove row"
                            onClick={() => {
                              if (d._new) {
                                setRows((prev) => prev.filter((r) => r.key !== d.key));
                              } else if (confirm("Delete this rate row?")) {
                                remove.mutate(d);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr key={`${p.id}-add`} className="bg-muted/20">
                    <td className="px-3 py-1" colSpan={9}>
                      <button
                        className={btnGhostCls + " h-7 text-[12px]"}
                        onClick={() => addRow(p.id)}
                      >
                        <Plus size={12} className="mr-1" /> Add row for {p.name}
                      </button>
                    </td>
                  </tr>
                </>
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
          {changedRows.length === 0 ? "No changes" : `${changedRows.length} row(s) changed`}
        </div>
        <button
          className={btnPrimaryCls}
          disabled={changedRows.length === 0 || save.isPending}
          onClick={() => save.mutate()}
        >
          <Send size={14} className="mr-1.5" />
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </FormActions>
    </Card>
  );
}
