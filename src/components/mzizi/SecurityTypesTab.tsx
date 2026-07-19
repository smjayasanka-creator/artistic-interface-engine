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

type FieldType = "text" | "number" | "date";
type FieldDef = { key: string; label: string; type: FieldType; required: boolean };

type FormState = {
  id?: string;
  category: string;
  kind: string;
  fields: { definitions: FieldDef[] };
  active: boolean;
};

const EMPTY: FormState = {
  id: undefined,
  category: "",
  kind: "",
  fields: { definitions: [] },
  active: true,
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

export function SecurityTypesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSecurityTypes);
  const upsertFn = useServerFn(upsertSecurityType);
  const deleteFn = useServerFn(deleteSecurityType);
  const { data: items } = useQuery({ queryKey: ["security-types"], queryFn: () => listFn() });

  const [mode, setMode] = useState<"list" | "form">("list");
  const [form, setForm] = useState<FormState>(EMPTY);

  const save = useMutation({
    mutationFn: (v: FormState) => upsertFn({ data: v as any }),
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

  const updateField = (idx: number, patch: Partial<FieldDef>) => {
    setForm((f) => {
      const defs = [...f.fields.definitions];
      const next = { ...defs[idx], ...patch };
      if (patch.label !== undefined && !defs[idx].key) next.key = slugify(patch.label);
      defs[idx] = next;
      return { ...f, fields: { definitions: defs } };
    });
  };

  const addField = () =>
    setForm((f) => ({
      ...f,
      fields: {
        definitions: [
          ...f.fields.definitions,
          { key: "", label: "", type: "text", required: false },
        ],
      },
    }));

  const removeField = (idx: number) =>
    setForm((f) => ({
      ...f,
      fields: { definitions: f.fields.definitions.filter((_, i) => i !== idx) },
    }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned: FormState = {
      ...form,
      category: form.category.trim(),
      kind: form.kind.trim(),
      fields: {
        definitions: form.fields.definitions.map((d) => ({
          ...d,
          label: d.label.trim(),
          key: (d.key || slugify(d.label)).trim(),
        })),
      },
    };
    if (!cleaned.category || !cleaned.kind) {
      toast.error("Category and security type are required");
      return;
    }
    for (const d of cleaned.fields.definitions) {
      if (!d.label || !d.key) {
        toast.error("Every required field needs a label");
        return;
      }
    }
    const keys = cleaned.fields.definitions.map((d) => d.key);
    if (new Set(keys).size !== keys.length) {
      toast.error("Field keys must be unique");
      return;
    }
    save.mutate(cleaned);
  };

  if (mode === "form") {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>{form.id ? "Edit security type" : "New security type"}</CardTitle>
          <button
            onClick={() => {
              setMode("list");
              setForm(EMPTY);
            }}
            className="text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5"
          >
            ← Back to list
          </button>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 mt-2">
          <FormGrid>
            <FormField
              label="Security category"
              required
              span={6}
              hint="e.g. Movable, Immovable, Guarantor"
            >
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                required
                minLength={2}
                maxLength={60}
                className={inputCls}
                placeholder="Movable"
              />
            </FormField>
            <FormField
              label="Security type"
              required
              span={6}
              hint="e.g. Vehicle, Machinery, Gold, Deed"
            >
              <input
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                required
                minLength={2}
                maxLength={60}
                className={inputCls}
                placeholder="Vehicle"
              />
            </FormField>
          </FormGrid>

          <div className="rounded-lg border border-border p-3 bg-muted/20">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
                Required fields shown on application
              </div>
              <button
                type="button"
                onClick={addField}
                className="text-[12px] inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Plus size={13} /> Add field
              </button>
            </div>

            {form.fields.definitions.length === 0 ? (
              <div className="text-[12px] text-muted-foreground text-center py-4">
                No fields defined. Click "Add field" to build the form users will fill for this
                security type.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-wider text-faint">
                      <th className="py-1.5 pr-2 font-semibold">Field label</th>
                      <th className="py-1.5 pr-2 font-semibold">Key</th>
                      <th className="py-1.5 pr-2 font-semibold w-32">Type</th>
                      <th className="py-1.5 pr-2 font-semibold w-20 text-center">Required</th>
                      <th className="py-1.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.fields.definitions.map((d, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1.5 pr-2">
                          <input
                            value={d.label}
                            onChange={(e) => updateField(i, { label: e.target.value })}
                            className={inputCls}
                            placeholder="Registration No."
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            value={d.key}
                            onChange={(e) => updateField(i, { key: slugify(e.target.value) })}
                            className={inputCls}
                            placeholder="reg_no"
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <select
                            value={d.type}
                            onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                            className={selectCls}
                          >
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                          </select>
                        </td>
                        <td className="py-1.5 pr-2 text-center">
                          <input
                            type="checkbox"
                            checked={d.required}
                            onChange={(e) => updateField(i, { required: e.target.checked })}
                          />
                        </td>
                        <td className="py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeField(i)}
                            className="text-muted-foreground hover:text-destructive"
                            title="Remove"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
            <button
              type="button"
              onClick={() => {
                setMode("list");
                setForm(EMPTY);
              }}
              className={btnSecondaryCls}
            >
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
          Security types{" "}
          <span className="text-[11px] text-muted-foreground font-normal ml-1">
            {items?.length ?? 0} total
          </span>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY);
            setMode("form");
          }}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-[12px] font-semibold hover:bg-primary-hover inline-flex items-center gap-1"
        >
          <Plus size={14} /> New security type
        </button>
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {(items ?? []).map((it: any) => {
          const defs: FieldDef[] = Array.isArray(it.fields?.definitions)
            ? it.fields.definitions
            : [];
          return (
            <div key={it.id} className="px-3 py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate">{it.kind}</div>
                <div className="text-[11.5px] text-muted-foreground truncate">
                  {it.category} · {defs.length} field(s)
                  {defs.length ? ` — ${defs.map((d) => d.label).join(", ")}` : ""}
                </div>
              </div>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full border ${it.active ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-muted text-muted-foreground border-border"}`}
              >
                {it.active ? "active" : "inactive"}
              </span>
              <button
                onClick={() => {
                  setForm({
                    id: it.id,
                    category: it.category ?? "",
                    kind: it.kind ?? "",
                    fields: {
                      definitions: Array.isArray(it.fields?.definitions)
                        ? it.fields.definitions
                        : [],
                    },
                    active: !!it.active,
                  });
                  setMode("form");
                }}
                className="text-[11.5px] text-primary hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${it.kind}"?`)) del.mutate(it.id);
                }}
                className="text-muted-foreground hover:text-destructive"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        {(items?.length ?? 0) === 0 && (
          <div className="px-3 py-6 text-[12px] text-muted-foreground text-center">
            No security types yet. Create one to define the fields collected on loan applications.
          </div>
        )}
      </div>
    </Card>
  );
}
