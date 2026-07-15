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
import { getGlAccounts } from "@/lib/mzizi.functions";
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
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

type PenaltyType = "rate_reduction" | "reprice_minus_margin";
type MaturityInstr = "payout" | "renew_principal" | "renew_principal_interest";

type RateTier = {
  id: string;
  tenure_months: number;
  annual_rate: number;
  effective_from: string;
  effective_to: string | null;
};

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
  rate_tiers: RateTier[];
};

const EMPTY = {
  code: "",
  name: "",
  min_amount: 10000,
  max_amount: null as number | null,
  min_tenure_months: 3,
  max_tenure_months: 60,
  allow_monthly: true,
  allow_at_maturity: true,
  penalty_type: "rate_reduction" as PenaltyType,
  penalty_value: 1,
  wht_rate: 5,
  auto_renewal_default: "payout" as MaturityInstr,
  active: true,
  capital_account_id: null as string | null,
  interest_payable_account_id: null as string | null,
  interest_expense_account_id: null as string | null,
  wht_payable_account_id: null as string | null,
  introducer_commission_account_id: null as string | null,
  marketing_incentive_account_id: null as string | null,
};

const GRID_COLS = "0.5fr 1.4fr 0.95fr 0.75fr 0.45fr 0.85fr 0.55fr 0.4fr";

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

  const [editing, setEditing] = useState<null | {
    id?: string;
    values: typeof EMPTY;
    rateTiers: RateTier[];
  }>(null);

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
    mutationFn: (v: { id: string; patch: Partial<typeof EMPTY> }) => updateFn({ data: v }),
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
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["fd-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sorted = (products ?? []).slice().sort((a: any, b: any) => a.code.localeCompare(b.code));

  return (
    <Card padded={false}>
      <div className="px-5 pt-4 pb-3 text-sm font-semibold flex items-center justify-between">
        <span>
          Fixed Deposit products{" "}
          <span className="text-[11px] text-muted-foreground font-normal ml-1">{products?.length ?? 0} total</span>
        </span>
        <button
          onClick={() => setEditing({ values: { ...EMPTY }, rateTiers: [] })}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-[12px] font-semibold hover:bg-primary-hover"
        >
          + New product
        </button>
      </div>

      <div
        className="grid text-[10px] uppercase tracking-wider text-faint font-semibold py-2 px-5 border-y border-border bg-secondary/40"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <div>Code</div>
        <div>Name</div>
        <div>Amount range</div>
        <div>Payout</div>
        <div>WHT</div>
        <div>Penalty</div>
        <div className="text-right">Status</div>
        <div className="text-right">Edit</div>
      </div>

      {sorted.map((p: any) => {
        const product = p as ProductRow;
        const payoutParts = [
          product.allow_monthly && "Monthly",
          product.allow_at_maturity && "At maturity",
        ].filter(Boolean);
        return (
          <div
            key={product.id}
            className="grid items-center text-[12px] py-1.5 px-5 border-b border-row-divider last:border-b-0"
            style={{ gridTemplateColumns: GRID_COLS }}
          >
            <div className="font-mono font-medium text-[11.5px]">{product.code}</div>
            <div className="truncate" title={product.name}>{product.name}</div>
            <div className="text-muted-foreground">
              <span className="text-foreground">{money(product.min_amount)}</span>
              {" - "}
              {product.max_amount != null ? money(product.max_amount) : "—"}
            </div>
            <div className="text-muted-foreground truncate" title={payoutParts.join(" · ") || "None"}>
              {payoutParts.join(" · ") || "—"}
            </div>
            <div className="font-mono text-[11px]">{product.wht_rate}%</div>
            <div className="text-muted-foreground truncate">
              {product.penalty_type === "rate_reduction"
                ? `-${product.penalty_value}% rate`
                : `Reprice -${product.penalty_value}%`}
            </div>
            <div className="text-right">
              <button
                onClick={() => updateM.mutate({ id: product.id, patch: { active: !product.active } })}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border",
                  product.active
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                    : "border-muted bg-muted text-muted-foreground",
                )}
              >
                {product.active ? "Active" : "Off"}
              </button>
            </div>
            <div className="text-right">
              <button
                onClick={() =>
                  setEditing({
                    id: product.id,
                    values: {
                      code: product.code,
                      name: product.name,
                      min_amount: Number(product.min_amount),
                      max_amount: product.max_amount == null ? null : Number(product.max_amount),
                      min_tenure_months: Number((product as any).min_tenure_months ?? 3),
                      max_tenure_months: Number((product as any).max_tenure_months ?? 60),
                      allow_monthly: product.allow_monthly,
                      allow_at_maturity: product.allow_at_maturity,
                      penalty_type: product.penalty_type,
                      penalty_value: Number(product.penalty_value),
                      wht_rate: Number(product.wht_rate),
                      auto_renewal_default: product.auto_renewal_default,
                      active: product.active,
                      capital_account_id: (product as any).capital_account_id ?? null,
                      interest_payable_account_id: (product as any).interest_payable_account_id ?? null,
                      interest_expense_account_id: (product as any).interest_expense_account_id ?? null,
                      wht_payable_account_id: (product as any).wht_payable_account_id ?? null,
                      introducer_commission_account_id: (product as any).introducer_commission_account_id ?? null,
                      marketing_incentive_account_id: (product as any).marketing_incentive_account_id ?? null,
                    },
                    rateTiers: product.rate_tiers,
                  })
                }
                className="text-[10.5px] px-2 py-0.5 rounded border border-border hover:border-primary hover:text-primary transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        );
      })}

      {products && products.length === 0 && (
        <div className="text-center text-faint text-sm py-8">No products yet.</div>
      )}

      {editing && (
        <ProductModal
          initial={editing.values}
          rateTiers={editing.rateTiers}
          productId={editing.id}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => (editing.id ? updateM.mutate({ id: editing.id, patch: v }) : createM.mutate(v))}
          onDelete={editing.id ? () => deleteM.mutate(editing.id!) : undefined}
        />
      )}
    </Card>
  );
}

function ProductModal({
  initial,
  rateTiers,
  productId,
  onCancel,
  onSubmit,
  onDelete,
}: {
  initial: typeof EMPTY;
  rateTiers: RateTier[];
  productId?: string;
  onCancel: () => void;
  onSubmit: (v: typeof EMPTY) => void;
  onDelete?: () => void;
}) {
  const [v, setV] = useState(initial);
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertFdRateTier);
  const deleteFn = useServerFn(deleteFdRateTier);
  const glListFn = useServerFn(getGlAccounts);
  const { data: glAccounts } = useQuery({
    queryKey: ["gl-accounts-fd-product"],
    queryFn: () => glListFn(),
  });
  const glOptions = ((glAccounts as any[]) ?? [])
    .filter((a) => a.is_active !== false)
    .sort((a, b) => a.code.localeCompare(b.code));
  const glSelect = (
    key:
      | "capital_account_id"
      | "interest_payable_account_id"
      | "interest_expense_account_id"
      | "wht_payable_account_id"
      | "introducer_commission_account_id"
      | "marketing_incentive_account_id",
  ) => (
    <select
      className={selectCls}
      value={v[key] ?? ""}
      onChange={(e) => setV({ ...v, [key]: e.target.value || null })}
    >
      <option value="">— Select account —</option>
      {glOptions.map((a) => (
        <option key={a.id} value={a.id}>
          {a.code} · {a.name}
        </option>
      ))}
    </select>
  );

  const upsertM = useMutation({
    mutationFn: (tier: {
      id?: string;
      product_id: string;
      tenure_months: number;
      annual_rate: number;
      effective_from: string;
      effective_to?: string | null;
    }) => upsertFn({ data: tier }),
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
  const [to, setTo] = useState("");

  const sortedTiers = rateTiers
    .slice()
    .sort((a, b) => a.tenure_months - b.tenure_months || a.effective_from.localeCompare(b.effective_from));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-card rounded-xl border border-border max-w-3xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="font-semibold text-[15px]">{productId ? "Edit FD product" : "New FD product"}</div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-5">
          <FormGrid>
            <FormField label="Code" required span={3}>
              <input className={inputCls} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
            </FormField>
            <FormField label="Name" required span={9}>
              <input className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </FormField>
            <FormField label="Minimum amount" required span={4}>
              <input
                type="number"
                className={inputCls}
                value={v.min_amount}
                onChange={(e) => setV({ ...v, min_amount: Number(e.target.value) })}
              />
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
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={v.wht_rate}
                onChange={(e) => setV({ ...v, wht_rate: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="Payout options" span={6}>
              <div className="flex gap-4 text-[13px]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={v.allow_monthly}
                    onChange={(e) => setV({ ...v, allow_monthly: e.target.checked })}
                  />
                  Monthly
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={v.allow_at_maturity}
                    onChange={(e) => setV({ ...v, allow_at_maturity: e.target.checked })}
                  />
                  At maturity
                </label>
              </div>
            </FormField>
            <FormField label="Auto-renewal default" span={6}>
              <select
                className={selectCls}
                value={v.auto_renewal_default}
                onChange={(e) => setV({ ...v, auto_renewal_default: e.target.value as MaturityInstr })}
              >
                <option value="payout">Pay out at maturity</option>
                <option value="renew_principal">Renew principal only</option>
                <option value="renew_principal_interest">Renew principal + interest</option>
              </select>
            </FormField>
            <FormField label="Penalty type" span={6}>
              <select
                className={selectCls}
                value={v.penalty_type}
                onChange={(e) => setV({ ...v, penalty_type: e.target.value as PenaltyType })}
              >
                <option value="rate_reduction">Rate reduction (deduct from booked rate)</option>
                <option value="reprice_minus_margin">Reprice at published rate minus margin</option>
              </select>
            </FormField>
            <FormField label="Penalty value %" span={6}>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={v.penalty_value}
                onChange={(e) => setV({ ...v, penalty_value: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="Active" span={12}>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
                Available for new deposits
              </label>
            </FormField>
          </FormGrid>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-2">
              GL account mapping
            </div>
            <FormGrid>
              <FormField label="Capital account" span={6}>{glSelect("capital_account_id")}</FormField>
              <FormField label="Interest payable account" span={6}>{glSelect("interest_payable_account_id")}</FormField>
              <FormField label="Interest expense account" span={6}>{glSelect("interest_expense_account_id")}</FormField>
              <FormField label="WHT payable account" span={6}>{glSelect("wht_payable_account_id")}</FormField>
              <FormField label="Introducer commission account" span={6}>{glSelect("introducer_commission_account_id")}</FormField>
              <FormField label="Marketing incentive account" span={6}>{glSelect("marketing_incentive_account_id")}</FormField>
            </FormGrid>
          </div>

          {productId && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-2">Rate tiers</div>
              <div className="overflow-x-auto border border-border rounded-md">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-faint font-semibold border-b border-border bg-secondary/40">
                      <th className="py-1.5 px-3">Tenure (months)</th>
                      <th className="py-1.5 px-3">Annual rate %</th>
                      <th className="py-1.5 px-3">Effective from</th>
                      <th className="py-1.5 px-3">Effective to</th>
                      <th className="py-1.5 px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTiers.map((t) => (
                      <tr key={t.id} className="border-b border-border/50 last:border-b-0">
                        <td className="py-1.5 px-3">{t.tenure_months}</td>
                        <td className="py-1.5 px-3 font-mono">{Number(t.annual_rate).toFixed(3)}</td>
                        <td className="py-1.5 px-3">{t.effective_from}</td>
                        <td className="py-1.5 px-3">{t.effective_to ?? "—"}</td>
                        <td className="py-1.5 px-3 text-right">
                          <button
                            className="text-destructive hover:text-destructive/80"
                            onClick={() => deleteM.mutate(t.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td className="py-1.5 px-3">
                        <input
                          value={tenure}
                          onChange={(e) => setTenure(e.target.value)}
                          className={inputCls}
                          placeholder="12"
                        />
                      </td>
                      <td className="py-1.5 px-3">
                        <input
                          value={rate}
                          onChange={(e) => setRate(e.target.value)}
                          className={inputCls}
                          placeholder="12.500"
                        />
                      </td>
                      <td className="py-1.5 px-3">
                        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
                      </td>
                      <td className="py-1.5 px-3">
                        <input
                          type="date"
                          value={to}
                          onChange={(e) => setTo(e.target.value)}
                          className={inputCls}
                          placeholder="Open-ended"
                        />
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <button
                          className={btnSecondaryCls}
                          onClick={() => {
                            const t = parseInt(tenure);
                            const r = parseFloat(rate);
                            if (!t || !r || !from || !productId) return toast.error("Fill all fields");
                            upsertM.mutate({
                              product_id: productId,
                              tenure_months: t,
                              annual_rate: r,
                              effective_from: from,
                              effective_to: to || null,
                            });
                            setTenure("");
                            setRate("");
                            setTo("");
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
          )}

          <FormActions>
            {onDelete && (
              <button
                type="button"
                className={cn(btnSecondaryCls, "text-destructive border-destructive/40 hover:bg-destructive/10")}
                onClick={() => {
                  if (confirm("Delete this product and all its rate tiers?")) onDelete();
                }}
              >
                Delete
              </button>
            )}
            <div className="flex-1"></div>
            <button type="button" className={btnSecondaryCls} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={btnPrimaryCls}
              onClick={() => onSubmit(v)}
              disabled={upsertM.isPending || deleteM.isPending}
            >
              Save
            </button>
          </FormActions>
        </div>
      </div>
    </div>
  );
}
