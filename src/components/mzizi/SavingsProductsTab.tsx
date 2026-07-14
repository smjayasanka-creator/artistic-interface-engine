import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  listSavingsProducts,
  upsertSavingsProduct,
  toggleSavingsProduct,
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

const CURRENCIES = ["KES", "UGX", "TZS", "RWF", "LKR", "USD", "EUR", "GBP"] as const;

type Segment = "normal" | "minor" | "senior" | "fixed" | "transaction";

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "normal", label: "Normal Savings" },
  { value: "minor", label: "Minor Savings" },
  { value: "senior", label: "Senior Savings" },
  { value: "fixed", label: "Fixed Savings" },
  { value: "transaction", label: "Transaction Account" },
];
const segmentLabel = (s: string) => SEGMENTS.find((x) => x.value === s)?.label ?? s;

type ProductRow = {
  id: string;
  code: string;
  name: string;
  currency: string;
  interest_rate_pct: number;
  min_opening_balance: number;
  min_balance: number;
  opening_fee: number;
  closure_fee: number;
  dormancy_days: number;
  passbook_required: boolean;
  passbook_series_prefix: string | null;
  active: boolean;
  segment: Segment;
  deposit_liability_account_id: string | null;
  fee_income_account_id: string | null;
  interest_expense_account_id: string | null;
};

const EMPTY = {
  code: "",
  name: "",
  currency: "KES",
  interest_rate_pct: 3,
  min_opening_balance: 500,
  min_balance: 0,
  opening_fee: 0,
  closure_fee: 0,
  dormancy_days: 180,
  passbook_required: false,
  passbook_series_prefix: null as string | null,
  active: true,
  segment: "normal" as Segment,
  deposit_liability_account_id: null as string | null,
  fee_income_account_id: null as string | null,
  interest_expense_account_id: null as string | null,
};

const GRID_COLS = "0.6fr 1.35fr 0.85fr 0.5fr 0.65fr 0.75fr 0.55fr 0.45fr 0.4fr";


export function SavingsProductsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSavingsProducts);
  const upsertFn = useServerFn(upsertSavingsProduct);
  const toggleFn = useServerFn(toggleSavingsProduct);
  const { data: products } = useQuery({
    queryKey: ["savings-products"],
    queryFn: () => listFn(),
  });

  const [editing, setEditing] = useState<null | { id?: string; values: typeof EMPTY }>(null);

  const saveM = useMutation({
    mutationFn: (v: typeof EMPTY & { id?: string }) => upsertFn({ data: v }),
    onSuccess: () => {
      toast.success("Product saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["savings-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings-products"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sorted = ((products as ProductRow[]) ?? []).slice().sort((a, b) => a.code.localeCompare(b.code));

  return (
    <Card padded={false}>
      <div className="px-5 pt-4 pb-3 text-sm font-semibold flex items-center justify-between">
        <span>
          Savings products{" "}
          <span className="text-[11px] text-muted-foreground font-normal ml-1">{sorted.length} total</span>
        </span>
        <button
          onClick={() => setEditing({ values: { ...EMPTY } })}
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
        <div>Ccy</div>
        <div>Interest</div>
        <div>Min opening</div>
        <div>Passbook</div>
        <div className="text-right">Status</div>
        <div className="text-right">Edit</div>
      </div>

      {sorted.map((p) => (
        <div
          key={p.id}
          className="grid items-center text-[12px] py-1.5 px-5 border-b border-row-divider last:border-b-0"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <div className="font-mono font-medium text-[11.5px]">{p.code}</div>
          <div className="truncate" title={p.name}>{p.name}</div>
          <div className="font-mono text-[11px]">{p.currency}</div>
          <div className="font-mono text-[11px]">{Number(p.interest_rate_pct)}% p.a.</div>
          <div className="text-muted-foreground">{money(p.min_opening_balance)}</div>
          <div className="text-muted-foreground">
            {p.passbook_required ? `Yes${p.passbook_series_prefix ? ` · ${p.passbook_series_prefix}` : ""}` : "No"}
          </div>
          <div className="text-right">
            <button
              onClick={() => toggleM.mutate({ id: p.id, active: !p.active })}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border",
                p.active
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                  : "border-muted bg-muted text-muted-foreground",
              )}
            >
              {p.active ? "Active" : "Off"}
            </button>
          </div>
          <div className="text-right">
            <button
              onClick={() =>
                setEditing({
                  id: p.id,
                  values: {
                    code: p.code,
                    name: p.name,
                    currency: p.currency,
                    interest_rate_pct: Number(p.interest_rate_pct),
                    min_opening_balance: Number(p.min_opening_balance),
                    min_balance: Number(p.min_balance),
                    opening_fee: Number(p.opening_fee),
                    closure_fee: Number(p.closure_fee),
                    dormancy_days: Number(p.dormancy_days),
                    passbook_required: p.passbook_required,
                    passbook_series_prefix: p.passbook_series_prefix,
                    active: p.active,
                    deposit_liability_account_id: p.deposit_liability_account_id,
                    fee_income_account_id: p.fee_income_account_id,
                    interest_expense_account_id: p.interest_expense_account_id,
                  },
                })
              }
              className="text-[10.5px] px-2 py-0.5 rounded border border-border hover:border-primary hover:text-primary transition-colors"
            >
              Edit
            </button>
          </div>
        </div>
      ))}

      {sorted.length === 0 && (
        <div className="text-center text-faint text-sm py-8">No savings products yet.</div>
      )}

      {editing && (
        <ProductModal
          initial={editing.values}
          productId={editing.id}
          saving={saveM.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => saveM.mutate(editing.id ? { ...v, id: editing.id } : v)}
        />
      )}
    </Card>
  );
}

function ProductModal({
  initial,
  productId,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: typeof EMPTY;
  productId?: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (v: typeof EMPTY) => void;
}) {
  const [v, setV] = useState(initial);
  const glListFn = useServerFn(getGlAccounts);
  const { data: glAccounts } = useQuery({
    queryKey: ["gl-accounts-savings-product"],
    queryFn: () => glListFn(),
  });
  const glOptions = ((glAccounts as any[]) ?? [])
    .filter((a) => a.is_active !== false)
    .sort((a, b) => a.code.localeCompare(b.code));

  const glSelect = (
    key:
      | "deposit_liability_account_id"
      | "fee_income_account_id"
      | "interest_expense_account_id",
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.code.trim() || !v.name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    onSubmit(v);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-card rounded-xl border border-border max-w-3xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="font-semibold text-[15px]">
            {productId ? "Edit savings product" : "New savings product"}
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 flex flex-col gap-5">
          <FormGrid>
            <FormField label="Code" required span={3}>
              <input
                className={inputCls}
                value={v.code}
                onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })}
                placeholder="SAV-REG"
              />
            </FormField>
            <FormField label="Name" required span={6}>
              <input
                className={inputCls}
                value={v.name}
                onChange={(e) => setV({ ...v, name: e.target.value })}
                placeholder="Regular Savings"
              />
            </FormField>
            <FormField label="Currency" required span={3}>
              <select
                className={selectCls + " font-mono"}
                value={v.currency}
                onChange={(e) => setV({ ...v, currency: e.target.value })}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Interest rate % p.a." required span={4}>
              <input
                type="number"
                step="0.01"
                min={0}
                className={inputCls}
                value={v.interest_rate_pct}
                onChange={(e) => setV({ ...v, interest_rate_pct: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="Minimum opening balance" required span={4}>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={v.min_opening_balance}
                onChange={(e) => setV({ ...v, min_opening_balance: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="Minimum running balance" span={4}>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={v.min_balance}
                onChange={(e) => setV({ ...v, min_balance: Number(e.target.value) })}
              />
            </FormField>

            <FormField label="Opening fee" span={4}>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={v.opening_fee}
                onChange={(e) => setV({ ...v, opening_fee: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="Closure fee" span={4}>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={v.closure_fee}
                onChange={(e) => setV({ ...v, closure_fee: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="Dormancy days" span={4} hint="Days of inactivity before account is marked dormant">
              <input
                type="number"
                min={0}
                className={inputCls}
                value={v.dormancy_days}
                onChange={(e) => setV({ ...v, dormancy_days: Number(e.target.value) })}
              />
            </FormField>

            <FormField label="Passbook" span={4}>
              <label className="flex items-center gap-2 text-[13px] h-[34px]">
                <input
                  type="checkbox"
                  checked={v.passbook_required}
                  onChange={(e) => setV({ ...v, passbook_required: e.target.checked })}
                />
                Passbook required
              </label>
            </FormField>
            <FormField label="Passbook series prefix" span={4}>
              <input
                className={inputCls}
                value={v.passbook_series_prefix ?? ""}
                onChange={(e) =>
                  setV({ ...v, passbook_series_prefix: e.target.value.trim() === "" ? null : e.target.value })
                }
                placeholder="e.g. PB-A"
                disabled={!v.passbook_required}
              />
            </FormField>
            <FormField label="Status" span={4}>
              <label className="flex items-center gap-2 text-[13px] h-[34px]">
                <input
                  type="checkbox"
                  checked={v.active}
                  onChange={(e) => setV({ ...v, active: e.target.checked })}
                />
                Available for new accounts
              </label>
            </FormField>
          </FormGrid>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-2">
              GL account mapping
            </div>
            <p className="text-[11.5px] text-muted-foreground -mt-1 mb-2">
              Optional overrides. Leave blank to use the default chart-of-accounts codes (2100 deposit
              liability, 4100 fee income, 5100 interest expense). Cash / bank GL is selected at the transaction point.
            </p>
            <FormGrid>
              <FormField label="Deposit liability account" span={6}>{glSelect("deposit_liability_account_id")}</FormField>
              <FormField label="Fee income account" span={6}>{glSelect("fee_income_account_id")}</FormField>
              <FormField label="Interest expense account" span={6}>{glSelect("interest_expense_account_id")}</FormField>
            </FormGrid>
          </div>

          <FormActions>
            <button type="button" onClick={onCancel} className={btnSecondaryCls}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimaryCls}>
              {saving ? "Saving…" : productId ? "Save changes" : "Create product"}
            </button>
          </FormActions>
        </form>
      </div>
    </div>
  );
}
