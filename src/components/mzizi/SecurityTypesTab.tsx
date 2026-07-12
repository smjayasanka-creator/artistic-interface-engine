import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  listSecurityTypes,
  upsertSecurityType,
  deleteSecurityType,
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

type Kind = "machinery" | "vehicle" | "property" | "gold" | "deposit";
type Category = "movable" | "immovable";

type FieldDef = { key: string; label: string; type: "text" | "number" | "date" };

const KIND_FIELDS: Record<Kind, FieldDef[]> = {
  machinery: [
    { key: "make", label: "Make", type: "text" },
    { key: "model", label: "Model", type: "text" },
    { key: "serial_no", label: "Serial No.", type: "text" },
    { key: "year", label: "Year", type: "number" },
    { key: "valuation", label: "Valuation", type: "number" },
  ],
  vehicle: [
    { key: "reg_no", label: "Registration No.", type: "text" },
    { key: "make", label: "Make", type: "text" },
    { key: "model", label: "Model", type: "text" },
    { key: "year", label: "Year", type: "number" },
    { key: "chassis_no", label: "Chassis No.", type: "text" },
    { key: "engine_no", label: "Engine No.", type: "text" },
    { key: "valuation", label: "Valuation", type: "number" },
  ],
  property: [
    { key: "deed_no", label: "Deed No.", type: "text" },
    { key: "address", label: "Address", type: "text" },
    { key: "extent", label: "Extent (perches)", type: "number" },
    { key: "valuation", label: "Valuation", type: "number" },
  ],
  gold: [
    { key: "weight_grams", label: "Weight (grams)", type: "number" },
    { key: "karat", label: "Karat", type: "number" },
    { key: "purity", label: "Purity %", type: "number" },
    { key: "valuation", label: "Valuation", type: "number" },
  ],
  deposit: [
    { key: "certificate_no", label: "Certificate No.", type: "text" },
    { key: "bank", label: "Bank / Institution", type: "text" },
    { key: "amount", label: "Amount", type: "number" },
    { key: "maturity_date", label: "Maturity Date", type: "date" },
  ],
};

const KIND_TO_CATEGORY: Record<Kind, Category> = {
  machinery: "movable",
  vehicle: "movable",
  gold: "movable",
  deposit: "movable",
  property: "immovable",
};

const EMPTY = {
  id: undefined as string | undefined,
  name: "",
  category: "movable" as Category,
  kind: "vehicle" as Kind,
  fields: {} as Record<string, any>,
  active: true,
};

export function SecurityTypesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSecurityTypes);
  const upsertFn = useServerFn(upsertSecurityType);
  const deleteFn = useServerFn(deleteSecurityType);
  const { data: items } = useQuery({ queryKey: ["security-types"], queryFn: () => listFn() });

  const [mode, setMode] = useState<"list" | "form">("list");
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);

  const save = useMutation({
    mutationFn: (v: typeof EMPTY) => upsertFn({ data: v as any }),
    onSuccess: () => {
      toast.success("Security type saved");
      qc.invalidateQueries({ queryKey: ["security-types"] });
      setMode("list");
      setForm(EMPTY);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Security type removed");
      qc.invalidateQueries({ queryKey: ["security-types"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (mode === "form") {
    const fields = KIND_FIELDS[form.kind];
    return (
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>{form.id ? "Edit security type" : "New security type"}</CardTitle>
          <button
            onClick={() => { setMode("list"); setForm(EMPTY); }}
            className="text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5"
          >
            ← Back to list
          </button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}
          className="flex flex-col gap-4 mt-2"
        >
          <FormGrid>
            <FormField label="Security name" required span={5}>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required minLength={2} maxLength={80}
                className={inputCls}
              />
            </FormField>
            <FormField label="Security type (kind)" required span={4}>
              <select
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value as Kind;
                  setForm({ ...form, kind, category: KIND_TO_CATEGORY[kind], fields: {} });
                }}
                className={selectCls}
              >
                <option value="machinery">Machinery</option>
                <option value="vehicle">Vehicle</option>
                <option value="property">Property</option>
                <option value="gold">Gold</option>
                <option value="deposit">Deposit</option>
              </select>
            </FormField>
            <FormField label="Category" required span={3}>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                className={selectCls}
              >
                <option value="movable">Movable</option>
                <option value="immovable">Immovable</option>
              </select>
            </FormField>
          </FormGrid>

          <div className="rounded-lg border border-border p-3 bg-muted/20">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-2">
              {form.kind} — default fields collected on this security
            </div>
            <FormGrid>
              {fields.map((f) => (
                <FormField key={f.key} label={f.label} span={4}>
                  <input
                    type={f.type}
                    value={form.fields[f.key] ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        fields: {
                          ...form.fields,
                          [f.key]: f.type === "number"
                            ? (e.target.value === "" ? "" : Number(e.target.value))
                            : e.target.value,
                        },
                      })
                    }
                    className={inputCls}
                  />
                </FormField>
              ))}
            </FormGrid>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Values entered here act as defaults / template for this security type.
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>

          <FormActions>
            <button type="button" onClick={() => { setMode("list"); setForm(EMPTY); }} className={btnSecondaryCls}>
              Cancel
            </button>
            <button type="submit" disabled={save.isPending} className={btnPrimaryCls}>
              {save.isPending ? "Saving…" : "Save security type"}
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
          Security types <span className="text-[11px] text-muted-foreground font-normal ml-1">{items?.length ?? 0} total</span>
        </div>
        <button
          onClick={() => { setForm(EMPTY); setMode("form"); }}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-[12px] font-semibold hover:bg-primary-hover inline-flex items-center gap-1"
        >
          <Plus size={14} /> New security type
        </button>
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {(items ?? []).map((it: any) => (
          <div key={it.id} className="px-3 py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold truncate">{it.name}</div>
              <div className="text-[11.5px] text-muted-foreground truncate capitalize">
                {it.kind} · {it.category} · {Object.keys(it.fields ?? {}).length} field(s)
              </div>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${it.active ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-muted text-muted-foreground border-border"}`}>
              {it.active ? "active" : "inactive"}
            </span>
            <button
              onClick={() => { setForm({ id: it.id, name: it.name, category: it.category, kind: it.kind, fields: it.fields ?? {}, active: it.active }); setMode("form"); }}
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
            No security types yet. Create one to enable delegation authority.
          </div>
        )}
      </div>
    </Card>
  );
}
