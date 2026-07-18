import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Upload, CheckCircle2, XCircle, Clock, Send, History } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import {
  FormGrid, FormField, FormActions, inputCls, btnPrimaryCls, btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { Modal } from "@/components/mzizi/Modal";
import {
  listAlcoRates, submitAlcoProposal, listAlcoProposals, applyAlcoProposal, cancelAlcoProposal,
  listAlcoRateHistory,
} from "@/lib/alco.functions";
import { shortDate } from "@/lib/format";


type Row = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  standard_rate: number | null;
  maximum_rate: number | null;
  cbsl_max_rate: number | null;
};

type Draft = { standard: string; maximum: string; cbsl: string };

function toNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function AlcoRatesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAlcoRates);
  const submitFn = useServerFn(submitAlcoProposal);
  const proposalsFn = useServerFn(listAlcoProposals);
  const applyFn = useServerFn(applyAlcoProposal);
  const cancelFn = useServerFn(cancelAlcoProposal);

  const { data: rows, isLoading } = useQuery({ queryKey: ["alco", "products"], queryFn: () => listFn() });
  const { data: proposals } = useQuery({ queryKey: ["alco", "proposals"], queryFn: () => proposalsFn() });

  const historyFn = useServerFn(listAlcoRateHistory);
  const [historyFor, setHistoryFor] = useState<Row | null>(null);
  const { data: historyRows, isFetching: historyLoading } = useQuery({
    queryKey: ["alco", "history", historyFor?.id],
    queryFn: () => historyFn({ data: { product_id: historyFor!.id } }),
    enabled: !!historyFor,
  });


  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [notes, setNotes] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [csv, setCsv] = useState("");

  const initDraft = (r: Row): Draft => ({
    standard: r.standard_rate == null ? "" : String(r.standard_rate),
    maximum: r.maximum_rate == null ? "" : String(r.maximum_rate),
    cbsl: r.cbsl_max_rate == null ? "" : String(r.cbsl_max_rate),
  });

  const getDraft = (r: Row): Draft => drafts[r.id] ?? initDraft(r);

  const changedItems = useMemo(() => {
    if (!rows) return [];
    return rows.flatMap((r: Row) => {
      const d = drafts[r.id];
      if (!d) return [];
      const std = toNum(d.standard);
      const max = toNum(d.maximum);
      const cbsl = toNum(d.cbsl);
      const changed =
        (r.standard_rate ?? null) !== std ||
        (r.maximum_rate ?? null) !== max ||
        (r.cbsl_max_rate ?? null) !== cbsl;
      return changed
        ? [{ product_id: r.id, standard_rate: std, maximum_rate: max, cbsl_max_rate: cbsl, name: r.name, code: r.code }]
        : [];
    });
  }, [drafts, rows]);

  const submit = useMutation({
    mutationFn: () => submitFn({
      data: {
        notes: notes.trim() || null,
        items: changedItems.map(({ product_id, standard_rate, maximum_rate, cbsl_max_rate }) => ({
          product_id, standard_rate, maximum_rate, cbsl_max_rate,
        })),
      },
    }),
    onSuccess: (res: any) => {
      toast.success(
        res.workflow_instance_id
          ? `Submitted ${res.changed_count} change(s) for approval`
          : `Proposal saved (${res.changed_count} change(s)) — no workflow configured for "alco_rate_change"`,
      );
      setDrafts({});
      setNotes("");
      qc.invalidateQueries({ queryKey: ["alco"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apply = useMutation({
    mutationFn: (id: string) => applyFn({ data: { proposal_id: id } }),
    onSuccess: () => {
      toast.success("Rates applied");
      qc.invalidateQueries({ queryKey: ["alco"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { proposal_id: id } }),
    onSuccess: () => {
      toast.success("Proposal cancelled");
      qc.invalidateQueries({ queryKey: ["alco"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function applyBulk() {
    if (!rows) return;
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return toast.error("Empty CSV");
    const byCode = new Map(rows.map((r: Row) => [r.code.toLowerCase(), r]));
    const next: Record<string, Draft> = { ...drafts };
    let ok = 0, skipped = 0;
    for (const line of lines) {
      const parts = line.split(/[,\t;]/).map((x) => x.trim());
      const [code, std, max, cbsl] = parts;
      if (!code || code.toLowerCase() === "code") { skipped++; continue; }
      const row = byCode.get(code.toLowerCase()) as Row | undefined;
      if (!row) { skipped++; continue; }
      next[row.id] = { standard: std ?? "", maximum: max ?? "", cbsl: cbsl ?? "" };
      ok++;
    }
    setDrafts(next);
    setBulkOpen(false);
    setCsv("");
    toast.success(`Loaded ${ok} row(s)${skipped ? `, skipped ${skipped}` : ""}`);
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading ALCO rates…</div>;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <CardTitle>ALCO deposit rates</CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Update standard, maximum, and CBSL max rates for active deposit products. Changes are submitted to the
              <code className="mx-1 px-1 rounded bg-muted text-[11px]">alco_rate_change</code>
              workflow for approval before being applied.
            </p>
          </div>
          <div className="flex gap-2">
            <button className={btnSecondaryCls} onClick={() => setBulkOpen((v) => !v)}>
              <Upload size={14} className="mr-1.5" /> Bulk upload
            </button>
          </div>
        </div>

        {bulkOpen && (
          <div className="mb-4 rounded-md border border-border p-3 bg-muted/30">
            <div className="text-[12px] font-semibold mb-1">Paste CSV</div>
            <div className="text-[11px] text-muted-foreground mb-2">
              Columns: <code>code,standard_rate,maximum_rate,cbsl_max_rate</code> (header optional). Rates in % p.a. Blank = clear.
            </div>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={6}
              placeholder={"code,standard_rate,maximum_rate,cbsl_max_rate\nFD-12M,9.50,10.25,11.00"}
              className={inputCls + " font-mono text-[12px]"}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button className={btnSecondaryCls} onClick={() => { setBulkOpen(false); setCsv(""); }}>Cancel</button>
              <button className={btnPrimaryCls} onClick={applyBulk}>Load into table</button>
            </div>
          </div>
        )}

        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Product</th>
                <th className="text-right px-3 py-2 w-32">Standard %</th>
                <th className="text-right px-3 py-2 w-32">Maximum %</th>
                <th className="text-right px-3 py-2 w-32">CBSL max %</th>
                <th className="text-center px-3 py-2 w-16">Δ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(rows ?? []).map((r: Row) => {
                const d = getDraft(r);
                const isChanged = changedItems.some((c) => c.product_id === r.id);
                return (
                  <tr key={r.id} className={isChanged ? "bg-amber-500/5" : ""}>
                    <td className="px-3 py-1.5">
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{r.code}</div>
                    </td>
                    {(["standard", "maximum", "cbsl"] as const).map((k) => (
                      <td key={k} className="px-2 py-1.5">
                        <input
                          type="number" step="0.01" min="0"
                          value={d[k]}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: { ...getDraft(r), [k]: e.target.value } }))}
                          className={inputCls + " text-right font-mono py-1"}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-center">
                      {isChanged ? <span className="text-amber-600 font-bold">●</span> : <span className="text-muted-foreground">–</span>}
                    </td>
                  </tr>
                );
              })}
              {(rows ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No active deposit products.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <FormGrid className="mt-4">
          <FormField label="Notes for approver" span={12}>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls}
              placeholder="e.g. Effective next Monday; aligned with CBSL circular #23/2026" />
          </FormField>
        </FormGrid>
        <FormActions align="between">
          <div className="text-[12px] text-muted-foreground">
            {changedItems.length === 0 ? "No changes" : `${changedItems.length} product(s) changed`}
          </div>
          <button
            className={btnPrimaryCls}
            disabled={changedItems.length === 0 || submit.isPending}
            onClick={() => submit.mutate()}
          >
            <Send size={14} className="mr-1.5" />
            {submit.isPending ? "Submitting…" : "Submit for approval"}
          </button>
        </FormActions>
      </Card>

      <Card>
        <CardTitle>Recent proposals</CardTitle>
        <div className="divide-y divide-border mt-2">
          {(proposals ?? []).map((p: any) => {
            const wfStatus = p.workflow?.status ?? (p.workflow_instance_id ? "unknown" : "no workflow");
            const canApply = p.status === "pending" && (wfStatus === "approved" || !p.workflow_instance_id);
            return (
              <div key={p.id} className="py-3 flex items-start gap-3">
                <div className="mt-0.5">
                  {p.status === "applied" ? <CheckCircle2 size={16} className="text-emerald-600" />
                    : p.status === "declined" || p.status === "cancelled" ? <XCircle size={16} className="text-rose-600" />
                    : <Clock size={16} className="text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold">
                    {p.items?.length ?? 0} product change(s) · <span className="uppercase text-[11px]">{p.status}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">workflow: {wfStatus}</span>
                  </div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {shortDate(p.created_at)}{p.applied_at ? ` · applied ${shortDate(p.applied_at)}` : ""}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </div>
                  <div className="mt-1.5 text-[11.5px] text-muted-foreground">
                    {(p.items ?? []).slice(0, 4).map((it: any) => (
                      <span key={it.id} className="inline-block mr-3">
                        <span className="font-mono">{it.product?.code}</span>: {it.old_standard_rate ?? "–"} → <b>{it.new_standard_rate ?? "–"}</b>
                      </span>
                    ))}
                    {(p.items?.length ?? 0) > 4 && <span>…</span>}
                  </div>
                </div>
                {p.status === "pending" && (
                  <div className="flex flex-col gap-1">
                    <button
                      className={btnPrimaryCls + " h-8 px-3 text-[12px]"}
                      disabled={!canApply || apply.isPending}
                      title={canApply ? "Apply approved rates" : "Waiting for workflow approval"}
                      onClick={() => apply.mutate(p.id)}
                    >
                      Apply
                    </button>
                    <button
                      className={btnSecondaryCls + " h-8 px-3 text-[12px]"}
                      onClick={() => cancel.mutate(p.id)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {(proposals ?? []).length === 0 && (
            <div className="py-4 text-[12px] text-muted-foreground">No proposals yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
