import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  approveEod,
  getAutoEodSettings,
  getEodDefaultBusinessDate,
  getEodRun,
  initiateEod,
  listBranches,
  listEodRuns,
  resumeEod,
  runAllSteps,
  runCompanyEod,
  runPreCheck,
  runStep,
  updateAutoEodSettings,
} from "@/lib/eod.functions";
import { Card } from "@/components/mzizi/Card";
import { btnPrimaryCls, btnSecondaryCls, inputCls } from "@/components/mzizi/FormGrid";
import { Modal } from "@/components/mzizi/Modal";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  PlayCircle,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

const STEP_ORDER = [
  "loan_accrual",
  "fd_accrual",
  "penalty_charges",
  "par_npa",
  "fd_maturity",
  "savings_interest",
  "gl_post",
  "trial_balance",
  "snapshots",
  "reports",
  "rollover",
] as const;

const STATUS_STYLE: Record<string, string> = {
  pending: "text-muted-foreground",
  processing: "text-blue-600",
  completed: "text-emerald-600",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
  pending_approval: "text-amber-600",
  in_progress: "text-blue-600",
};

function StepIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 size={13} className="text-emerald-600" />;
  if (status === "failed") return <XCircle size={13} className="text-destructive" />;
  if (status === "processing") return <Loader2 size={13} className="animate-spin text-blue-600" />;
  return <Clock size={13} className="text-muted-foreground" />;
}

export function EodTab() {
  const qc = useQueryClient();
  const settingsFn = useServerFn(getAutoEodSettings);
  const saveSettingsFn = useServerFn(updateAutoEodSettings);
  const branchesFn = useServerFn(listBranches);
  const runsFn = useServerFn(listEodRuns);
  const runCompanyFn = useServerFn(runCompanyEod);
  const preCheckFn = useServerFn(runPreCheck);
  const initiateFn = useServerFn(initiateEod);
  const approveFn = useServerFn(approveEod);
  const runAllFn = useServerFn(runAllSteps);
  const runStepFn = useServerFn(runStep);
  const getRunFn = useServerFn(getEodRun);
  const resumeFn = useServerFn(resumeEod);
  const defaultDateFn = useServerFn(getEodDefaultBusinessDate);

  const { data: settings } = useQuery({ queryKey: ["eod-settings"], queryFn: () => settingsFn() });
  const { data: branches } = useQuery({ queryKey: ["eod-branches"], queryFn: () => branchesFn() });
  const { data: runs } = useQuery({
    queryKey: ["eod-runs-all"],
    queryFn: () => runsFn({ data: { limit: 100 } }),
  });
  const { data: defaultDate } = useQuery({
    queryKey: ["eod-default-business-date"],
    queryFn: () => defaultDateFn(),
    staleTime: 60_000,
  });

  const [businessDate, setBusinessDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  useEffect(() => {
    if (defaultDate && typeof defaultDate === "string") setBusinessDate(defaultDate);
  }, [defaultDate]);
  const [autoEnabled, setAutoEnabled] = useState<boolean>(false);
  const [autoTime, setAutoTime] = useState<string>("00:30");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [preCheckBranch, setPreCheckBranch] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setAutoEnabled(!!settings.auto_eod_enabled);
      setAutoTime((settings.auto_eod_time ?? "00:30:00").toString().slice(0, 5));
    }
  }, [settings]);

  const saveM = useMutation({
    mutationFn: () => saveSettingsFn({ data: { enabled: autoEnabled, time: autoTime } }),
    onSuccess: () => {
      toast.success("Auto day-end settings saved");
      qc.invalidateQueries({ queryKey: ["eod-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runM = useMutation({
    mutationFn: () => runCompanyFn({ data: { business_date: businessDate } }),
    onSuccess: (res) => {
      const failed = res.results.filter((r) => !r.ok).length;
      if (failed) toast.error(`Day-end completed with ${failed} branch failure(s)`);
      else toast.success(`Day-end completed for ${res.results.length} branch(es)`);
      qc.invalidateQueries({ queryKey: ["eod-runs-all"] });
      qc.invalidateQueries({ queryKey: ["eod-branches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preCheckM = useMutation({
    mutationFn: (branchId: string) =>
      preCheckFn({ data: { branch_id: branchId, business_date: businessDate } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const initiateM = useMutation({
    mutationFn: (branchId: string) =>
      initiateFn({ data: { branch_id: branchId, business_date: businessDate } }),
    onSuccess: (runId) => {
      toast.success("Run initiated — awaiting approval");
      setSelectedRunId(runId);
      qc.invalidateQueries({ queryKey: ["eod-runs-all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const branchStatus = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of runs ?? []) {
      if (r.business_date !== businessDate) continue;
      if (!map.has(r.branch_id)) map.set(r.branch_id, r);
    }
    return (branches ?? []).map((b) => ({ branch: b, run: map.get(b.id) ?? null }));
  }, [runs, branches, businessDate]);

  return (
    <div className="flex flex-col gap-5">
      {/* Auto EOD settings */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} className="text-primary" />
          <div className="font-semibold text-[14px]">Automated day-end schedule</div>
        </div>
        <p className="text-[12.5px] text-muted-foreground mb-3">
          When enabled, the system automatically initiates the day-end process for{" "}
          <strong>all branches</strong> at the configured time (workspace timezone:{" "}
          <span className="font-mono">{settings?.timezone ?? "—"}</span>).
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={autoEnabled}
              onChange={(e) => setAutoEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            Enable auto day-end
          </label>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase text-faint">
              Run at (local time)
            </label>
            <input
              type="time"
              value={autoTime}
              onChange={(e) => setAutoTime(e.target.value)}
              className={cn(inputCls, "w-32")}
              disabled={!autoEnabled}
            />
          </div>
          <button
            className={btnPrimaryCls}
            onClick={() => saveM.mutate()}
            disabled={saveM.isPending}
          >
            {saveM.isPending ? "Saving…" : "Save settings"}
          </button>
        </div>
      </Card>

      {/* Manual company-wide run */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-semibold text-[14px]">Manual day-end</div>
            <div className="text-[12px] text-muted-foreground">
              Runs the full day-end sequence for every branch. Per-branch controls below.
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase text-faint">
                Business date
              </label>
              <input
                type="date"
                value={businessDate}
                onChange={(e) => setBusinessDate(e.target.value)}
                className={cn(inputCls, "w-40")}
              />
            </div>
            <button
              className={btnPrimaryCls}
              onClick={() => runM.mutate()}
              disabled={runM.isPending}
            >
              {runM.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin inline mr-1" /> Running…
                </>
              ) : (
                <>
                  <PlayCircle size={14} className="inline mr-1" /> Run day-end for all branches
                </>
              )}
            </button>
          </div>
        </div>

        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-faint font-semibold border-b border-border">
              <th className="py-2 pr-3">Branch</th>
              <th className="py-2 pr-3">Locked through</th>
              <th className="py-2 pr-3">Status ({businessDate})</th>
              <th className="py-2 pr-3">Started</th>
              <th className="py-2 pr-3">Completed</th>
              <th className="py-2 pr-3 text-right">Duration</th>
              <th className="py-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {branchStatus.map(({ branch, run }) => (
              <tr key={branch.id} className="border-b border-border/50">
                <td className="py-2 pr-3 font-medium">{branch.name}</td>
                <td className="py-2 pr-3 font-mono">{branch.eod_locked_through ?? "—"}</td>
                <td className={cn("py-2 pr-3 capitalize", STATUS_STYLE[run?.status ?? "pending"])}>
                  {run ? (
                    <span className="flex items-center gap-1.5">
                      <StepIcon status={run.status} />
                      {run.status.replace(/_/g, " ")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">not started</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {run?.started_at ? new Date(run.started_at).toLocaleString() : "—"}
                </td>
                <td className="py-2 pr-3">
                  {run?.completed_at ? new Date(run.completed_at).toLocaleString() : "—"}
                </td>
                <td className="py-2 pr-3 text-right font-mono">
                  {run?.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : "—"}
                </td>
                <td className="py-2 pr-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      className={cn(btnSecondaryCls, "!py-1 !px-2 text-[11px]")}
                      onClick={() => {
                        setPreCheckBranch(branch.id);
                        preCheckM.mutate(branch.id);
                      }}
                      title="Run pre-checks"
                    >
                      <ShieldCheck size={12} className="inline mr-1" />
                      Pre-check
                    </button>
                    {run ? (
                      <button
                        className={cn(btnSecondaryCls, "!py-1 !px-2 text-[11px]")}
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        Details
                      </button>
                    ) : (
                      <button
                        className={cn(btnPrimaryCls, "!py-1 !px-2 text-[11px]")}
                        onClick={() => initiateM.mutate(branch.id)}
                        disabled={initiateM.isPending}
                      >
                        Initiate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {branchStatus.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  No branches configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pre-check panel */}
        {preCheckBranch && preCheckM.data && (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={14} className="text-primary" />
              <div className="font-semibold text-[13px]">
                Pre-check — {branches?.find((b) => b.id === preCheckBranch)?.name ?? preCheckBranch}
              </div>
              <button
                className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setPreCheckBranch(null);
                  preCheckM.reset();
                }}
              >
                Close
              </button>
            </div>
            <PreCheckResults data={preCheckM.data} />
          </div>
        )}
      </Card>

      {/* Recent runs */}
      <Card>
        <div className="font-semibold text-[14px] mb-3">Recent day-end runs</div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-faint font-semibold border-b border-border">
              <th className="py-2 pr-3">Business date</th>
              <th className="py-2 pr-3">Branch</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Initiated</th>
              <th className="py-2 pr-3">Completed</th>
              <th className="py-2 pr-3 text-right">Duration</th>
              <th className="py-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(runs ?? []).slice(0, 40).map((r) => {
              const branch = branches?.find((b) => b.id === r.branch_id);
              return (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-mono">{r.business_date}</td>
                  <td className="py-2 pr-3">{branch?.name ?? "—"}</td>
                  <td className={cn("py-2 pr-3 capitalize", STATUS_STYLE[r.status])}>
                    <span className="flex items-center gap-1.5">
                      <StepIcon status={r.status} />
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {r.initiated_at ? new Date(r.initiated_at).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <button
                      className={cn(btnSecondaryCls, "!py-1 !px-2 text-[11px]")}
                      onClick={() => setSelectedRunId(r.id)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              );
            })}
            {(runs ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  No day-end runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Run detail modal */}
      {selectedRunId && (
        <RunDetailModal
          runId={selectedRunId}
          onClose={() => setSelectedRunId(null)}
          getRunFn={getRunFn}
          approveFn={approveFn}
          runAllFn={runAllFn}
          runStepFn={runStepFn}
          resumeFn={resumeFn}
          branches={branches ?? []}
        />
      )}
    </div>
  );
}

function PreCheckResults({ data }: { data: any }) {
  // Server RPC shape: { business_date, blockers:[], warnings:[], blocking, checked_at }.
  // Older shape ({ checks:[] }) is also handled defensively.
  const blockers: Array<{ code?: string; label?: string; count?: number }> = Array.isArray(
    data?.blockers,
  )
    ? data.blockers
    : [];
  const warnings: Array<{ code?: string; label?: string; count?: number }> = Array.isArray(
    data?.warnings,
  )
    ? data.warnings
    : [];
  const legacy: Array<{ key: string; ok: boolean; blocking?: boolean; message?: string }> =
    Array.isArray(data?.checks) ? data.checks : [];

  if (blockers.length === 0 && warnings.length === 0 && legacy.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-emerald-600">
        <CheckCircle2 size={13} /> All pre-checks passed.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {blockers.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-destructive">
            <AlertTriangle size={13} />
            {blockers.length} blocker(s) — day-end cannot proceed
          </div>
          <ul className="text-[12px] space-y-1">
            {blockers.map((b, i) => (
              <li key={`b-${i}`} className="flex items-start gap-2">
                <XCircle size={13} className="text-destructive mt-0.5 shrink-0" />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {b.code ?? "blocker"}
                </span>
                <span>— {b.label ?? "Blocking issue"}</span>
                {typeof b.count === "number" && (
                  <span className="text-muted-foreground">({b.count})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-amber-600">
            <AlertTriangle size={13} />
            {warnings.length} warning(s) — informational
          </div>
          <ul className="text-[12px] space-y-1">
            {warnings.map((w, i) => (
              <li key={`w-${i}`} className="flex items-start gap-2">
                <AlertTriangle size={13} className="text-amber-600 mt-0.5 shrink-0" />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {w.code ?? "warning"}
                </span>
                <span>— {w.label ?? "Informational"}</span>
                {typeof w.count === "number" && (
                  <span className="text-muted-foreground">({w.count})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {legacy.length > 0 && (
        <ul className="text-[12px] space-y-1">
          {legacy.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              {c.ok ? (
                <CheckCircle2 size={13} className="text-emerald-600 mt-0.5 shrink-0" />
              ) : (
                <XCircle size={13} className="text-destructive mt-0.5 shrink-0" />
              )}
              <span className="font-mono text-[11px] text-muted-foreground">{c.key}</span>
              {c.message && <span className="text-muted-foreground">— {c.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RunDetailModal({
  runId,
  onClose,
  getRunFn,
  approveFn,
  runAllFn,
  runStepFn,
  resumeFn,
  branches,
}: {
  runId: string;
  onClose: () => void;
  getRunFn: ReturnType<typeof useServerFn<typeof getEodRun>>;
  approveFn: ReturnType<typeof useServerFn<typeof approveEod>>;
  runAllFn: ReturnType<typeof useServerFn<typeof runAllSteps>>;
  runStepFn: ReturnType<typeof useServerFn<typeof runStep>>;
  resumeFn: ReturnType<typeof useServerFn<typeof resumeEod>>;
  branches: Array<{ id: string; name: string; eod_locked_through: string | null }>;
}) {
  const qc = useQueryClient();
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["eod-run", runId],
    queryFn: () => getRunFn({ data: { id: runId } }),
    refetchInterval: 3000,
  });

  const run = data?.run;
  const logs = data?.logs ?? [];
  const branch = branches.find((b) => b.id === run?.branch_id);
  const steps = ((run?.steps as any[]) ?? []) as Array<{
    key: string;
    status: string;
    error?: string | null;
    duration_ms?: number;
    metrics?: any;
  }>;
  const stepByKey = new Map(steps.map((s) => [s.key, s]));

  const approveM = useMutation({
    mutationFn: () => approveFn({ data: { run_id: runId } }),
    onSuccess: () => {
      toast.success("Approved — run started");
      refetch();
      qc.invalidateQueries({ queryKey: ["eod-runs-all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runAllM = useMutation({
    mutationFn: () => runAllFn({ data: { run_id: runId } }),
    onSuccess: (r: any) => {
      if (r && r.ok === false && r.error) toast.error(r.error);
      else if (r?.failed_step) toast.error(`${r.failed_step}: ${r.error ?? "failed"}`);
      else if (r?.executed === false) toast.info("No pending steps to run.");
      else toast.success("Steps executed");
      refetch();
      qc.invalidateQueries({ queryKey: ["eod-runs-all"] });
      qc.invalidateQueries({ queryKey: ["eod-branches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resumeM = useMutation({
    mutationFn: () => resumeFn({ data: { run_id: runId } }),
    onSuccess: () => {
      toast.success("Resume requested — awaiting second-officer approval");
      refetch();
      qc.invalidateQueries({ queryKey: ["eod-runs-all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryM = useMutation({
    mutationFn: (step: string) => runStepFn({ data: { run_id: runId, step: step as any } }),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success("Step completed");
      else toast.error(r?.error ?? "Step failed");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open onClose={onClose} title="Day-end run details" width={900}>
      {!run ? (
        <div className="py-8 text-center text-muted-foreground text-[13px]">
          <Loader2 size={14} className="animate-spin inline mr-1" /> Loading…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <Meta label="Branch" value={branch?.name ?? run.branch_id} />
            <Meta label="Business date" value={run.business_date} mono />
            <Meta
              label="Status"
              value={
                <span className={cn("capitalize", STATUS_STYLE[run.status])}>
                  {run.status.replace(/_/g, " ")}
                </span>
              }
            />
            <Meta
              label="Duration"
              value={run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : "—"}
            />
            <Meta
              label="Initiated"
              value={run.initiated_at ? new Date(run.initiated_at).toLocaleString() : "—"}
            />
            <Meta
              label="Approved"
              value={run.approved_at ? new Date(run.approved_at).toLocaleString() : "—"}
            />
            <Meta
              label="Started"
              value={run.started_at ? new Date(run.started_at).toLocaleString() : "—"}
            />
            <Meta
              label="Completed"
              value={run.completed_at ? new Date(run.completed_at).toLocaleString() : "—"}
            />
          </div>

          {run.status === "pending_approval" && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 flex items-center justify-between">
              <div className="text-[13px]">
                <div className="font-semibold text-amber-700">Awaiting approval</div>
                <div className="text-muted-foreground text-[12px]">
                  Maker-checker requires a second officer to approve before steps run.
                </div>
              </div>
              <button
                className={btnPrimaryCls}
                onClick={() => approveM.mutate()}
                disabled={approveM.isPending}
              >
                <ShieldCheck size={13} className="inline mr-1" />
                Approve & start
              </button>
            </div>
          )}

          {(run.status === "in_progress" || run.status === "failed") && (
            <div className="flex items-center gap-2 flex-wrap">
              {run.status === "in_progress" && (
                <button
                  className={btnPrimaryCls}
                  onClick={() => runAllM.mutate()}
                  disabled={runAllM.isPending}
                >
                  {runAllM.isPending ? (
                    <>
                      <Loader2 size={13} className="animate-spin inline mr-1" /> Running…
                    </>
                  ) : (
                    <>
                      <PlayCircle size={13} className="inline mr-1" /> Run all remaining steps
                    </>
                  )}
                </button>
              )}
              {run.status === "failed" && (
                <button
                  className={btnPrimaryCls}
                  onClick={() => resumeM.mutate()}
                  disabled={resumeM.isPending}
                  title="Re-runs pre-checks, keeps completed steps, and routes back through second-officer approval."
                >
                  {resumeM.isPending ? (
                    <>
                      <Loader2 size={13} className="animate-spin inline mr-1" /> Requesting…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={13} className="inline mr-1" /> Resume run (send for
                      approval)
                    </>
                  )}
                </button>
              )}
              <button className={btnSecondaryCls} onClick={() => refetch()} disabled={isFetching}>
                <RefreshCcw size={13} className={cn("inline mr-1", isFetching && "animate-spin")} />
                Refresh
              </button>
            </div>
          )}

          {run.pre_check && (
            <div className="rounded-lg border border-border p-3">
              <div className="font-semibold text-[13px] mb-2">Pre-check results</div>
              <PreCheckResults data={run.pre_check} />
            </div>
          )}

          <div>
            <div className="font-semibold text-[13px] mb-2">Steps</div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-faint font-semibold border-b border-border">
                  <th className="py-1.5 pr-2">#</th>
                  <th className="py-1.5 pr-2">Step</th>
                  <th className="py-1.5 pr-2">Status</th>
                  <th className="py-1.5 pr-2">Duration</th>
                  <th className="py-1.5 pr-2">Error / Metrics</th>
                  <th className="py-1.5 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {STEP_ORDER.map((key, i) => {
                  const s = stepByKey.get(key);
                  const status = s?.status ?? "pending";
                  return (
                    <tr key={key} className="border-b border-border/40 align-top">
                      <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 pr-2 font-mono">{key}</td>
                      <td className={cn("py-1.5 pr-2 capitalize", STATUS_STYLE[status])}>
                        <span className="flex items-center gap-1.5">
                          <StepIcon status={status} />
                          {status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 font-mono">
                        {s?.duration_ms ? `${(s.duration_ms / 1000).toFixed(2)}s` : "—"}
                      </td>
                      <td className="py-1.5 pr-2">
                        {s?.error ? (
                          <span className="text-destructive text-[11.5px] whitespace-pre-wrap">
                            {s.error}
                          </span>
                        ) : s?.metrics && Object.keys(s.metrics).length > 0 ? (
                          <span className="text-muted-foreground text-[11px] font-mono">
                            {Object.entries(s.metrics)
                              .slice(0, 4)
                              .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                              .join(" · ")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        {run.status === "in_progress" &&
                          (status === "failed" || status === "pending") && (
                            <button
                              className={cn(btnSecondaryCls, "!py-0.5 !px-2 text-[11px]")}
                              onClick={() => retryM.mutate(key)}
                              disabled={retryM.isPending}
                            >
                              {status === "failed" ? "Retry" : "Run"}
                            </button>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {logs.length > 0 && (
            <div>
              <div className="font-semibold text-[13px] mb-2">Audit history</div>
              <div className="max-h-56 overflow-auto rounded border border-border">
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr className="text-left text-faint font-semibold border-b border-border bg-muted/40 sticky top-0">
                      <th className="py-1.5 px-2">When</th>
                      <th className="py-1.5 px-2">Step</th>
                      <th className="py-1.5 px-2">Status</th>
                      <th className="py-1.5 px-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l: any) => (
                      <tr key={l.id} className="border-b border-border/40">
                        <td className="py-1 px-2 font-mono">
                          {l.started_at ? new Date(l.started_at).toLocaleString() : "—"}
                        </td>
                        <td className="py-1 px-2 font-mono">{l.step_key}</td>
                        <td className={cn("py-1 px-2 capitalize", STATUS_STYLE[l.status])}>
                          {l.status?.replace(/_/g, " ")}
                        </td>
                        <td className="py-1 px-2 text-destructive">{l.error ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Meta({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase text-faint">{label}</div>
      <div className={cn("text-[12.5px]", mono && "font-mono")}>{value}</div>
    </div>
  );
}
