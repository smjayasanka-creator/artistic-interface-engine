import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  listDelegationAuthorities,
  upsertDelegationAuthority,
  deleteDelegationAuthority,
  listSecurityTypes,
} from "@/lib/security.functions";
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
import { money } from "@/lib/format";

type Form = {
  id?: string;
  name: string;
  security_type_id: string;
  ltv_min: number;
  ltv_max: number;
  amount_min: number;
  amount_max: number;
  rate_min: number;
  rate_max: number;
  active: boolean;
};

const EMPTY: Form = {
  name: "",
  security_type_id: "",
  ltv_min: 0,
  ltv_max: 70,
  amount_min: 0,
  amount_max: 1000000,
  rate_min: 0,
  rate_max: 30,
  active: true,
};

export function DelegationAuthorityTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDelegationAuthorities);
  const stFn = useServerFn(listSecurityTypes);
  const upsertFn = useServerFn(upsertDelegationAuthority);
  const deleteFn = useServerFn(deleteDelegationAuthority);
  const { data: items } = useQuery({ queryKey: ["delegation-authorities"], queryFn: () => listFn() });
  const { data: secTypes } = useQuery({ queryKey: ["security-types"], queryFn: () => stFn() });

  const [mode, setMode] = useState<"list" | "form">("list");
  const [form, setForm] = useState<Form>(EMPTY);

  const save = useMutation({
    mutationFn: (v: Form) => upsertFn({ data: v as any }),
    onSuccess: () => {
      toast.success("Delegation authority saved");
      qc.invalidateQueries({ queryKey: ["delegation-authorities"] });
      setMode("list");
      setForm(EMPTY);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["delegation-authorities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeSec = (secTypes ?? []).filter((s: any) => s.active);

  if (mode === "form") {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>{form.id ? "Edit delegation authority" : "New delegation authority"}</CardTitle>
          <button
            onClick={() => { setMode("list"); setForm(EMPTY); }}
            className="text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5"
          >
            ← Back to list
          </button>
        </div>

        {activeSec.length === 0 && (
          <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800">
            You need to create a security type first.
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}
          className="flex flex-col gap-4 mt-2"
        >
          <FormGrid>
            <FormField label="Authority name" required span={6}>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required minLength={2} maxLength={80}
                placeholder="e.g. Branch Manager — Vehicles"
                className={inputCls}
              />
            </FormField>
            <FormField label="Security type" required span={6}>
              <select
                value={form.security_type_id}
                onChange={(e) => setForm({ ...form, security_type_id: e.target.value })}
                required
                className={selectCls}
              >
                <option value="">Select…</option>
                {activeSec.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.kind})</option>
                ))}
              </select>
            </FormField>
          </FormGrid>

          <div className="rounded-lg border border-border p-3 bg-muted/20">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-2">LTV range (%)</div>
            <FormGrid>
              <FormField label="Minimum LTV %" span={6}>
                <input type="number" min={0} max={100} step="0.01" value={form.ltv_min}
                  onChange={(e) => setForm({ ...form, ltv_min: Number(e.target.value) })} className={inputCls} />
              </FormField>
              <FormField label="Maximum LTV %" span={6}>
                <input type="number" min={0} max={100} step="0.01" value={form.ltv_max}
                  onChange={(e) => setForm({ ...form, ltv_max: Number(e.target.value) })} className={inputCls} />
              </FormField>
            </FormGrid>
          </div>

          <div className="rounded-lg border border-border p-3 bg-muted/20">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-2">Amount range</div>
            <FormGrid>
              <FormField label="Minimum amount" span={6}>
                <input type="number" min={0} step="0.01" value={form.amount_min}
                  onChange={(e) => setForm({ ...form, amount_min: Number(e.target.value) })} className={inputCls} />
              </FormField>
              <FormField label="Maximum amount" span={6}>
                <input type="number" min={0} step="0.01" value={form.amount_max}
                  onChange={(e) => setForm({ ...form, amount_max: Number(e.target.value) })} className={inputCls} />
              </FormField>
            </FormGrid>
          </div>

          <div className="rounded-lg border border-border p-3 bg-muted/20">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-2">Rate range (%)</div>
            <FormGrid>
              <FormField label="Minimum rate %" span={6}>
                <input type="number" min={0} max={100} step="0.001" value={form.rate_min}
                  onChange={(e) => setForm({ ...form, rate_min: Number(e.target.value) })} className={inputCls} />
              </FormField>
              <FormField label="Maximum rate %" span={6}>
                <input type="number" min={0} max={100} step="0.001" value={form.rate_max}
                  onChange={(e) => setForm({ ...form, rate_max: Number(e.target.value) })} className={inputCls} />
              </FormField>
            </FormGrid>
          </div>

          <label className="inline-flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active
          </label>

          <FormActions>
            <button type="button" onClick={() => { setMode("list"); setForm(EMPTY); }} className={btnSecondaryCls}>
              Cancel
            </button>
            <button type="submit" disabled={save.isPending || !form.security_type_id} className={btnPrimaryCls}>
              {save.isPending ? "Saving…" : "Save authority"}
            </button>
          </FormActions>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <div className="px-1 pb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">
          Delegation authorities <span className="text-[11px] text-muted-foreground font-normal ml-1">{items?.length ?? 0} total</span>
        </div>
        <button
          onClick={() => { setForm(EMPTY); setMode("form"); }}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-[12px] font-semibold hover:bg-primary-hover inline-flex items-center gap-1"
        >
          <Plus size={14} /> New authority
        </button>
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {(items ?? []).map((it: any) => (
          <div key={it.id} className="px-3 py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold truncate">{it.name}</div>
              <div className="text-[11.5px] text-muted-foreground truncate">
                {it.security_type?.name ?? "—"} · LTV {Number(it.ltv_min)}–{Number(it.ltv_max)}% · {money(Number(it.amount_min))}–{money(Number(it.amount_max))} · Rate {Number(it.rate_min)}–{Number(it.rate_max)}%
              </div>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${it.active ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-muted text-muted-foreground border-border"}`}>
              {it.active ? "active" : "inactive"}
            </span>
            <button
              onClick={() => {
                setForm({
                  id: it.id, name: it.name, security_type_id: it.security_type_id,
                  ltv_min: Number(it.ltv_min), ltv_max: Number(it.ltv_max),
                  amount_min: Number(it.amount_min), amount_max: Number(it.amount_max),
                  rate_min: Number(it.rate_min), rate_max: Number(it.rate_max),
                  active: it.active,
                });
                setMode("form");
              }}
              className="text-[11.5px] text-primary hover:underline"
            >
              Edit
            </button>
            <button
              onClick={() => { if (confirm(`Delete "${it.name}"?`)) del.mutate(it.id); }}
              className="text-muted-foreground hover:text-destructive"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {(items?.length ?? 0) === 0 && (
          <div className="px-3 py-6 text-[12px] text-muted-foreground text-center">
            No delegation authorities yet.
          </div>
        )}
      </div>
    </Card>
  );
}
