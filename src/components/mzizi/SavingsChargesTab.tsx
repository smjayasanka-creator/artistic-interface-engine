import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  listSavingsCharges,
  upsertSavingsCharge,
  toggleSavingsCharge,
  deleteSavingsCharge,
  listSavingsProducts,
} from "@/lib/savings.functions";
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

type Frequency = "one_time" | "monthly" | "annual";
const FREQ_LABEL: Record<Frequency, string> = {
  one_time: "One time",
  monthly: "Monthly",
  annual: "Annual",
};

type ChargeRow = {
  id: string;
  name: string;
  amount: number;
  frequency: Frequency;
  income_account_id: string;
  active: boolean;
  product_ids: string[];
};

const EMPTY: Omit<ChargeRow, "id"> = {
  name: "",
  amount: 0,
  frequency: "one_time",
  income_account_id: "",
  active: true,
  product_ids: [],
};

const GRID_COLS = "1.4fr 0.8fr 0.7fr 1.2fr 0.7fr 0.5fr 0.5fr";

export function SavingsChargesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSavingsCharges);
  const productsFn = useServerFn(listSavingsProducts);
  const glFn = useServerFn(getGlAccounts);
  const upsertFn = useServerFn(upsertSavingsCharge);
  const toggleFn = useServerFn(toggleSavingsCharge);
  const deleteFn = useServerFn(deleteSavingsCharge);

  const { data: charges } = useQuery({
    queryKey: ["savings-charges"],
    queryFn: () => listFn(),
  });
  const { data: products } = useQuery({
    queryKey: ["savings-products"],
    queryFn: () => productsFn(),
  });
  const { data: glAccounts } = useQuery({
    queryKey: ["gl-accounts-savings-charge"],
    queryFn: () => glFn(),
  });

  const [editing, setEditing] = useState<null | { id?: string; values: typeof EMPTY }>(null);

  const saveM = useMutation({
    mutationFn: (v: typeof EMPTY & { id?: string }) => upsertFn({ data: v }),
    onSuccess: () => {
      toast.success("Charge saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["savings-charges"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings-charges"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Charge deleted");
      qc.invalidateQueries({ queryKey: ["savings-charges"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = ((charges as ChargeRow[]) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const productList = ((products as any[]) ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
  }));
  const productName = (id: string) => {
    const p = productList.find((x) => x.id === id);
    return p ? `${p.code}` : "—";
  };
  const glList = ((glAccounts as any[]) ?? []).filter((a) => a.is_active !== false && a.type === "income");
  const glName = (id: string) => {
    const a = glList.find((x) => x.id === id) ?? ((glAccounts as any[]) ?? []).find((x) => x.id === id);
    return a ? `${a.code} · ${a.name}` : "—";
  };

  return (
    <Card padded={false}>
      <div className="px-5 pt-4 pb-3 text-sm font-semibold flex items-center justify-between">
        <span>
          Savings charges{" "}
          <span className="text-[11px] text-muted-foreground font-normal ml-1">{rows.length} total</span>
        </span>
        <button
          onClick={() => setEditing({ values: { ...EMPTY } })}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-[12px] font-semibold hover:bg-primary-hover"
        >
          + New charge
        </button>
      </div>

      <div
        className="grid text-[10px] uppercase tracking-wider text-faint font-semibold py-2 px-5 border-y border-border bg-secondary/40"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <div>Name</div>
        <div>Amount</div>
        <div>Frequency</div>
        <div>Income account</div>
        <div>Products</div>
        <div className="text-right">Status</div>
        <div className="text-right">Actions</div>
      </div>

      {rows.map((c) => (
        <div
          key={c.id}
          className="grid items-center text-[12px] py-1.5 px-5 border-b border-row-divider last:border-b-0"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <div className="truncate font-medium" title={c.name}>{c.name}</div>
          <div className="font-mono text-[11.5px]">{money(c.amount)}</div>
          <div className="text-[11.5px] text-muted-foreground">{FREQ_LABEL[c.frequency]}</div>
          <div className="text-[11px] text-muted-foreground truncate" title={glName(c.income_account_id)}>
            {glName(c.income_account_id)}
          </div>
          <div className="text-[11px] text-muted-foreground truncate" title={c.product_ids.map(productName).join(", ")}>
            {c.product_ids.length === 0
              ? "—"
              : c.product_ids.length <= 2
              ? c.product_ids.map(productName).join(", ")
              : `${c.product_ids.length} products`}
          </div>
          <div className="text-right">
            <button
              onClick={() => toggleM.mutate({ id: c.id, active: !c.active })}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border",
                c.active
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                  : "border-muted bg-muted text-muted-foreground",
              )}
            >
              {c.active ? "Active" : "Off"}
            </button>
          </div>
          <div className="text-right flex gap-2 justify-end">
            <button
              onClick={() =>
                setEditing({
                  id: c.id,
                  values: {
                    name: c.name,
                    amount: Number(c.amount),
                    frequency: c.frequency,
                    income_account_id: c.income_account_id,
                    active: c.active,
                    product_ids: c.product_ids ?? [],
                  },
                })
              }
              className="text-[10.5px] px-2 py-0.5 rounded border border-border hover:border-primary hover:text-primary transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete charge "${c.name}"?`)) deleteM.mutate(c.id);
              }}
              className="text-[10.5px] px-2 py-0.5 rounded border border-border hover:border-rose-500 hover:text-rose-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {rows.length === 0 && (
        <div className="text-center text-faint text-sm py-8">No savings charges yet.</div>
      )}

      {editing && (
        <ChargeModal
          initial={editing.values}
          chargeId={editing.id}
          saving={saveM.isPending}
          products={productList}
          glAccounts={glList}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => saveM.mutate(editing.id ? { ...v, id: editing.id } : v)}
        />
      )}
    </Card>
  );
}

function ChargeModal({
  initial,
  chargeId,
  saving,
  products,
  glAccounts,
  onCancel,
  onSubmit,
}: {
  initial: typeof EMPTY;
  chargeId?: string;
  saving: boolean;
  products: { id: string; code: string; name: string }[];
  glAccounts: { id: string; code: string; name: string }[];
  onCancel: () => void;
  onSubmit: (v: typeof EMPTY) => void;
}) {
  const [v, setV] = useState(initial);

  function toggleProduct(id: string) {
    setV((prev) => ({
      ...prev,
      product_ids: prev.product_ids.includes(id)
        ? prev.product_ids.filter((x) => x !== id)
        : [...prev.product_ids, id],
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) return toast.error("Charge name is required");
    if (!v.income_account_id) return toast.error("Income account is required");
    if (v.amount < 0) return toast.error("Amount must be zero or positive");
    if (v.product_ids.length === 0) return toast.error("Select at least one applicable product");
    onSubmit(v);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-card rounded-xl border border-border max-w-2xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="font-semibold text-[15px]">
            {chargeId ? "Edit savings charge" : "New savings charge"}
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 flex flex-col gap-5">
          <FormGrid>
            <FormField label="Charge name" required span={8}>
              <input
                className={inputCls}
                value={v.name}
                onChange={(e) => setV({ ...v, name: e.target.value })}
                placeholder="e.g. Monthly ledger fee"
              />
            </FormField>
            <FormField label="Status" span={4}>
              <label className="flex items-center gap-2 text-[13px] h-[34px]">
                <input
                  type="checkbox"
                  checked={v.active}
                  onChange={(e) => setV({ ...v, active: e.target.checked })}
                />
                Active
              </label>
            </FormField>

            <FormField label="Charge amount" required span={4}>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                value={v.amount}
                onChange={(e) => setV({ ...v, amount: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="Frequency" required span={4}>
              <select
                className={selectCls}
                value={v.frequency}
                onChange={(e) => setV({ ...v, frequency: e.target.value as Frequency })}
              >
                <option value="one_time">One time</option>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </FormField>
            <FormField
              label="Income account"
              required
              span={4}
              hint="Chart of Account (income)"
            >
              <select
                className={selectCls}
                value={v.income_account_id}
                onChange={(e) => setV({ ...v, income_account_id: e.target.value })}
              >
                <option value="">— Select account —</option>
                {glAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="Applicable products"
              required
              span={12}
              hint="The charge posts a debit to the account's product deposit-liability GL automatically."
            >
              {products.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic">
                  No savings products yet. Create one first.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 border border-border rounded-md p-2 bg-secondary/20">
                  {products.map((p) => {
                    const on = v.product_ids.includes(p.id);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => toggleProduct(p.id)}
                        className={cn(
                          "text-[11.5px] px-2 py-1 rounded border transition-colors",
                          on
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-card border-border hover:border-primary/40",
                        )}
                      >
                        <span className="font-mono">{p.code}</span> · {p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </FormField>
          </FormGrid>

          <div className="text-[11.5px] text-muted-foreground bg-secondary/40 border border-border rounded-md px-3 py-2">
            <strong>Debit account:</strong> automatically posted to each applicable product's deposit-liability
            (capital) account when the charge is applied. No configuration needed here.
          </div>

          <FormActions>
            <button type="button" onClick={onCancel} className={btnSecondaryCls}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={btnPrimaryCls}>
              {saving ? "Saving…" : chargeId ? "Save changes" : "Create charge"}
            </button>
          </FormActions>
        </form>
      </div>
    </div>
  );
}
