import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Users, Wallet, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Activity, TrendingUp, CheckCircle2 } from "lucide-react";
import { getDashboard, approveLoan, declineLoan } from "@/lib/mzizi.functions";
import { listInstances, CANONICAL_TX_TYPES } from "@/lib/workflow.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { RiskBadge } from "@/components/mzizi/Badge";
import { Avatar } from "@/components/mzizi/Avatar";
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
  tone, label, value, delta, icon: Icon, to,
}: {
  tone: keyof typeof TONES;
  label: string;
  value: string | number;
  delta?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  to?: string;
}) {
  const t = TONES[tone];
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
        {typeof value === "number" ? money(value) : value}
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
  const qc = useQueryClient();
  const approveFn = useServerFn(approveLoan);
  const declineFn = useServerFn(declineLoan);
  const approve = useMutation({
    mutationFn: approveFn,
    onSuccess: (r) => { toast.success(`Approved · disbursed ${r.reference}`); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const decline = useMutation({
    mutationFn: declineFn,
    onSuccess: () => { toast.success("Declined"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const wfFn = useServerFn(listInstances);
  const { data: wfInbox = [] } = useQuery({
    queryKey: ["workflow_instances", "mine"],
    queryFn: () => wfFn({ data: { mine: true, status: "pending" } as any }),
  });
  const [openInst, setOpenInst] = useState<any | null>(null);

  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;


  const totalPar = data.par.reduce((s, b) => s + b.amount, 0);
  const team = data.team ?? [];
  const teamTotals = data.teamTotals ?? { totalToday: 0, totalWeek: 0, activeStaff: 0, maxWeek: 0 };

  return (
    <div className="flex flex-col gap-5 animate-fadein">
      {/* Vibrant KPIs */}
      <div className="grid grid-cols-5 gap-3.5">
        <VibrantKpi tone="indigo" to="/clients" label="Active clients" value={String(data.kpis.activeClients)} delta={`+${Math.floor(data.kpis.activeClients / 20 || 1)} this week`} icon={Users} />
        <VibrantKpi tone="teal"   to="/loans" label="Portfolio outstanding" value={data.kpis.outstanding} delta="Live balance" icon={Wallet} />
        <VibrantKpi tone="rose"   to="/collections" label="PAR > 30 days" value={data.kpis.par30plus} delta={totalPar > 0 ? `${((data.kpis.par30plus / totalPar) * 100).toFixed(1)}% of book` : "—"} icon={AlertTriangle} />
        <VibrantKpi tone="amber"  to="/collections" label="Collected today" value={data.kpis.collectedToday} delta="Since midnight" icon={ArrowDownCircle} />
        <VibrantKpi tone="violet" to="/transactions" label="Disbursed / week" value={data.kpis.disbursedWeek} delta="Last 7 days" icon={ArrowUpCircle} />
      </div>

      {/* PAR + Meetings */}
      <div className="grid grid-cols-2 gap-4">
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
          <CardTitle>Today's group meetings</CardTitle>
          {data.meetings.length === 0 && <div className="text-center text-sm text-faint py-6">No meetings scheduled</div>}
          {data.meetings.map((m: any) => (
            <div key={m.id} className="flex items-center gap-3 py-3 border-t border-row-divider first:border-t-0">
              <div className="font-mono font-semibold text-[13px] text-primary w-11">{m.meeting_day?.split(" ")[1] ?? "—"}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{m.name}</div>
                <div className="text-[11.5px] text-muted-foreground">{m.meeting_place ?? "Field"}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs font-semibold text-primary">{money(m.target_today)}</div>
                <div className="text-[10.5px] text-faint">target today</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Team attendance / workflow performance */}
      <Card>
        <CardTitle
          subtitle="Staff logging activity — based on approval workflow decisions"
          right={
            <div className="flex items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary font-semibold">
                <Activity size={12} /> {teamTotals.totalToday} actions today
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-secondary-foreground font-semibold">
                <TrendingUp size={12} /> {teamTotals.totalWeek} / 7d
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-secondary-foreground font-semibold">
                <Users size={12} /> {teamTotals.activeStaff} active
              </span>
            </div>
          }
        >
          Team activity
        </CardTitle>

        {team.length === 0 && (
          <div className="text-center text-faint text-sm py-6">No workflow actions recorded in the last 7 days.</div>
        )}

        {team.map((t: any, idx: number) => {
          const pct = teamTotals.maxWeek > 0 ? Math.round((t.week / teamTotals.maxWeek) * 100) : 0;
          const isTop = idx === 0 && t.week > 0;
          return (
            <div key={t.staff_id} className="py-2.5 border-t border-row-divider first:border-t-0">
              <div className="flex items-center gap-3">
                <Avatar name={t.name} size={30} color={isTop ? "#4f46e5" : "#0f766e"} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold truncate">{t.name}</span>
                    <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-muted text-secondary-foreground capitalize">{t.role?.replace("_", " ")}</span>
                    {isTop && (
                      <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">Top performer</span>
                    )}
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(pct, 4)}%`,
                        background: "linear-gradient(90deg, #14b8a6 0%, #6366f1 100%)",
                      }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0 w-40">
                  <div className="flex items-center justify-end gap-3 text-[11.5px]">
                    <span className="text-muted-foreground">Today <span className="font-mono font-semibold text-foreground">{t.today}</span></span>
                    <span className="text-muted-foreground">7d <span className="font-mono font-semibold text-foreground">{t.week}</span></span>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-0.5 text-[10.5px]">
                    <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={10} />{t.approvals}</span>
                    <span className="text-rose-600">✕ {t.declines}</span>
                    {t.last_at && (
                      <span className="text-faint">· {new Date(t.last_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      {/* Workflow inbox — assigned to me */}
      <Card>
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
            {wfInbox.slice(0, 6).map((inst: any) => {
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

      {openInst && (
        <InstanceDetailModal instance={openInst} onClose={() => setOpenInst(null)} />
      )}


      {/* Approvals — kept intact */}
      <Card>
        <CardTitle>
          <span className="flex items-center gap-2">
            Pending approvals
            <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#f59e0b", color: "#3a2606" }}>
              {data.approvals.length}
            </span>
          </span>
        </CardTitle>
        <div className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold pb-2.5 border-b border-border" style={{ gridTemplateColumns: "1.5fr 1.4fr 1fr .9fr .8fr 1.3fr" }}>
          <div>Client</div><div>Product</div><div>Amount</div><div>Submitted</div><div>Risk</div><div className="text-right">Decision</div>
        </div>
        {data.approvals.length === 0 && <div className="text-center text-faint text-sm py-7">✓ All applications reviewed</div>}
        {data.approvals.map((a: any) => (
          <div key={a.id} className="grid items-center text-[12.5px] py-3 border-b border-row-divider last:border-b-0" style={{ gridTemplateColumns: "1.5fr 1.4fr 1fr .9fr .8fr 1.3fr" }}>
            <div className="font-semibold flex items-center gap-2.5">
              <Avatar name={a.client?.full_name ?? "?"} color={a.client?.avatar_color} size={28} />
              {a.client?.full_name}
            </div>
            <div className="text-secondary-foreground">{a.product?.name}</div>
            <div className="font-mono font-semibold">{money(a.principal)}</div>
            <div className="text-muted-foreground">{new Date(a.submitted_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</div>
            <div><RiskBadge risk={a.client?.risk_grade} /></div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => decline.mutate({ data: { loan_id: a.id } })}
                className="border border-border-strong bg-card text-muted-foreground text-[11.5px] font-medium px-3 py-1.5 rounded-md hover:border-destructive hover:text-destructive"
              >
                Decline
              </button>
              <button
                onClick={() => approve.mutate({ data: { loan_id: a.id } })}
                className="bg-primary text-primary-foreground text-[11.5px] font-semibold px-3 py-1.5 rounded-md hover:bg-primary-hover"
              >
                Approve
              </button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
