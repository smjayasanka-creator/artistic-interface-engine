import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import {
  listFdProducts,
  createFdProduct,
  updateFdProduct,
  deleteFdProduct,
  upsertFdRateTier,
  deleteFdRateTier,
} from "@/lib/fd.functions";
import { Card } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  selectCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";

type PenaltyType = "rate_reduction" | "reprice_minus_margin";
type MaturityInstr = "payout" | "renew_principal" | "renew_principal_interest";

type ProductRow = {
  id: string;
  code: string;
  name: string;
  min_amount: number;
  max_amount: number | null;
  allow_monthly: boolean;
  allow_at_maturity: boolean;
  penalty_type: PenaltyType;
  penalty_value: number;
  wht_rate: number;
  auto_renewal_default: MaturityInstr;
  active: boolean;
  rate_tiers: Array<{
    id: string;
    tenure_months: number;
    annual_rate: number;
    effective_from: string;
    effective_to: string | null;
  }>;
};

const EMPTY = {
  code: "",
  name: "",
  min_amount: 10000,
  max_amount: null as number | null,
  allow_monthly: true,
  allow_at_maturity: true,
  penalty_type: "rate_reduction" as PenaltyType,
  penalty_value: 1,
  wht_rate: 5,
  auto_renewal_default: "payout" as MaturityInstr,
  active: true,
};

export function FdProductsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFdProducts);
  const createFn = useServerFn(createFdProduct);
  const updateFn = useServerFn(updateFdProduct);
  const deleteFn = useServerFn(deleteFdProduct);
  const { data: products } = useQuery({
    queryKey: ["fd-products"],
    queryFn: () => listFn(),
  });

  const [editing, setEditing] = useState<null | { id?: string; values: typeof EMPTY }>(null);

  const createM = useMutation({
    mutationFn: (v: typeof EMPTY) => createFn({ data: v }),
    onSuccess: () => {
      toast.success("Product created");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["fd-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: (v: { id: string; patch: typeof EMPTY }) => updateFn({ data: v }),
    onSuccess: () => {
      toast.success("Product updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["fd-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Product removed");
      qc.invalidateQueries({ queryKey: ["fd-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">Fixed Deposit products</div>
          <div className="text-[12px] text-muted-foreground">Configure tenures, rates, penalty rules and WHT.</div>
        </div>
        <button className={btnPrimaryCls} onClick={() => setEditing({ values: { ...EMPTY } })}>
          <Plus size={15} className="mr-1.5" /> New product
        </button>
      </div>

      {(products ?? []).map((p) => (
        <ProductCard
          key={p.id}
          product={p as ProductRow}
          onEdit={() =>
            setEditing({
              id: p.id,
              values: {
                code: p.code,
                name: p.name,
                min_amount: Number(p.min_amount),
                max_amount: p.max_amount == null ? null : Number(p.max_amount),
                allow_monthly: p.allow_monthly,
                allow_at_maturity: p.allow_at_maturity,
                penalty_type: p.penalty_type as PenaltyType,
                penalty_value: Number(p.penalty_value),
                wht_rate: Number(p.wht_rate),
                auto_renewal_default: p.auto_renewal_default as MaturityInstr,
                active: p.active,
              },
            })
          }
          onDelete={() => {
            if (confirm(`Delete product ${p.code}? This will remove all its rate tiers.`)) deleteM.mutate(p.id);
          }}
        />
      ))}
      {products && products.length === 0 && (
        <Card>
          <div className="text-sm text-muted-foreground text-center py-8">No products yet.</div>
        </Card>
      )}

      {editing && (
        <ProductModal
          initial={editing.values}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => (editing.id ? updateM.mutate({ id: editing.id, patch: v }) : createM.mutate(v))}
        />
      )}
    </div>
  );
}

/* ------- Product row + rate tier grid ------- */

function ProductCard({
  product,
  onEdit,
  onDelete,
}: {
  product: ProductRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertFdRateTier);
  const deleteFn = useServerFn(deleteFdRateTier);
  const upsertM = useMutation({
    mutationFn: (v: {
      id?: string;
      product_id: string;
      tenure_months: number;
      annual_rate: number;
      effective_from: string;
      effective_to?: string | null;
    }) => upsertFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fd-products"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fd-products"] }),
  });

  const [tenure, setTenure] = useState("");
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="font-mono text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground">{product.code}</div>
            <div className="font-semibold text-[14px] text-foreground">{product.name}</div>
            {!product.active && (
              <div className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">Inactive</div>
            )}
          </div>
          <div className="text-[12px] text-muted-foreground mt-1">
            Min {product.min_amount.toLocaleString()} · Max {product.max_amount?.toLocaleString() ?? "—"} ·
            Payout: {product.allow_monthly && "Monthly"} {product.allow_monthly && product.allow_at_maturity && "· "}
            {product.allow_at_maturity && "At maturity"} · WHT {product.wht_rate}% ·
            Penalty: {product.penalty_type === "rate_reduction" ? `-${product.penalty_value}% rate` : `Reprice - ${product.penalty_value}%`}
          </div>
        </div>
        <div className="flex gap-2">
          <button className={btnSecondaryCls} onClick={onEdit}>Edit</button>
          <button className={cn(btnSecondaryCls, "text-destructive")} onClick={onDelete}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-2">Rate tiers</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-faint font-semibold border-b border-border">
                <th className="py-1.5 pr-3">Tenure (months)</th>
                <th className="py-1.5 pr-3">Annual rate %</th>
                <th className="py-1.5 pr-3">Effective from</th>
                <th className="py-1.5 pr-3">Effective to</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {product.rate_tiers
                .slice()
                .sort((a, b) => a.tenure_months - b.tenure_months || a.effective_from.localeCompare(b.effective_from))
                .map((t) => (
                  <tr key={t.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-3">{t.tenure_months}</td>
                    <td className="py-1.5 pr-3 font-mono">{Number(t.annual_rate).toFixed(3)}</td>
                    <td className="py-1.5 pr-3">{t.effective_from}</td>
                    <td className="py-1.5 pr-3">{t.effective_to ?? "—"}</td>
                    <td className="py-1.5 text-right">
                      <button className="text-destructive hover:text-destructive/80" onClick={() => deleteM.mutate(t.id)}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              <tr>
                <td className="py-1.5 pr-3">
                  <input value={tenure} onChange={(e) => setTenure(e.target.value)} className={inputCls} placeholder="12" />
                </td>
                <td className="py-1.5 pr-3">
                  <input value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} placeholder="12.500" />
                </td>
                <td className="py-1.5 pr-3">
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
                </td>
                <td></td>
                <td className="py-1.5 text-right">
                  <button
                    className={btnSecondaryCls}
                    onClick={() => {
                      const t = parseInt(tenure);
                      const r = parseFloat(rate);
                      if (!t || !r || !from) return toast.error("Fill all fields");
                      upsertM.mutate({
                        product_id: product.id,
                        tenure_months: t,
                        annual_rate: r,
                        effective_from: from,
                      });
                      setTenure("");
                      setRate("");
                    }}
                  >
                    <Plus size={13} className="mr-1" /> Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function ProductModal({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: typeof EMPTY;
  onCancel: () => void;
  onSubmit: (v: typeof EMPTY) => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-card rounded-xl border border-border max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="font-semibold text-[15px]">FD product</div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          <FormGrid>
            <FormField label="Code" required span={3}>
              <input className={inputCls} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
            </FormField>
            <FormField label="Name" required span={9}>
              <input className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </FormField>
            <FormField label="Minimum amount" required span={4}>
              <input type="number" className={inputCls} value={v.min_amount} onChange={(e) => setV({ ...v, min_amount: Number(e.target.value) })} />
            </FormField>
            <FormField label="Maximum amount" span={4}>
              <input
                type="number"
                className={inputCls}
                value={v.max_amount ?? ""}
                onChange={(e) => setV({ ...v, max_amount: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="No limit"
              />
            </FormField>
            <FormField label="WHT rate %" required span={4}>
              <input type="number" step="0.01" className={inputCls} value={v.wht_rate} onChange={(e) => setV({ ...v, wht_rate: Number(e.target.value) })} />
            </FormField>
            <FormField label="Payout options" span={6}>
              <div className="flex gap-4 text-[13px]">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={v.allow_monthly} onChange={(e) => setV({ ...v, allow_monthly: e.target.checked })} />
                  Monthly
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={v.allow_at_maturity} onChange={(e) => setV({ ...v, allow_at_maturity: e.target.checked })} />
                  At maturity
                </label>
              </div>
            </FormField>
            <FormField label="Auto-renewal default" span={6}>
              <select className={selectCls} value={v.auto_renewal_default} onChange={(e) => setV({ ...v, auto_renewal_default: e.target.value as MaturityInstr })}>
                <option value="payout">Pay out at maturity</option>
                <option value="renew_principal">Renew principal only</option>
                <option value="renew_principal_interest">Renew principal + interest</option>
              </select>
            </FormField>
            <FormField label="Penalty type" span={6}>
              <select className={selectCls} value={v.penalty_type} onChange={(e) => setV({ ...v, penalty_type: e.target.value as PenaltyType })}>
                <option value="rate_reduction">Rate reduction (deduct from booked rate)</option>
                <option value="reprice_minus_margin">Reprice at published rate minus margin</option>
              </select>
            </FormField>
            <FormField label="Penalty value %" span={6}>
              <input type="number" step="0.01" className={inputCls} value={v.penalty_value} onChange={(e) => setV({ ...v, penalty_value: Number(e.target.value) })} />
            </FormField>
            <FormField label="Active" span={12}>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
                Available for new deposits
              </label>
            </FormField>
          </FormGrid>
          <FormActions>
            <button className={btnSecondaryCls} onClick={onCancel}>Cancel</button>
            <button className={btnPrimaryCls} onClick={() => onSubmit(v)}>Save</button>
          </FormActions>
        </div>
      </div>
    </div>
  );
}
