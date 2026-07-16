import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  listLoanCharges,
  upsertLoanCharge,
  toggleLoanCharge,
  deleteLoanCharge,
  type LoanChargeOrigin,
  type LoanChargeType,
} from "@/lib/loan-charges.functions";
import { getAllLoanProducts, getGlAccounts, getClients } from "@/lib/mzizi.functions";
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

type ChargeRow = {
  id: string;
  name: string;
  origin: LoanChargeOrigin;
  charge_type: LoanChargeType;
  amount: number;
  receivable_account_id: string;
  credit_account_id: string;
  capitalize: boolean;
  capitalized_receivable_account_id: string | null;
  supplier_client_id: string | null;
  active: boolean;
  product_ids: string[];
};

const EMPTY: Omit<ChargeRow, "id"> = {
  name: "",
  origin: "inhouse",
  charge_type: "fixed",
  amount: 0,
  receivable_account_id: "",
  credit_account_id: "",
  capitalize: false,
  capitalized_receivable_account_id: null,
  supplier_client_id: null,
  active: true,
  product_ids: [],
};

const ORIGIN_LABEL: Record<LoanChargeOrigin, string> = {
  inhouse: "In-house",
  outside: "Outside",
};
const TYPE_LABEL: Record<LoanChargeType, string> = {
  fixed: "Fixed",
  variable: "Variable %",
  manual: "Manual",
};

const GRID_COLS = "1.3fr 0.7fr 0.7fr 0.7fr 1fr 1fr 1fr 0.6fr 0.5fr 0.5fr";

export function LoanChargesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLoanCharges);
  const productsFn = useServerFn(getAllLoanProducts);
  const glFn = useServerFn(getGlAccounts);
  const upsertFn = useServerFn(upsertLoanCharge);
  const toggleFn = useServerFn(toggleLoanCharge);
  const deleteFn = useServerFn(deleteLoanCharge);

  const clientsFn = useServerFn(getClients);
  const { data: charges } = useQuery({ queryKey: ["loan-charges"], queryFn: () => listFn() });
  const { data: products } = useQuery({ queryKey: ["loan-products-all"], queryFn: () => productsFn() });
  const { data: glAccounts } = useQuery({ queryKey: ["gl-accounts-loan-charge"], queryFn: () => glFn() });
  const { data: clients } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => clientsFn({ data: { filter: "all" } }),
  });

  const [editing, setEditing] = useState<null | { id?: string; values: typeof EMPTY }>(null);

  const saveM = useMutation({
    mutationFn: (v: typeof EMPTY & { id?: string }) => upsertFn({ data: v }),
    onSuccess: () => {
      toast.success("Charge saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["loan-charges"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loan-charges"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Charge deleted");
      qc.invalidateQueries({ queryKey: ["loan-charges"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = ((charges as ChargeRow[]) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const productList = ((products as any[]) ?? []).map((p) => ({ id: p.id, code: p.code ?? "", name: p.name }));
  const productName = (id: string) => {
    const p = productList.find((x) => x.id === id);
    return p ? (p.code || p.name) : "—";
  };
  const glAll = ((glAccounts as any[]) ?? []);
  const receivableList = glAll.filter((a) => a.is_active !== false && a.type === "asset");
  // Credit side: income (in-house) or liability (outside — supplier control)
  const creditList = glAll.filter((a) => a.is_active !== false && (a.type === "income" || a.type === "liability"));
  const glName = (id: string) => {
    const a = glAll.find((x) => x.id === id);
    return a ? `${a.code} · ${a.name}` : "—";
  };
  const clientList = ((clients as any[]) ?? []).map((c) => ({ id: c.id, full_name: c.full_name }));
  const clientName = (id: string | null) => {
    if (!id) return "—";
    const c = clientList.find((x) => x.id === id);
    return c ? c.full_name : "—";
  };

  return (
    <Card padded={false}>
      <div className="px-5 pt-4 pb-3 text-sm font-semibold flex items-center justify-between">
        <span>
          Loan charges{" "}
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
        <div>Origin</div>
        <div>Type</div>
        <div>Amount</div>
        <div>Receivable ledger</div>
        <div>Credit account</div>
        <div>Supplier</div>
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
          <div className="text-[11.5px] text-muted-foreground">{ORIGIN_LABEL[c.origin]}</div>
          <div className="text-[11.5px] text-muted-foreground">{TYPE_LABEL[c.charge_type]}</div>
          <div className="font-mono text-[11.5px]">
            {c.charge_type === "manual"
              ? <span className="text-muted-foreground italic font-sans">Manual</span>
              : c.charge_type === "variable" ? `${Number(c.amount)}%` : money(c.amount)}
          </div>
          <div className="text-[11px] text-muted-foreground truncate" title={glName(c.receivable_account_id)}>
            {glName(c.receivable_account_id)}
          </div>
          <div className="text-[11px] text-muted-foreground truncate" title={glName(c.credit_account_id)}>
            {glName(c.credit_account_id)}
          </div>
          <div className="text-[11px] text-muted-foreground truncate" title={clientName(c.supplier_client_id)}>
            {c.origin === "outside" ? clientName(c.supplier_client_id) : "—"}
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
                    origin: c.origin,
                    charge_type: c.charge_type,
                    amount: Number(c.amount),
                    receivable_account_id: c.receivable_account_id,
                    credit_account_id: c.credit_account_id,
                    capitalize: !!c.capitalize,
                    capitalized_receivable_account_id: c.capitalized_receivable_account_id ?? null,
                    supplier_client_id: c.supplier_client_id ?? null,
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
        <div className="text-center text-faint text-sm py-8">No loan charges yet.</div>
      )}

      {editing && (
        <ChargeModal
          initial={editing.values}
          chargeId={editing.id}
          saving={saveM.isPending}
          products={productList}
          receivableAccounts={receivableList}
          creditAccounts={creditList}
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
  receivableAccounts,
  creditAccounts,
  onCancel,
  onSubmit,
}: {
  initial: typeof EMPTY;
  chargeId?: string;
  saving: boolean;
  products: { id: string; code: string; name: string }[];
  receivableAccounts: { id: string; code: string; name: string; type: string }[];
  creditAccounts: { id: string; code: string; name: string; type: string }[];
  onCancel: () => void;
  onSubmit: (v: typeof EMPTY) => void;
}) {
  const [v, setV] = useState(initial);

  // Filter credit accounts by origin: inhouse -> income, outside -> liability (supplier control)
  const creditFiltered = creditAccounts.filter((a) =>
    v.origin === "inhouse" ? a.type === "income" : a.type === "liability",
  );

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
    if (!v.receivable_account_id) return toast.error("Receivable ledger is required");
    if (!v.credit_account_id) return toast.error(v.origin === "inhouse" ? "Income account is required" : "Supplier control account is required");
    if (v.amount < 0) return toast.error("Amount must be zero or positive");
    if (v.charge_type === "variable" && v.amount > 100) return toast.error("Variable percent must be 0–100");
    if (v.capitalize && !v.capitalized_receivable_account_id) return toast.error("Capitalized-charges receivable ledger is required");
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
            {chargeId ? "Edit loan charge" : "New loan charge"}
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
                placeholder="e.g. Processing fee, Insurance, Legal fee"
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

            <FormField label="Origin" required span={4} hint="In-house = own income · Outside = 3rd-party pass-through">
              <select
                className={selectCls}
                value={v.origin}
                onChange={(e) => setV({ ...v, origin: e.target.value as LoanChargeOrigin, credit_account_id: "" })}
              >
                <option value="inhouse">In-house</option>
                <option value="outside">Outside</option>
              </select>
            </FormField>
            <FormField label="Charge type" required span={4}>
              <select
                className={selectCls}
                value={v.charge_type}
                onChange={(e) => setV({ ...v, charge_type: e.target.value as LoanChargeType })}
              >
                <option value="fixed">Fixed amount</option>
                <option value="variable">Variable (% of principal)</option>
              </select>
            </FormField>
            <FormField label={v.charge_type === "variable" ? "Percent" : "Amount"} required span={4}>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                value={v.amount}
                onChange={(e) => setV({ ...v, amount: Number(e.target.value) })}
              />
            </FormField>

            <FormField label="Receivable ledger" required span={6} hint="Asset account debited when the charge is raised">
              <select
                className={selectCls}
                value={v.receivable_account_id}
                onChange={(e) => setV({ ...v, receivable_account_id: e.target.value })}
              >
                <option value="">— Select account —</option>
                {receivableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label={v.origin === "inhouse" ? "Income account" : "Supplier control account"}
              required
              span={6}
              hint={v.origin === "inhouse" ? "Income GL credited on charge" : "Liability GL owed to the third party"}
            >
              <select
                className={selectCls}
                value={v.credit_account_id}
                onChange={(e) => setV({ ...v, credit_account_id: e.target.value })}
              >
                <option value="">— Select account —</option>
                {creditFiltered.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Capitalize" span={4} hint="Add to loan capital; don't collect upfront">
              <label className="flex items-center gap-2 text-[13px] h-[34px]">
                <input
                  type="checkbox"
                  checked={v.capitalize}
                  onChange={(e) =>
                    setV({
                      ...v,
                      capitalize: e.target.checked,
                      capitalized_receivable_account_id: e.target.checked ? v.capitalized_receivable_account_id : null,
                    })
                  }
                />
                Capitalize to loan capital
              </label>
            </FormField>
            <FormField
              label="Capitalized-charges receivable"
              required={v.capitalize}
              span={8}
              hint="Asset GL debited at disbursement, credited as rentals fall due"
            >
              <select
                className={selectCls}
                disabled={!v.capitalize}
                value={v.capitalized_receivable_account_id ?? ""}
                onChange={(e) => setV({ ...v, capitalized_receivable_account_id: e.target.value || null })}
              >
                <option value="">— Select account —</option>
                {receivableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </FormField>


            <FormField label="Applicable loan products" required span={12}>
              {products.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic">
                  No loan products yet. Create one first.
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
                        {p.code ? <span className="font-mono">{p.code}</span> : null}
                        {p.code ? " · " : ""}{p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </FormField>
          </FormGrid>

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
