import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  approveEod,
  getEodRun,
  initiateEod,
  listBranches,
  listEodRuns,
  runAllSteps,
  runPreCheck,
  runStep,
} from "@/lib/eod.functions";
import { Card } from "@/components/mzizi/Card";
import { btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  ShieldCheck,
  PlayCircle,
  RotateCw,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/eod")({
  component: EodDashboard,
});

const STATUS_STYLE: Record<string, string> = {
  pending:        "text-muted-foreground",
  processing:     "text-blue-600",
  completed:      "text-emerald-600",
  failed:         "text-destructive",
  skipped:        "text-muted-foreground",
  pending_approval: "text-amber-600",
  in_progress:    "text-blue-600",
};

function StatusIcon({ status }: { status: string }) {
  const size = 16;
  if (status === "completed") return <CheckCircle2 size={size} className="text-emerald-600" />;
  if (status === "failed") return <XCircle size={size} className="text-destructive" />;
  if (status === "processing") return <Loader2 size={size} className="animate-spin text-blue-600" />;
  return <CircleDashed size={size} className="text-muted-foreground" />;
}

function EodDashboard() {
  const qc = useQueryClient();
  const branchesFn = useServerFn(listBranches);
  const runsFn = useServerFn(listEodRuns);
  const preCheckFn = useServerFn(runPreCheck);
  const initFn = useServerFn(initiateEod);
  const approveFn = useServerFn(approveEod);
  const stepFn = useServerFn(runStep);
  const runAllFn = useServerFn(runAllSteps);
  const runDetailFn = useServerFn(getEodRun);

  const { data: branches } = useQuery({ queryKey: ["eod-branches"], queryFn: () => branchesFn() });
  const [branchId, setBranchId] = useState<string>("");
  const activeBranch = useMemo(() => branches?.find((b) => b.id === branchId) ?? branches?.[0], [branches, branchId]);
  const bid = activeBranch?.id;

  const [businessDate, setBusinessDate] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });

  const { data: runs } = useQuery({
    queryKey: ["eod-runs", bid],
    queryFn: () => runsFn({ data: { branch_id: bid, limit: 30 } }),
    enabled: !!bid,
  });

  const currentRun = useMemo(
    () => runs?.find((r) => r.business_date === businessDate) ?? null,
    [runs, businessDate],
  );

  const { data: precheck, refetch: refetchPre } = useQuery({
    queryKey: ["eod-pre", bid, businessDate],
    queryFn: () => preCheckFn({ data: { branch_id: bid!, business_date: businessDate } }),
    enabled: !!bid && !currentRun,
  });

  const { data: detail } = useQuery({
    queryKey: ["eod-detail", currentRun?.id],
    queryFn: () => runDetailFn({ data: { id: currentRun!.id } }),
    enabled: !!currentRun,
    refetchInterval: (q) => (q.state.data?.run?.status === "in_progress" ? 1500 : false),
  });

  const initM = useMutation({
    mutationFn: () => initFn({ data: { branch_id: bid!, business_date: businessDate } }),
    onSuccess: () => { toast.success("Day-end initiated — awaiting approver"); qc.invalidateQueries({ queryKey: ["eod-runs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveM = useMutation({
    mutationFn: (id: string) => approveFn({ data: { run_id: id } }),
    onSuccess: () => { toast.success("Approved — starting execution"); qc.invalidateQueries({ queryKey: ["eod-runs"] }); qc.invalidateQueries({ queryKey: ["eod-detail"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const runAllM = useMutation({
    mutationFn: (id: string) => runAllFn({ data: { run_id: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["eod-runs"] }); qc.invalidateQueries({ queryKey: ["eod-detail"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const stepM = useMutation({
    mutationFn: (args: { id: string; step: string }) => stepFn({ data: { run_id: args.id, step: args.step as any } }),
    onSuccess: (r) => {
      if (!r.ok) toast.error(r.error ?? "Step failed"); else toast.success("Step completed");
      qc.invalidateQueries({ queryKey: ["eod-detail"] });
      qc.invalidateQueries({ queryKey: ["eod-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = detail?.run;
  const steps = (run?.steps as any[]) ?? [];

  return (
    <div className="animate-fadein flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase text-faint">Branch</label>
          <select value={bid ?? ""} onChange={(e) => setBranchId(e.target.value)} className="h-9 rounded-md border border-input px-2 text-[13px] min-w-[180px]">
            {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase text-faint">Business date</label>
          <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} className="h-9 rounded-md border border-input px-2 text-[13px]" />
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <div className="text-[11px] uppercase text-faint">Branch locked through</div>
          <div className="font-mono text-[13px]">{activeBranch?.eod_locked_through ?? "—"}</div>
        </div>
      </div>

      {/* Pre-check panel */}
      {!currentRun && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-[14px] flex items-center gap-2">
              <ShieldCheck size={16} className="text-primary" /> Pre-day-end validation
            </div>
            <button className={btnSecondaryCls} onClick={() => refetchPre()}>Re-run check</button>
          </div>
          {precheck ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12.5px]">
                {Object.entries(precheck.checks ?? {}).map(([k, v]: any) => (
                  <div key={k} className={cn("rounded-lg border p-3", Number(v) > 0 ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50")}>
                    <div className="text-[10.5px] uppercase text-faint">{k.replace(/_/g, " ")}</div>
                    <div className="font-mono text-lg font-semibold">{v}</div>
                  </div>
                ))}
              </div>
              {(precheck.warnings ?? []).length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12.5px]">
                  <div className="flex items-center gap-2 font-semibold text-amber-800 mb-1">
                    <AlertTriangle size={14} /> Outstanding items — confirm before proceeding
                  </div>
                  <ul className="list-disc ml-5">
                    {precheck.warnings.map((w: any) => (
                      <li key={w.code}>{w.label}: <span className="font-mono">{w.count}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button
                  className={btnPrimaryCls}
                  onClick={() => initM.mutate()}
                  disabled={initM.isPending}
                >
                  {initM.isPending ? "Initiating…" : "Initiate day end"}
                </button>
              </div>
            </>
          ) : <div className="text-muted-foreground text-[12.5px]">Running validation…</div>}
        </Card>
      )}

      {/* Current run */}
      {run && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] uppercase text-faint">Business date {run.business_date}</div>
              <div className="font-semibold text-[15px] flex items-center gap-2">
                Day-end run
                <span className={cn("text-[11px] font-semibold uppercase px-2 py-0.5 rounded", STATUS_STYLE[run.status] ?? "")}>
                  {run.status.replace(/_/g, " ")}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {run.status === "pending_approval" && (
                <button className={btnPrimaryCls} onClick={() => approveM.mutate(run.id)} disabled={approveM.isPending}>
                  {approveM.isPending ? "Approving…" : "Approve & run"}
                </button>
              )}
              {run.status === "in_progress" && (
                <button className={btnPrimaryCls} onClick={() => runAllM.mutate(run.id)} disabled={runAllM.isPending}>
                  {runAllM.isPending ? <><Loader2 size={14} className="animate-spin inline mr-1" /> Running…</> : <><PlayCircle size={14} className="inline mr-1" /> Run all steps</>}
                </button>
              )}
            </div>
          </div>

          {run.status === "pending_approval" && (
            <div className="mb-3 text-[12.5px] rounded-lg bg-amber-50 border border-amber-300 p-3">
              Dual control: the approver must be a different user with <span className="font-mono">eod.approve</span> permission.
            </div>
          )}

          {/* Steps */}
          <ol className="flex flex-col gap-1.5">
            {steps.map((s: any) => (
              <li key={s.key} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2">
                <StatusIcon status={s.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{s.label}</div>
                  {s.metrics && Object.keys(s.metrics).length > 0 && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {Object.entries(s.metrics).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ")}
                    </div>
                  )}
                  {s.error && <div className="text-[11px] text-destructive">{s.error}</div>}
                </div>
                <span className={cn("text-[11px] uppercase font-semibold", STATUS_STYLE[s.status] ?? "")}>{s.status}</span>
                {run.status === "in_progress" && s.status !== "completed" && s.status !== "processing" && (
                  <button
                    className="text-[11px] rounded-md border border-input px-2 py-1 hover:bg-muted flex items-center gap-1"
                    onClick={() => stepM.mutate({ id: run.id, step: s.key })}
                    disabled={stepM.isPending}
                  >
                    <RotateCw size={11} /> {s.status === "failed" ? "Retry" : "Run"}
                  </button>
                )}
              </li>
            ))}
          </ol>

          {/* Reports */}
          {run.reports && Object.keys(run.reports).length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-[12px] font-semibold mb-2">Generated reports</div>
              <pre className="text-[11px] bg-muted rounded-md p-3 overflow-auto max-h-64">{JSON.stringify(run.reports, null, 2)}</pre>
            </div>
          )}
        </Card>
      )}

      {/* History */}
      <Card>
        <div className="font-semibold text-[14px] mb-3">Recent day-end runs</div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-faint font-semibold border-b border-border">
              <th className="py-2 pr-3">Business date</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Initiated</th>
              <th className="py-2 pr-3">Approved</th>
              <th className="py-2 pr-3 text-right">Duration</th>
              <th className="py-2 pr-3">Warnings</th>
            </tr>
          </thead>
          <tbody>
            {(runs ?? []).map((r) => (
              <tr key={r.id} className="border-b border-border/50 cursor-pointer hover:bg-muted/40" onClick={() => setBusinessDate(r.business_date)}>
                <td className="py-2 pr-3 font-mono">{r.business_date}</td>
                <td className={cn("py-2 pr-3 capitalize", STATUS_STYLE[r.status])}>{r.status.replace(/_/g, " ")}</td>
                <td className="py-2 pr-3">{r.initiated_at ? new Date(r.initiated_at).toLocaleString() : "—"}</td>
                <td className="py-2 pr-3">{r.approved_at ? new Date(r.approved_at).toLocaleString() : "—"}</td>
                <td className="py-2 pr-3 text-right font-mono">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}</td>
                <td className="py-2 pr-3">{((r.warnings as any[]) ?? []).length}</td>
              </tr>
            ))}
            {(runs ?? []).length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No day-end runs yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
