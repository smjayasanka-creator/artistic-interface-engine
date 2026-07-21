import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Trash2, Check, Plus, X, Save } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import {
  inputCls,
  selectCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";
import { shortDate } from "@/lib/format";
import { API_CONTRACTS } from "@/lib/api-contract";
import {
  listMappingTemplates,
  saveMappingTemplate,
  deleteMappingTemplate,
  suggestFieldMappings,
} from "@/lib/api-mapping.functions";

type Env = "sandbox" | "production";

type SourceRow = { name: string; label: string; type: string; description: string };
type MappingRow = {
  source: string;
  target: string;
  transform?: string;
  confidence?: number;
  method?: "deterministic" | "ai" | "manual";
  reason?: string;
  approved?: boolean;
};

const emptySource: SourceRow = { name: "", label: "", type: "string", description: "" };

export function ApiMappingStudio({ env }: { env: Env }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMappingTemplates);
  const saveFn = useServerFn(saveMappingTemplate);
  const delFn = useServerFn(deleteMappingTemplate);
  const suggestFn = useServerFn(suggestFieldMappings);

  const { data } = useQuery({
    queryKey: ["mapping-templates", env],
    queryFn: () => listFn({ data: { env } }),
  });
  const templates = data?.templates ?? [];

  // Editor state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contractId, setContractId] = useState<string>(API_CONTRACTS[1]?.id ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([{ ...emptySource }]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [useAi, setUseAi] = useState(false);

  const contract = useMemo(
    () => API_CONTRACTS.find((c) => c.id === contractId),
    [contractId],
  );
  const targetOptions = useMemo(
    () => (contract?.fields ?? []).filter((f) => f.inbound !== false),
    [contract],
  );

  const suggestMut = useMutation({
    mutationFn: async () => {
      const cleaned = sources.filter((s) => s.name.trim());
      if (!cleaned.length) throw new Error("Add at least one source field");
      return suggestFn({
        data: {
          contractId,
          sourceFields: cleaned.map((s) => ({
            name: s.name.trim(),
            label: s.label.trim() || undefined,
            type: s.type || undefined,
            description: s.description.trim() || undefined,
          })),
          useAiFallback: useAi,
          confidenceFloor: 0.55,
        },
      });
    },
    onSuccess: (r) => {
      setMappings(
        r.suggestions.map((s) => ({
          source: s.sourceName,
          target: s.targetPath,
          confidence: s.confidence,
          method: s.method,
          reason: s.reason,
          approved: s.method === "deterministic" && s.confidence >= 0.85,
        })),
      );
      if (r.aiError) toast.error(`AI fallback failed: ${r.aiError}`);
      toast.success(
        `${r.suggestions.length} suggestion(s), ${r.unresolved.length} unresolved`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const approved = mappings.filter((m) => m.approved && m.source && m.target);
      if (!approved.length) throw new Error("Approve at least one mapping before saving");
      if (!name.trim()) throw new Error("Give the template a name");
      return saveFn({
        data: {
          id: editingId ?? undefined,
          env,
          name: name.trim(),
          description: description.trim() || undefined,
          target_resource: contract?.resource ?? "unknown",
          status: "active",
          field_mappings: approved.map((m) => ({
            source: m.source,
            target: m.target,
            transform: m.transform,
            confidence: m.confidence,
            method: m.method === "ai" ? "ai" : m.method === "deterministic" ? "deterministic" : "manual",
          })),
        },
      });
    },
    onSuccess: () => {
      toast.success("Mapping template saved");
      qc.invalidateQueries({ queryKey: ["mapping-templates", env] });
      resetEditor();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, env } }),
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["mapping-templates", env] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function resetEditor() {
    setName("");
    setDescription("");
    setEditingId(null);
    setSources([{ ...emptySource }]);
    setMappings([]);
  }

  function loadTemplate(t: (typeof templates)[number]) {
    setEditingId(t.id);
    setName(t.name);
    setDescription(t.description ?? "");
    const fm = (t.field_mappings ?? []) as MappingRow[];
    setMappings(fm.map((m) => ({ ...m, approved: true })));
    setSources(
      fm.length
        ? fm.map((m) => ({ name: m.source, label: "", type: "string", description: "" }))
        : [{ ...emptySource }],
    );
    // best-guess contract by resource
    const c = API_CONTRACTS.find((x) => x.resource === t.target_resource);
    if (c) setContractId(c.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <CardTitle>Field mapping studio</CardTitle>
          <div className="text-[11.5px] text-muted-foreground">
            {templates.length} saved template(s) · {env}
          </div>
        </div>
        <div className="grid grid-cols-12 gap-3 mb-4">
          <div className="col-span-4">
            <Label>Template name</Label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Partner LOS → clients.create"
            />
          </div>
          <div className="col-span-5">
            <Label>Description</Label>
            <input
              className={inputCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context for teammates"
            />
          </div>
          <div className="col-span-3">
            <Label>Target endpoint</Label>
            <select
              className={selectCls}
              value={contractId}
              onChange={(e) => {
                setContractId(e.target.value);
                setMappings([]);
              }}
            >
              {API_CONTRACTS.filter((c) => c.direction !== "outbound").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Source fields editor */}
          <div className="border border-border rounded p-3 bg-muted/20">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-semibold">Source fields</div>
              <button
                className={cn(btnSecondaryCls, "text-[11.5px]")}
                onClick={() => setSources((s) => [...s, { ...emptySource }])}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </button>
            </div>
            <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto">
              {sources.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-start">
                  <input
                    className={cn(inputCls, "col-span-4 font-mono text-[11.5px]")}
                    placeholder="field_name"
                    value={s.name}
                    onChange={(e) =>
                      setSources((rows) => rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))
                    }
                  />
                  <input
                    className={cn(inputCls, "col-span-4")}
                    placeholder="Label"
                    value={s.label}
                    onChange={(e) =>
                      setSources((rows) => rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))
                    }
                  />
                  <select
                    className={cn(selectCls, "col-span-3")}
                    value={s.type}
                    onChange={(e) =>
                      setSources((rows) => rows.map((r, j) => (j === i ? { ...r, type: e.target.value } : r)))
                    }
                  >
                    {["string", "number", "int", "boolean", "date", "uuid", "enum"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <button
                    className="col-span-1 text-muted-foreground hover:text-rose-600 text-xs mt-2"
                    onClick={() => setSources((rows) => rows.filter((_, j) => j !== i))}
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-border pt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-[11.5px]">
                <input
                  type="checkbox"
                  checked={useAi}
                  onChange={(e) => setUseAi(e.target.checked)}
                />
                <span>Use AI Gateway for ambiguous fields</span>
                <span className="text-[10.5px] text-muted-foreground">
                  (name/label/type only — no sample data)
                </span>
              </label>
              <button
                className={cn(btnPrimaryCls, "text-[12px]")}
                onClick={() => suggestMut.mutate()}
                disabled={suggestMut.isPending}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {suggestMut.isPending ? "Matching…" : "Suggest mappings"}
              </button>
            </div>
          </div>

          {/* Suggestions review */}
          <div className="border border-border rounded p-3 bg-card">
            <div className="text-[12px] font-semibold mb-2">
              Suggestions ({mappings.length})
            </div>
            {mappings.length === 0 && (
              <div className="text-[12px] text-muted-foreground py-10 text-center">
                Add source fields on the left, then click <b>Suggest mappings</b>.
              </div>
            )}
            <div className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto">
              {mappings.map((m, i) => (
                <div
                  key={`${m.source}-${i}`}
                  className={cn(
                    "grid grid-cols-12 items-center gap-1.5 rounded border px-2 py-1.5 text-[11.5px]",
                    m.approved ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-muted/20",
                  )}
                >
                  <div className="col-span-3 font-mono truncate" title={m.source}>
                    {m.source}
                  </div>
                  <div className="col-span-1 text-center text-muted-foreground">→</div>
                  <select
                    className={cn(selectCls, "col-span-4 h-7 py-0 text-[11px]")}
                    value={m.target}
                    onChange={(e) =>
                      setMappings((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, target: e.target.value, method: "manual" } : r)),
                      )
                    }
                  >
                    <option value="">— unmapped —</option>
                    {targetOptions.map((t) => (
                      <option key={t.path} value={t.path}>
                        {t.path} ({t.type})
                      </option>
                    ))}
                  </select>
                  <div className="col-span-2">
                    <MethodBadge method={m.method} confidence={m.confidence} />
                  </div>
                  <div className="col-span-2 flex justify-end gap-1">
                    <button
                      className={cn(
                        "text-[10.5px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider",
                        m.approved
                          ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/40"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() =>
                        setMappings((rows) => rows.map((r, j) => (j === i ? { ...r, approved: !r.approved } : r)))
                      }
                    >
                      <Check className="h-3 w-3 inline mr-0.5" />
                      {m.approved ? "Approved" : "Approve"}
                    </button>
                    <button
                      className="text-muted-foreground hover:text-rose-600"
                      onClick={() => setMappings((rows) => rows.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              {editingId && (
                <button className={cn(btnSecondaryCls, "text-[12px]")} onClick={resetEditor}>
                  Cancel edit
                </button>
              )}
              <button
                className={cn(btnPrimaryCls, "text-[12px]")}
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {editingId ? "Update template" : "Save template"}
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Saved templates</CardTitle>
        <div className="border border-border rounded mt-3 overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider text-[10.5px]">
              <tr>
                <th className="text-left p-2 font-semibold">Name</th>
                <th className="text-left p-2 font-semibold">Target</th>
                <th className="text-left p-2 font-semibold">Fields</th>
                <th className="text-left p-2 font-semibold">Status</th>
                <th className="text-left p-2 font-semibold">Updated</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => {
                const count = Array.isArray(t.field_mappings) ? t.field_mappings.length : 0;
                return (
                  <tr key={t.id} className="border-t border-border">
                    <td className="p-2">
                      <div className="font-semibold">{t.name}</div>
                      {t.description && (
                        <div className="text-[11px] text-muted-foreground">{t.description}</div>
                      )}
                    </td>
                    <td className="p-2 font-mono text-[11.5px]">{t.target_resource}</td>
                    <td className="p-2">{count}</td>
                    <td className="p-2 capitalize">{t.status}</td>
                    <td className="p-2 text-muted-foreground">{shortDate(t.updated_at)}</td>
                    <td className="p-2 text-right">
                      <button
                        className="text-[11.5px] text-primary hover:underline mr-3"
                        onClick={() => loadTemplate(t)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-[11.5px] text-rose-600 hover:underline"
                        onClick={() => {
                          if (confirm(`Delete template "${t.name}"?`)) delMut.mutate(t.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 inline mr-0.5" />
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground text-[12px]">
                    No mapping templates yet in <b>{env}</b>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
      {children}
    </div>
  );
}

function MethodBadge({
  method,
  confidence,
}: {
  method?: MappingRow["method"];
  confidence?: number;
}) {
  if (!method) return <span className="text-muted-foreground text-[10.5px]">—</span>;
  const tone =
    method === "deterministic"
      ? "bg-sky-500/10 text-sky-700 border-sky-500/30"
      : method === "ai"
        ? "bg-violet-500/10 text-violet-700 border-violet-500/30"
        : "bg-muted text-muted-foreground border-border";
  const pct = typeof confidence === "number" ? `${Math.round(confidence * 100)}%` : "";
  return (
    <span
      className={cn(
        "text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider inline-flex items-center gap-1",
        tone,
      )}
      title={method === "ai" ? "AI Gateway suggestion — review before approving" : undefined}
    >
      {method === "ai" && <Sparkles className="h-2.5 w-2.5" />}
      {method} {pct && `· ${pct}`}
    </span>
  );
}
