import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  selectCls,
  btnPrimaryCls,
} from "@/components/mzizi/FormGrid";
import { getLoanEvaluation, saveLoanEvaluation } from "@/lib/evaluation.functions";

type Field = {
  key: string;
  label: string;
  type: string;
  optional?: boolean;
  options?: string[];
};
type Section = {
  section_id: string;
  code: string;
  name: string;
  description?: string;
  is_mandatory: boolean;
  fields: Field[];
};

export function LoanEvaluation({
  loanId,
  productId,
  readOnly = false,
}: {
  loanId?: string;
  productId?: string;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const loadFn = useServerFn(getLoanEvaluation);
  const saveFn = useServerFn(saveLoanEvaluation);

  const { data, isLoading } = useQuery({
    queryKey: ["loan-evaluation", loanId ?? "new", productId ?? "none"],
    queryFn: () =>
      loadFn({
        data: { loan_id: loanId, loan_product_id: productId },
      }),
    enabled: !!(loanId || productId),
  });

  const [values, setValues] = useState<Record<string, Record<string, any>>>({});

  useEffect(() => {
    if (data?.data) setValues(data.data as any);
  }, [data]);

  const sections = (data?.sections ?? []) as Section[];

  const save = useMutation({
    mutationFn: () => saveFn({ data: { loan_id: loanId!, data: values } }),
    onSuccess: () => {
      toast.success("Evaluation saved");
      qc.invalidateQueries({ queryKey: ["loan-evaluation", loanId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = useMemo(() => {
    if (readOnly || !loanId) return false;
    // Enforce mandatory sections having at least one field filled
    for (const s of sections) {
      if (!s.is_mandatory) continue;
      const sv = values[s.code] ?? {};
      const requiredFields = s.fields.filter((f) => !f.optional);
      for (const f of requiredFields) {
        const v = sv[f.key];
        if (v === undefined || v === null || v === "") return false;
      }
    }
    return true;
  }, [values, sections, readOnly, loanId]);

  if (!productId && !loanId) {
    return (
      <div className="text-[12.5px] text-muted-foreground py-10 text-center border border-dashed border-border rounded-md">
        Select a loan product on the Application tab to see evaluation sections.
      </div>
    );
  }

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Loading evaluation…</div>;
  }

  if (sections.length === 0) {
    return (
      <div className="text-[12.5px] text-muted-foreground py-10 text-center border border-dashed border-border rounded-md">
        No evaluation sections are enabled for this product. Configure them under Administration →
        Loan product evaluation.
      </div>
    );
  }

  const setField = (code: string, key: string, v: any) =>
    setValues((s) => ({ ...s, [code]: { ...(s[code] ?? {}), [key]: v } }));

  return (
    <div className="flex flex-col gap-4">
      {sections.map((s) => (
        <Card key={s.section_id}>
          <div className="flex items-center justify-between">
            <CardTitle>
              {s.name}
              {s.is_mandatory && (
                <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-wider text-rose-600">
                  Mandatory
                </span>
              )}
            </CardTitle>
          </div>
          {s.description && (
            <p className="text-[12px] text-muted-foreground -mt-1 mb-2">{s.description}</p>
          )}
          <FormGrid>
            {s.fields.map((f) => {
              const span = f.type === "textarea" ? 12 : 6;
              const v = values[s.code]?.[f.key] ?? "";
              return (
                <FormField
                  key={f.key}
                  label={f.label + (f.optional ? " (optional)" : "")}
                  span={span as any}
                >
                  {f.type === "textarea" ? (
                    <textarea
                      className={inputCls + " min-h-[70px]"}
                      value={v}
                      disabled={readOnly}
                      onChange={(e) => setField(s.code, f.key, e.target.value)}
                    />
                  ) : f.type === "select" ? (
                    <select
                      className={selectCls}
                      value={v}
                      disabled={readOnly}
                      onChange={(e) => setField(s.code, f.key, e.target.value)}
                    >
                      <option value="">—</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      className={inputCls + (f.type === "number" ? " font-mono" : "")}
                      value={v}
                      disabled={readOnly}
                      onChange={(e) =>
                        setField(
                          s.code,
                          f.key,
                          f.type === "number" && e.target.value !== ""
                            ? Number(e.target.value)
                            : e.target.value,
                        )
                      }
                    />
                  )}
                </FormField>
              );
            })}
          </FormGrid>
        </Card>
      ))}
      {!readOnly && loanId && (
        <FormActions>
          <button
            type="button"
            className={btnPrimaryCls}
            disabled={!canSave || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save evaluation"}
          </button>
        </FormActions>
      )}
      {!loanId && (
        <div className="text-[12px] text-muted-foreground text-center">
          Save the application first to persist evaluation data.
        </div>
      )}
    </div>
  );
}
