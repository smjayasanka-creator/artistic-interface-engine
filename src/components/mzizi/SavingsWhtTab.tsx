import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { listWhtRules, upsertWhtRule, deleteWhtRule } from "@/lib/savings-settings.functions";
import { listSavingsProducts } from "@/lib/savings.functions";
import { getGlAccounts } from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  selectCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";

type Rule = {
  id?: string;
  jurisdiction: string;
  tax_type: "wht" | "ait";
  residency: "resident" | "nonresident" | "any";
  entity_type: "individual" | "entity" | "any";
  product_id: string | null;
  effective_from: string;
  effective_to: string | null;
  rate_pct: number;
  threshold: number;
  exemption_type: string | null;
  exemption_ref: string | null;
  exemption_expiry: string | null;
  wht_gl_account_id: string | null;
  active: boolean;
};

const EMPTY: Rule = {
  jurisdiction: "LK",
  tax_type: "wht",
  residency: "resident",
  entity_type: "individual",
  product_id: null,
  effective_from: new Date().toISOString().slice(0, 10),
  effective_to: null,
  rate_pct: 5,
  threshold: 0,
  exemption_type: null,
  exemption_ref: null,
  exemption_expiry: null,
  wht_gl_account_id: null,
  active: true,
};

export function SavingsWhtTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWhtRules);
  const upsertFn = useServerFn(upsertWhtRule);
  const delFn = useServerFn(deleteWhtRule);
  const productsFn = useServerFn(listSavingsProducts);
  const glFn = useServerFn(getGlAccounts);

  const { data: rules } = useQuery({ queryKey: ["savings-wht"], queryFn: () => listFn() });
  const { data: products } = useQuery({
    queryKey: ["savings-products"],
    queryFn: () => productsFn(),
  });
  const { data: gl } = useQuery({ queryKey: ["gl-accounts"], queryFn: () => glFn() });
  const liabilityAccts = (gl ?? []).filter((a: any) => a.type === "liability");

  const [editing, setEditing] = useState<Rule | null>(null);

  const save = useMutation({
    mutationFn: (r: Rule) => upsertFn({ data: r as any }),
    onSuccess: () => {
      toast.success("WHT rule saved");
      qc.invalidateQueries({ queryKey: ["savings-wht"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Rule deleted");
      qc.invalidateQueries({ queryKey: ["savings-wht"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <CardTitle>Withholding tax rules</CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Effective-dated tax rates applied during savings interest capitalisation. The rule
              engine picks the most-specific match (product &gt; entity type &gt; residency &gt;
              jurisdiction) whose effective window covers the posting date.
            </p>
          </div>
          <button className={btnPrimaryCls} onClick={() => setEditing({ ...EMPTY })}>
            <Plus size={14} /> New rule
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-2">Jurisdiction</th>
                <th className="text-left py-2 pr-2">Tax</th>
                <th className="text-left py-2 pr-2">Residency</th>
                <th className="text-left py-2 pr-2">Entity</th>
                <th className="text-left py-2 pr-2">Product</th>
                <th className="text-right py-2 pr-2">Rate</th>
                <th className="text-right py-2 pr-2">Threshold</th>
                <th className="text-left py-2 pr-2">Effective</th>
                <th className="text-left py-2 pr-2">Status</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {(rules ?? []).map((r: any) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-2 pr-2 font-medium">{r.jurisdiction}</td>
                  <td className="py-2 pr-2">{r.tax_type}</td>
                  <td className="py-2 pr-2">{r.residency}</td>
                  <td className="py-2 pr-2">{r.entity_type}</td>
                  <td className="py-2 pr-2">{r.product?.name ?? "All"}</td>
                  <td className="py-2 pr-2 text-right font-mono">
                    {Number(r.rate_pct).toFixed(2)}%
                  </td>
                  <td className="py-2 pr-2 text-right font-mono">
                    {Number(r.threshold ?? 0).toLocaleString()}
                  </td>
                  <td className="py-2 pr-2">
                    {r.effective_from}
                    {r.effective_to ? ` → ${r.effective_to}` : ""}
                  </td>
                  <td className="py-2 pr-2">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10.5px] ${
                        r.active
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right">
                    <button
                      className="text-primary hover:underline mr-2"
                      onClick={() =>
                        setEditing({
                          id: r.id,
                          jurisdiction: r.jurisdiction,
                          tax_type: r.tax_type,
                          residency: r.residency,
                          entity_type: r.entity_type,
                          product_id: r.product_id,
                          effective_from: r.effective_from,
                          effective_to: r.effective_to,
                          rate_pct: Number(r.rate_pct),
                          threshold: Number(r.threshold ?? 0),
                          exemption_type: r.exemption_type,
                          exemption_ref: r.exemption_ref,
                          exemption_expiry: r.exemption_expiry,
                          wht_gl_account_id: r.wht_gl_account_id,
                          active: !!r.active,
                        })
                      }
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="text-destructive hover:underline"
                      onClick={() => {
                        if (confirm(`Delete rule for ${r.jurisdiction}/${r.entity_type}?`))
                          remove.mutate(r.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {!rules?.length && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-muted-foreground">
                    No WHT rules yet. Add one to enable tax withholding on interest capitalisation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <CardTitle>{editing.id ? "Edit rule" : "New WHT rule"}</CardTitle>
            <button className={btnSecondaryCls} onClick={() => setEditing(null)}>
              <X size={14} /> Cancel
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(editing);
            }}
          >
            <FormGrid>
              <FormField label="Jurisdiction" required span={3}>
                <input
                  className={inputCls}
                  maxLength={10}
                  value={editing.jurisdiction}
                  onChange={(e) =>
                    setEditing({ ...editing, jurisdiction: e.target.value.toUpperCase() })
                  }
                />
              </FormField>
              <FormField label="Tax type" span={3}>
                <select
                  className={selectCls}
                  value={editing.tax_type}
                  onChange={(e) =>
                    setEditing({ ...editing, tax_type: e.target.value as Rule["tax_type"] })
                  }
                >
                  <option value="wht">WHT</option>
                  <option value="ait">AIT</option>
                </select>
              </FormField>
              <FormField label="Residency" span={3}>
                <select
                  className={selectCls}
                  value={editing.residency}
                  onChange={(e) =>
                    setEditing({ ...editing, residency: e.target.value as Rule["residency"] })
                  }
                >
                  <option value="resident">Resident</option>
                  <option value="nonresident">Non-resident</option>
                  <option value="any">Any</option>
                </select>
              </FormField>
              <FormField label="Entity type" span={3}>
                <select
                  className={selectCls}
                  value={editing.entity_type}
                  onChange={(e) =>
                    setEditing({ ...editing, entity_type: e.target.value as Rule["entity_type"] })
                  }
                >
                  <option value="individual">Individual</option>
                  <option value="entity">Entity</option>
                  <option value="any">Any</option>
                </select>
              </FormField>

              <FormField label="Product" span={6} hint="Leave blank to apply to all products">
                <select
                  className={selectCls}
                  value={editing.product_id ?? ""}
                  onChange={(e) => setEditing({ ...editing, product_id: e.target.value || null })}
                >
                  <option value="">All products</option>
                  {(products ?? []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="WHT payable GL" span={6}>
                <select
                  className={selectCls}
                  value={editing.wht_gl_account_id ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, wht_gl_account_id: e.target.value || null })
                  }
                >
                  <option value="">— select liability account —</option>
                  {liabilityAccts.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Rate %" required span={3}>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  className={inputCls}
                  value={editing.rate_pct}
                  onChange={(e) => setEditing({ ...editing, rate_pct: Number(e.target.value) })}
                />
              </FormField>
              <FormField label="Threshold" span={3} hint="Annual gross interest floor">
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={editing.threshold}
                  onChange={(e) => setEditing({ ...editing, threshold: Number(e.target.value) })}
                />
              </FormField>
              <FormField label="Effective from" required span={3}>
                <input
                  type="date"
                  className={inputCls}
                  value={editing.effective_from}
                  onChange={(e) => setEditing({ ...editing, effective_from: e.target.value })}
                />
              </FormField>
              <FormField label="Effective to" span={3} hint="Blank = open-ended">
                <input
                  type="date"
                  className={inputCls}
                  value={editing.effective_to ?? ""}
                  onChange={(e) => setEditing({ ...editing, effective_to: e.target.value || null })}
                />
              </FormField>

              <FormField label="Exemption type" span={4}>
                <input
                  className={inputCls}
                  value={editing.exemption_type ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, exemption_type: e.target.value || null })
                  }
                  placeholder="e.g. Senior citizen"
                />
              </FormField>
              <FormField label="Exemption ref" span={4}>
                <input
                  className={inputCls}
                  value={editing.exemption_ref ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, exemption_ref: e.target.value || null })
                  }
                />
              </FormField>
              <FormField label="Exemption expiry" span={4}>
                <input
                  type="date"
                  className={inputCls}
                  value={editing.exemption_expiry ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, exemption_expiry: e.target.value || null })
                  }
                />
              </FormField>

              <FormField label="Active" span={12}>
                <label className="inline-flex items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={editing.active}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  />
                  Rule is currently in force
                </label>
              </FormField>
            </FormGrid>

            <FormActions>
              <button type="button" className={btnSecondaryCls} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className={btnPrimaryCls} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save rule"}
              </button>
            </FormActions>
          </form>
        </Card>
      )}
    </div>
  );
}
