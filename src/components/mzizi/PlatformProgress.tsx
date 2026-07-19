import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Wrench,
  XCircle,
  Loader2,
} from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { cn } from "@/lib/utils";
import { shortDate } from "@/lib/format";
import {
  getPlatformProgress,
  type ProgressTab,
} from "@/lib/platform-progress.functions";

type Props = { tab: ProgressTab };

/**
 * Compact three-panel progress strip surfaced at the top of every
 * Platform Admin tab: recent activity, contract/RPC health, and
 * hardening completion — sliced to the currently active tab.
 */
export function PlatformProgress({ tab }: Props) {
  const fn = useServerFn(getPlatformProgress);
  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-progress"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });

  const [open, setOpen] = useState(true);

  if (isLoading) {
    return (
      <Card className="flex items-center gap-2 text-[12.5px] text-muted-foreground py-3">
        <Loader2 size={14} className="animate-spin" /> Loading progress…
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card className="text-[12.5px] text-rose-700 py-3">
        Progress snapshot unavailable
        {error instanceof Error ? `: ${error.message}` : ""}.
      </Card>
    );
  }

  const hard = data.hardening.by_tab[tab] ?? { done: 0, total: 0 };
  const hardPct = hard.total ? Math.round((hard.done / hard.total) * 100) : 0;
  const tabRpcs = data.contracts.rpcs.filter((r) => r.tab === tab);
  const tabRpcsAll = data.contracts.rpcs;
  const rpcSlice = tab === "overview" ? tabRpcsAll : tabRpcs;
  const rpcMissing = rpcSlice.filter((r) => !r.present).length;
  const activity = data.activity.by_tab[tab] ?? [];

  return (
    <Card className="py-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <CardTitle className="!mb-0">Progress snapshot</CardTitle>
          <span className="text-[11px] text-muted-foreground">
            {data.generated_at ? `updated ${shortDate(data.generated_at)}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11.5px]">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck size={12} className="text-emerald-600" />
            {hard.done}/{hard.total} hardened
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1",
              rpcMissing ? "text-rose-700" : "text-emerald-700",
            )}
          >
            <Wrench size={12} /> {rpcSlice.length - rpcMissing}/{rpcSlice.length} RPCs
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Activity size={12} /> {activity.length} recent
          </span>
        </div>
      </button>

      {open && (
        <div className="grid grid-cols-3 gap-3 mt-3">
          {/* Hardening panel */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Hardening
            </div>
            <div className="text-[18px] font-semibold">{hardPct}%</div>
            <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${hardPct}%` }}
              />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {hard.done} of {hard.total} items complete in scoped tiers
            </div>
          </div>

          {/* Contracts panel */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Contract health
            </div>
            <div className="flex items-baseline gap-1.5">
              <div className="text-[18px] font-semibold">
                {rpcSlice.length - rpcMissing}
                <span className="text-muted-foreground text-[13px]">/{rpcSlice.length}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">RPCs present</span>
            </div>
            <div className="mt-1.5 flex flex-col gap-0.5 max-h-24 overflow-auto">
              {rpcSlice.length === 0 && (
                <span className="text-[11px] text-muted-foreground">
                  No critical RPCs scoped here.
                </span>
              )}
              {rpcSlice.map((r) => (
                <div key={r.name} className="flex items-center gap-1.5 text-[11.5px]">
                  {r.present ? (
                    <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle size={11} className="text-rose-600 shrink-0" />
                  )}
                  <code className="font-mono">{r.name}</code>
                  <span className="text-muted-foreground truncate">— {r.purpose}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Activity panel */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Recent activity
            </div>
            {activity.length === 0 ? (
              <div className="text-[11.5px] text-muted-foreground">
                No recent audit or domain events for this scope.
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 max-h-32 overflow-auto">
                {activity.map((a) => (
                  <div key={`${a.source}-${a.id}`} className="text-[11.5px] flex gap-1.5">
                    <span
                      className={cn(
                        "shrink-0 rounded px-1 text-[10px] font-medium",
                        a.source === "audit"
                          ? "bg-sky-500/15 text-sky-700"
                          : "bg-violet-500/15 text-violet-700",
                      )}
                    >
                      {a.source}
                    </span>
                    <span className="truncate">{a.summary}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">
                      {shortDate(a.at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
