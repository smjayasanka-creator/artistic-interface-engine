import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getAutoEodSettings,
  updateAutoEodSettings,
  listBranches,
  listEodRuns,
  runCompanyEod,
} from "@/lib/eod.functions";
import { Card } from "@/components/mzizi/Card";
import { btnPrimaryCls, btnSecondaryCls, inputCls } from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Loader2, Clock, PlayCircle } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  pending: "text-muted-foreground",
  processing: "text-blue-600",
  completed: "text-emerald-600",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
  pending_approval: "text-amber-600",
  in_progress: "text-blue-600",
};

export function EodTab() {
  const qc = useQueryClient();
  const settingsFn = useServerFn(getAutoEodSettings);
  const saveSettingsFn = useServerFn(updateAutoEodSettings);
  const branchesFn = useServerFn(listBranches);
  const runsFn = useServerFn(listEodRuns);
  const runCompanyFn = useServerFn(runCompanyEod);

  const { data: settings } = useQuery({ queryKey: ["eod-settings"], queryFn: () => settingsFn() });
  const { data: branches } = useQuery({ queryKey: ["eod-branches"], queryFn: () => branchesFn() });
  const { data: runs } = useQuery({
    queryKey: ["eod-runs-all"],
    queryFn: () => runsFn({ data: { limit: 100 } }),
  });

  const [businessDate, setBusinessDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [autoEnabled, setAutoEnabled] = useState<boolean>(false);
  const [autoTime, setAutoTime] = useState<string>("00:30");

  // Sync from server
  useMemo(() => {
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

  // Group latest run per branch for this business_date
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
              Runs the full day-end sequence for every branch at once.
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
                      {run.status === "completed" && (
                        <CheckCircle2 size={13} className="text-emerald-600" />
                      )}
                      {run.status === "failed" && (
                        <XCircle size={13} className="text-destructive" />
                      )}
                      {run.status === "in_progress" && (
                        <Loader2 size={13} className="animate-spin text-blue-600" />
                      )}
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
              </tr>
            ))}
            {branchStatus.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No branches configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
                    {r.status.replace(/_/g, " ")}
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
                </tr>
              );
            })}
            {(runs ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No day-end runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
