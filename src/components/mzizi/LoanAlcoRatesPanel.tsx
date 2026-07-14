import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import {
  FormGrid, FormField, FormActions, inputCls, selectCls, btnPrimaryCls, btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { listLoanAlcoRates, upsertLoanAlcoRate, deleteLoanAlcoRate } from "@/lib/loan-alco.functions";
import { getAllLoanProducts } from "@/lib/mzizi.functions";
import { listSecurityTypes } from "@/lib/security.functions";

type Row = {
  id: string;
  product_id: string;
  security_type_id: string | null;
  equipment_vehicle: string | null;
  min_rate: number;
  max_rate: number;
  min_period_months: number;
  max_period_months: number;
  active: boolean;
  product?: { name: string } | null;
  security?: { name: string } | null;
};

type Draft = {
  id?: string;
  product_id: string;
  security_type_id: string;
  equipment_vehicle: string;
  min_rate: string;
  max_rate: string;
  min_period_months: string;
  max_period_months: string;
  active: boolean;
};

const emptyDraft = (): Draft => ({
  product_id: "",
  security_type_id: "",
  equipment_vehicle: "",
  min_rate: "",
  max_rate: "",
  min_period_months: "",
  max_period_months: "",
  active: true,
});

export function LoanAlcoRatesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLoanAlcoRates);
  const upsertFn = useServerFn(upsertLoanAlcoRate);
  const deleteFn = useServerFn(deleteLoanAlcoRate);
  const productsFn = useServerFn(getAllLoanProducts);
  const secTypesFn = useServerFn(listSecurityTypes);

  const { data: rows, isLoading } = useQuery({ queryKey: ["loan-alco", "rates"], queryFn: () => listFn() });
  const { data: products } = useQuery({ queryKey: ["loan-alco", "products"], queryFn: () => productsFn() });
  const { data: secTypes } = useQuery({ queryKey: ["loan-alco", "security-types"], queryFn: () => secTypesFn() });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  const activeProducts = useMemo(
    () => (products ?? []).filter((p: any) => p.is_active !== false),
    [products],
  );
  const activeSecTypes = useMemo(
    () => (secTypes ?? []).filter((s: any) => s.active !== false),
    [secTypes],
  );

  const save = useMutation({
    mutationFn: () => {
      if (!draft.product_id) throw new Error("Product is required");
      const minR = Number(draft.min_rate);
      const maxR = Number(draft.max_rate);
      const minP = Number(draft.min_period_months);
      const maxP = Number(draft.max_period_months);
      if (![minR, maxR, minP, maxP].every((n) => Number.isFinite(n))) {
        throw new Error("Rates and periods must be numbers");
      }
      return upsertFn({
        data: {
          id: draft.id,
          product_id: draft.product_id,
          security_type_id: draft.security_type_id || null,
          equipment_vehicle: draft.equipment_vehicle.trim() || null,
          min_rate: minR,
          max_rate: maxR,
          min_period_months: minP,
          max_period_months: maxP,
          active: draft.active,
        },
      });
    },
    onSuccess: () => {
      toast.success(draft.id ? "Rate row updated" : "Rate row added");
      setOpen(false);
      setDraft(emptyDraft());
      qc.invalidateQueries({ queryKey: ["loan-alco", "rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Rate row deleted");
      qc.invalidateQueries({ queryKey: ["loan-alco", "rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function edit(r: Row) {
    setDraft({
      id: r.id,
      product_id: r.product_id,
      security_type_id: r.security_type_id ?? "",
      equipment_vehicle: r.equipment_vehicle ?? "",
      min_rate: String(r.min_rate),
      max_rate: String(r.max_rate),
      min_period_months: String(r.min_period_months),
      max_period_months: String(r.max_period_months),
      active: r.active,
    });
    setOpen(true);
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <CardTitle>ALCO rates — Loan products</CardTitle>
          <p className="text-[12px] text-muted-foreground">
            Interest rate bands per loan product, security type and equipment/vehicle. Used to constrain loan pricing on application.
          </p>
        </div>
        {!open && (
          <button className={btnPrimaryCls} onClick={() => { setDraft(emptyDraft()); setOpen(true); }}>
            <Plus size={14} className="mr-1.5" /> Add rate row
          </button>
        )}
      </div>

      {open && (
        <div className="mb-4 rounded-md border border-border p-3 bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-semibold">{draft.id ? "Edit rate row" : "New rate row"}</div>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => { setOpen(false); setDraft(emptyDraft()); }}>
              <X size={16} />
            </button>
          </div>
          <FormGrid>
            <FormField label="Loan product" span={6} required>
              <select className={selectCls} value={draft.product_id}
                onChange={(e) => setDraft((d) => ({ ...d, product_id: e.target.value }))}>
                <option value="">Select product…</option>
                {activeProducts.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Security type" span={6}>
              <select className={selectCls} value={draft.security_type_id}
                onChange={(e) => setDraft((d) => ({ ...d, security_type_id: e.target.value }))}>
                <option value="">— Any —</option>
                {activeSecTypes.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Equipment / Vehicle" span={12} hint="Optional free-text descriptor (e.g. 'Toyota Hiace', 'Excavator ≤ 5T')">
              <input className={inputCls} value={draft.equipment_vehicle}
                onChange={(e) => setDraft((d) => ({ ...d, equipment_vehicle: e.target.value }))} />
            </FormField>
            <FormField label="Min rate % p.a." span={3} required>
              <input type="number" step="0.001" min="0" className={inputCls + " text-right font-mono"}
                value={draft.min_rate} onChange={(e) => setDraft((d) => ({ ...d, min_rate: e.target.value }))} />
            </FormField>
            <FormField label="Max rate % p.a." span={3} required>
              <input type="number" step="0.001" min="0" className={inputCls + " text-right font-mono"}
                value={draft.max_rate} onChange={(e) => setDraft((d) => ({ ...d, max_rate: e.target.value }))} />
            </FormField>
            <FormField label="Min period (months)" span={3} required>
              <input type="number" step="1" min="0" className={inputCls + " text-right font-mono"}
                value={draft.min_period_months} onChange={(e) => setDraft((d) => ({ ...d, min_period_months: e.target.value }))} />
            </FormField>
            <FormField label="Max period (months)" span={3} required>
              <input type="number" step="1" min="0" className={inputCls + " text-right font-mono"}
                value={draft.max_period_months} onChange={(e) => setDraft((d) => ({ ...d, max_period_months: e.target.value }))} />
            </FormField>
            <FormField label="Active" span={12}>
              <label className="inline-flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={draft.active}
                  onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} />
                Available for new loans
              </label>
            </FormField>
          </FormGrid>
          <FormActions align="end">
            <button className={btnSecondaryCls} onClick={() => { setOpen(false); setDraft(emptyDraft()); }}>Cancel</button>
            <button className={btnPrimaryCls} disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </FormActions>
        </div>
      )}

      <div className="overflow-auto rounded-md border border-border">
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Product</th>
              <th className="text-left px-3 py-2">Security type</th>
              <th className="text-left px-3 py-2">Equipment / Vehicle</th>
              <th className="text-right px-3 py-2">Min rate %</th>
              <th className="text-right px-3 py-2">Max rate %</th>
              <th className="text-right px-3 py-2">Min period</th>
              <th className="text-right px-3 py-2">Max period</th>
              <th className="text-center px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && (rows ?? []).map((r: Row) => (
              <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                <td className="px-3 py-1.5 font-semibold">{r.product?.name ?? "—"}</td>
                <td className="px-3 py-1.5">{r.security?.name ?? <span className="text-muted-foreground">Any</span>}</td>
                <td className="px-3 py-1.5">{r.equipment_vehicle ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-1.5 text-right font-mono">{Number(r.min_rate).toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{Number(r.max_rate).toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.min_period_months} mo</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.max_period_months} mo</td>
                <td className="px-3 py-1.5 text-center">
                  <div className="inline-flex gap-1">
                    <button className="p-1 rounded hover:bg-muted" title="Edit" onClick={() => edit(r)}>
                      <Pencil size={13} />
                    </button>
                    <button className="p-1 rounded hover:bg-muted text-rose-600"
                      title="Delete"
                      onClick={() => { if (confirm("Delete this rate row?")) remove.mutate(r.id); }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && (rows ?? []).length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No loan ALCO rate rows yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
