import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { getAllLoanProducts } from "@/lib/mzizi.functions";
import {
  getProductEvaluationConfig,
  upsertProductEvaluationConfig,
} from "@/lib/evaluation.functions";
import { inputCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";

type Row = {
  section_id: string;
  is_visible: boolean;
  is_mandatory: boolean;
  display_order: number;
  enabled_fields: string[] | null;
};

export function LoanProductEvaluationTab() {
  const qc = useQueryClient();
  const productsFn = useServerFn(getAllLoanProducts);
  const configFn = useServerFn(getProductEvaluationConfig);
  const saveFn = useServerFn(upsertProductEvaluationConfig);

  const { data: products } = useQuery({
    queryKey: ["all-loan-products"],
    queryFn: () => productsFn(),
  });

  const [selected, setSelected] = useState<string | null>(null);

  const productId = selected ?? products?.[0]?.id ?? null;

  const { data: config, isLoading } = useQuery({
    queryKey: ["product-eval-config", productId],
    queryFn: () => configFn({ data: { loan_product_id: productId! } }),
    enabled: !!productId,
  });

  const [draft, setDraft] = useState<Record<string, Row>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // seed draft when config loads
  useMemo(() => {
    if (!config) return;
    const seed: Record<string, Row> = {};
    for (const s of config.sections) {
      const existing = config.mapping.find((m: any) => m.section_id === s.id);
      seed[s.id] = existing
        ? {
            section_id: s.id,
            is_visible: existing.is_visible,
            is_mandatory: existing.is_mandatory,
            display_order: existing.display_order ?? s.display_order,
            enabled_fields: Array.isArray(existing.enabled_fields)
              ? (existing.enabled_fields as string[])
              : null,
          }
        : {
            section_id: s.id,
            is_visible: false,
            is_mandatory: false,
            display_order: s.display_order,
            enabled_fields: null,
          };
    }
    setDraft(seed);
  }, [config]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          loan_product_id: productId!,
          rows: Object.values(draft),
        },
      }),
    onSuccess: () => {
      toast.success("Evaluation configuration saved");
      qc.invalidateQueries({ queryKey: ["product-eval-config", productId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    const s = new Set(expanded);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setExpanded(s);
  };

  const update = (id: string, patch: Partial<Row>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const setEnabledField = (id: string, key: string, on: boolean, allKeys: string[]) => {
    const current = draft[id]?.enabled_fields ?? allKeys;
    const next = on ? Array.from(new Set([...current, key])) : current.filter((k) => k !== key);
    update(id, { enabled_fields: next.length === allKeys.length ? null : next });
  };

  return (
    <div className="grid grid-cols-4 gap-4">
      <Card padded={false} className="col-span-1">
        <div className="p-3 border-b border-border font-semibold text-[13px]">Loan products</div>
        <div className="max-h-[560px] overflow-y-auto">
          {(products ?? []).map((p: any) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={cn(
                "w-full text-left px-3 py-2 text-[12.5px] border-b border-row-divider hover:bg-muted/50",
                productId === p.id && "bg-primary/5 border-l-2 border-l-primary",
              )}
            >
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{p.code}</div>
            </button>
          ))}
          {(products ?? []).length === 0 && (
            <div className="p-4 text-[12px] text-muted-foreground">No loan products yet.</div>
          )}
        </div>
      </Card>

      <Card className="col-span-3">
        <div className="flex items-center justify-between">
          <CardTitle>Evaluation sections</CardTitle>
          <button
            className={btnPrimaryCls}
            disabled={!productId || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save configuration"}
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground -mt-1 mb-3">
          Enable the evaluation sections that apply to this product. Only enabled sections appear on
          the Loan Evaluation page for new applications.
        </p>

        {isLoading || !config ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="flex flex-col gap-2">
            {config.sections.map((s: any) => {
              const row = draft[s.id];
              if (!row) return null;
              const allKeys = (s.fields ?? []).map((f: any) => f.key);
              const enabled = row.enabled_fields ?? allKeys;
              const open = expanded.has(s.id);
              return (
                <div key={s.id} className="border border-border rounded-md">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <button onClick={() => toggle(s.id)} className="text-muted-foreground">
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[13px] truncate">{s.name}</div>
                      {s.description && (
                        <div className="text-[11.5px] text-muted-foreground truncate">
                          {s.description}
                        </div>
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 text-[12px]">
                      <input
                        type="checkbox"
                        checked={row.is_visible}
                        onChange={(e) => update(s.id, { is_visible: e.target.checked })}
                      />
                      Visible
                    </label>
                    <label className="flex items-center gap-1.5 text-[12px]">
                      <input
                        type="checkbox"
                        disabled={!row.is_visible}
                        checked={row.is_mandatory}
                        onChange={(e) => update(s.id, { is_mandatory: e.target.checked })}
                      />
                      Mandatory
                    </label>
                    <input
                      type="number"
                      className={inputCls + " w-20 font-mono"}
                      value={row.display_order}
                      onChange={(e) => update(s.id, { display_order: Number(e.target.value) })}
                    />
                  </div>
                  {open && (
                    <div className="px-3 pb-3 pt-1 border-t border-border grid grid-cols-2 gap-x-4 gap-y-1">
                      {(s.fields ?? []).map((f: any) => (
                        <label key={f.key} className="flex items-center gap-2 text-[12px] py-0.5">
                          <input
                            type="checkbox"
                            checked={enabled.includes(f.key)}
                            onChange={(e) =>
                              setEnabledField(s.id, f.key, e.target.checked, allKeys)
                            }
                          />
                          <span>{f.label}</span>
                          {f.optional && (
                            <span className="text-[10px] text-muted-foreground">(optional)</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {config.sections.length === 0 && (
              <div className="text-[12px] text-muted-foreground text-center py-6">
                No evaluation sections defined yet.
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
