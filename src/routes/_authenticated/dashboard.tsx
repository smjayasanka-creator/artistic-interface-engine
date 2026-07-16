import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, Wallet, Banknote, TrendingUp, Percent } from "lucide-react";
import { getDashboard } from "@/lib/mzizi.functions";
import { listInstances, CANONICAL_TX_TYPES } from "@/lib/workflow.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { InstanceDetailModal } from "@/components/mzizi/InstanceDetailModal";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  errorComponent: DashboardError,
});


function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="animate-fadein flex items-center justify-center min-h-[60vh] p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 text-center">
        <div className="w-9 h-9 rounded-full mx-auto mb-3 flex items-center justify-center bg-destructive/10 text-destructive font-semibold">!</div>
        <h2 className="text-sm font-semibold text-foreground">Couldn't load dashboard</h2>
        <p className="text-xs text-muted-foreground mt-1">{error.message || "Something went wrong."}</p>
        <button
          onClick={() => { reset(); router.invalidate(); }}
          className="mt-4 bg-primary text-primary-foreground text-xs font-semibold px-3 py-2 rounded-md hover:bg-primary-hover"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

const PAR_TONES: Record<string, string> = {
  current: "#14b8a6",
  "1-30": "#f59e0b",
  "31-60": "#f97316",
  "61-90": "#ef4444",
  "90+": "#b91c1c",
};

type KpiTone = {
  from: string;
  to: string;
  ring: string;
  fg: string;
  chip: string;
};

const TONES: Record<string, KpiTone> = {
  teal:   { from: "#0d9488", to: "#14b8a6", ring: "rgba(20,184,166,.35)", fg: "#ffffff", chip: "rgba(255,255,255,.18)" },
  indigo: { from: "#4f46e5", to: "#6366f1", ring: "rgba(99,102,241,.35)", fg: "#ffffff", chip: "rgba(255,255,255,.18)" },
  rose:   { from: "#e11d48", to: "#f43f5e", ring: "rgba(244,63,94,.35)",  fg: "#ffffff", chip: "rgba(255,255,255,.18)" },
  amber:  { from: "#d97706", to: "#f59e0b", ring: "rgba(245,158,11,.35)", fg: "#ffffff", chip: "rgba(255,255,255,.2)"  },
  violet: { from: "#7c3aed", to: "#a855f7", ring: "rgba(168,85,247,.35)", fg: "#ffffff", chip: "rgba(255,255,255,.18)" },
};

function VibrantKpi({
  tone, label, value, delta, icon: Icon, to, format = "money",
}: {
  tone: keyof typeof TONES;
  label: string;
  value: string | number;
  delta?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  to?: string;
  format?: "money" | "percent" | "number";
}) {
  const t = TONES[tone];
  const displayValue = (() => {
    if (typeof value !== "number") return value;
    if (format === "percent") return `${(value * 100).toFixed(1)}%`;
    if (format === "number") return value.toLocaleString();
    return money(value);
  })();
  const inner = (
    <>
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }} />
      <div className="relative flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,.85)" }}>{label}</div>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: t.chip }}>
          <Icon size={14} className="text-white" />
        </div>
      </div>
      <div className="relative text-[22px] font-semibold tracking-tight leading-none">
        {displayValue}
      </div>
      {delta && (
        <div className="relative text-[11px] font-medium mt-2" style={{ color: "rgba(255,255,255,.9)" }}>{delta}</div>
      )}
    </>
  );
  const style = {
    background: `linear-gradient(135deg, ${t.from} 0%, ${t.to} 100%)`,
    boxShadow: `0 10px 24px -12px ${t.ring}, 0 1px 0 rgba(255,255,255,.15) inset`,
  } as const;
  const cls = "relative overflow-hidden rounded-2xl px-4 py-4 text-white block transition-transform hover:-translate-y-0.5 hover:shadow-lg";
  if (to) {
    return (
      <Link to={to} className={cls} style={style}>
        {inner}
      </Link>
    );
  }
  return <div className={cls} style={style}>{inner}</div>;
}

function Dashboard() {
  const fn = useServerFn(getDashboard);
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fn(),
    retry: (count, err: any) => {
      const msg = String(err?.message ?? "");
      if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) return count < 3;
      return count < 1;
    },
    retryDelay: (attempt) => Math.min(400 * 2 ** attempt, 2000),
  });

  const wfFn = useServerFn(listInstances);
  const { data: wfInbox = [] } = useQuery({
    queryKey: ["workflow_instances", "mine"],
    queryFn: () => wfFn({ data: { mine: true, status: "pending" } as any }),
  });
  const [openInst, setOpenInst] = useState<any | null>(null);

  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const totalPar = data.par.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="flex flex-col gap-5 animate-fadein">
      {/* Vibrant KPIs */}
      <div className="grid grid-cols-5 gap-3.5">
        <VibrantKpi tone="indigo" to="/transactions" label="Disbursement" value={data.kpis.disbursement} delta="This month" icon={Banknote} />
        <VibrantKpi tone="teal"   to="/loans" label="Portfolio Growth" value={data.kpis.portfolioGrowth} delta="Disbursed − collected this month" icon={TrendingUp} />
        <VibrantKpi tone="rose"   to="/savings" label="Deposit Net Intake" value={data.kpis.depositNetIntake} delta="Deposits − withdrawals this month" icon={Wallet} />
        <VibrantKpi tone="amber"  to="/collections" label="Due Collection Ratio" value={data.kpis.dueCollectionRatio} format="percent" delta="Collected / due this month" icon={Percent} />
        <VibrantKpi tone="violet" to="/clients" label="Number of New Customers" value={data.kpis.newCustomers} format="number" delta="Joined this month" icon={Users} />
      </div>

      {/* Pending approvals + PAR + Product wise disbursement */}
      <div className="grid grid-cols-2 gap-4 auto-rows-fr">
        <Card className="row-span-2">
          <CardTitle
            subtitle="Click Open to review the request and Approve, Reject or Send back."
            right={
              <Link to="/approvals" className="text-[11.5px] font-semibold text-primary hover:underline">
                Open inbox →
              </Link>
            }
          >
            <span className="flex items-center gap-2">
              Pending approval jobs
              <span
                className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "#f59e0b", color: "#3a2606" }}
              >
                {wfInbox.length}
              </span>
            </span>
          </CardTitle>
          {wfInbox.length === 0 ? (
            <div className="text-center text-faint text-sm py-6">✓ Nothing awaiting your decision</div>
          ) : (
            <div className="flex flex-col divide-y divide-row-divider">
              {wfInbox.slice(0, 12).map((inst: any) => {
                const step = inst.step_config;
                const totalSteps = inst.workflow?.steps?.length ?? 0;
                const txLabel =
                  CANONICAL_TX_TYPES.find((t) => t.code === inst.transaction_type)?.label ??
                  inst.transaction_type;
                return (
                  <div key={inst.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-foreground truncate">
                          {inst.reference_label}
                        </span>
                        {inst.overdue && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 border border-rose-500/30">
                            SLA overdue
                          </span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-faint mt-0.5">
                        {txLabel} · Step {inst.current_step}/{totalSteps} — {step?.name ?? "—"}
                        {inst.amount != null && <> · {money(Number(inst.amount))}</>}
                      </div>
                    </div>
                    <button
                      onClick={() => setOpenInst(inst)}
                      className={cn(
                        "shrink-0 inline-flex items-center h-8 px-3 rounded-md",
                        "bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary-hover",
                      )}
                    >
                      Open
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle subtitle={`Aging by principal balance · ${money(totalPar)} outstanding`}>
            Portfolio at risk
          </CardTitle>
          {data.par.map((b) => {
            const pct = totalPar > 0 ? (b.amount / totalPar) * 100 : 0;
            return (
              <div key={b.bucket} className="mb-3.5">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-secondary-foreground">{b.bucket === "current" ? "Current" : `${b.bucket} days`}</span>
                  <span className="font-mono text-muted-foreground">{money(b.amount)} · {pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-md bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-md transition-all"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      background: `linear-gradient(90deg, ${PAR_TONES[b.bucket]} 0%, ${PAR_TONES[b.bucket]}cc 100%)`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </Card>

        <Card>
          <CardTitle subtitle="Disbursed amount grouped by loan product this month">
            Product wise disbursement
          </CardTitle>
          {data.productWiseDisbursement?.length === 0 ? (
            <div className="text-center text-faint text-sm py-6">No disbursements this month</div>
          ) : (
            <div className="flex flex-col gap-3">
              {data.productWiseDisbursement.map((row: any) => {
                const total = data.kpis.disbursement || 0;
                const pct = total > 0 ? (row.amount / total) * 100 : 0;
                return (
                  <div key={row.product}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-secondary-foreground truncate pr-2">{row.product}</span>
                      <span className="font-mono text-muted-foreground shrink-0">{money(row.amount)} · {pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-md bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-md transition-all bg-primary"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {openInst && (
        <InstanceDetailModal instance={openInst} onClose={() => setOpenInst(null)} />
      )}

    </div>
  );
}
