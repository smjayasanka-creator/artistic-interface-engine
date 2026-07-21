import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { Card } from "@/components/mzizi/Card";
import { Modal } from "@/components/mzizi/Modal";
import {
  FormGrid,
  FormField,
  inputCls,
  selectCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import {
  listSavingsWhtRules,
  upsertSavingsWhtRule,
  toggleSavingsWhtRule,
  listSavingsProducts,
} from "@/lib/savings.functions";
import { listGlAccounts } from "@/lib/mzizi.functions";

export const Route = createFileRoute("/_authenticated/admin/savings/wht")({
  component: WhtRulesPage,
});

const ENTITY = [
  { v: "any", l: "Any" },
  { v: "individual", l: "Individual" },
  { v: "entity", l: "Entity" },
];
const RESIDENCY = [
  { v: "any", l: "Any" },
  { v: "resident", l: "Resident" },
  { v: "non_resident", l: "Non-resident" },
];

function WhtRulesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);

  const listFn = useServerFn(listSavingsWhtRules);
  const upsertFn = useServerFn(upsertSavingsWhtRule);
  const toggleFn = useServerFn(toggleSavingsWhtRule);
  const prodFn = useServerFn(listSavingsProducts);
  const glFn = useServerFn(listGlAccounts);

  const { data: rules = [] } = useQuery({ queryKey: ["wht-rules"], queryFn: () => listFn() });
  const { data: products = [] } = useQuery({
    queryKey: ["savings-products"],
    queryFn: () => prodFn(),
  });
  const { data: gl = [] } = useQuery({ queryKey: ["gl-accounts"], queryFn: () => glFn() });

  const saveM = useMutation({
    mutationFn: (payload: any) => upsertFn({ data: payload }),
    onSuccess: () => {
      toast.success("Rule saved");
      qc.invalidateQueries({ queryKey: ["wht-rules"] });
      setOpen(false);
      setEdit(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleM = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      toggleFn({ data: { id, active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wht-rules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      id: edit?.id,
      jurisdiction: String(f.get("jurisdiction") || "LK"),
      tax_type: String(f.get("tax_type") || "wht"),
      residency: String(f.get("residency") || "any"),
      entity_type: String(f.get("entity_type") || "any"),
      product_id: (f.get("product_id") as string) || null,
      effective_from: String(f.get("effective_from")),
      effective_to: (f.get("effective_to") as string) || null,
      rate_pct: Number(f.get("rate_pct") || 0),
      threshold: Number(f.get("threshold") || 0),
      wht_gl_account_id: String(f.get("wht_gl_account_id")),
      active: f.get("active") === "on",
    };
    saveM.mutate(payload);
  }

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft size={14} /> Admin
          </Link>
          <h1 className="text-lg font-semibold">Savings WHT / AIT rules</h1>
        </div>
        <button
          className={btnPrimaryCls}
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus size={12} className="mr-1" /> New rule
        </button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                <th className="py-2 pr-3">Effective</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Entity</th>
                <th className="py-2 pr-3">Residency</th>
                <th className="py-2 pr-3 text-right">Rate %</th>
                <th className="py-2 pr-3 text-right">Threshold</th>
                <th className="py-2 pr-3">WHT GL</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(rules as any[]).map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.effective_from} → {r.effective_to ?? "∞"}
                  </td>
                  <td className="py-2 pr-3 text-xs">{r.product?.name ?? "All"}</td>
                  <td className="py-2 pr-3 capitalize text-xs">{r.entity_type}</td>
                  <td className="py-2 pr-3 capitalize text-xs">{r.residency}</td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {Number(r.rate_pct).toFixed(2)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {Number(r.threshold).toFixed(2)}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {r.wht_gl?.code} · {r.wht_gl?.name}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {r.active ? (
                      <span className="text-emerald-600">Active</span>
                    ) : (
                      <span className="text-muted-foreground">Inactive</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        className="h-7 px-2 rounded text-[11px] border border-input hover:bg-muted"
                        onClick={() => {
                          setEdit(r);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="h-7 px-2 rounded text-[11px] border border-input hover:bg-muted"
                        onClick={() => toggleM.mutate({ id: r.id, active: !r.active })}
                      >
                        {r.active ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rules.length && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground text-sm">
                    No WHT rules configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEdit(null);
        }}
        title={edit ? "Edit WHT rule" : "New WHT rule"}
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormGrid>
            <FormField label="Effective from">
              <input
                name="effective_from"
                type="date"
                required
                defaultValue={edit?.effective_from ?? new Date().toISOString().slice(0, 10)}
                className={inputCls}
              />
            </FormField>
            <FormField label="Effective to (optional)">
              <input
                name="effective_to"
                type="date"
                defaultValue={edit?.effective_to ?? ""}
                className={inputCls}
              />
            </FormField>
            <FormField label="Product (blank = all)">
              <select name="product_id" defaultValue={edit?.product_id ?? ""} className={selectCls}>
                <option value="">All products</option>
                {(products as any[]).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Entity type">
              <select
                name="entity_type"
                defaultValue={edit?.entity_type ?? "any"}
                className={selectCls}
              >
                {ENTITY.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Residency">
              <select
                name="residency"
                defaultValue={edit?.residency ?? "any"}
                className={selectCls}
              >
                {RESIDENCY.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Rate %">
              <input
                name="rate_pct"
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                defaultValue={edit?.rate_pct ?? 5}
                className={inputCls}
              />
            </FormField>
            <FormField label="Threshold">
              <input
                name="threshold"
                type="number"
                step="0.01"
                min="0"
                defaultValue={edit?.threshold ?? 0}
                className={inputCls}
              />
            </FormField>
            <FormField label="WHT payable GL account">
              <select
                name="wht_gl_account_id"
                required
                defaultValue={edit?.wht_gl_account_id ?? ""}
                className={selectCls}
              >
                <option value="">Select…</option>
                {(gl as any[]).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.code} · {g.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Jurisdiction">
              <input
                name="jurisdiction"
                defaultValue={edit?.jurisdiction ?? "LK"}
                className={inputCls}
              />
            </FormField>
            <FormField label="Tax type">
              <input name="tax_type" defaultValue={edit?.tax_type ?? "wht"} className={inputCls} />
            </FormField>
          </FormGrid>
          <label className="text-xs flex items-center gap-1.5">
            <input type="checkbox" name="active" defaultChecked={edit?.active ?? true} /> Active
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={btnSecondaryCls}
              onClick={() => {
                setOpen(false);
                setEdit(null);
              }}
            >
              Cancel
            </button>
            <button type="submit" className={btnPrimaryCls} disabled={saveM.isPending}>
              {saveM.isPending ? "Saving…" : "Save rule"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
