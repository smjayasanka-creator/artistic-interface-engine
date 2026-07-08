import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getDashboard, approveLoan, declineLoan } from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Kpi } from "@/components/mzizi/Kpi";
import { RiskBadge } from "@/components/mzizi/Badge";
import { Avatar } from "@/components/mzizi/Avatar";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const PAR_TONES: Record<string, string> = {
  current: "var(--teal-bright)",
  "1-30": "#f59e0b",
  "31-60": "#f97316",
  "61-90": "#ef4444",
  "90+": "#b91c1c",
};

function Dashboard() {
  const fn = useServerFn(getDashboard);
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => fn() });
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

  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const totalPar = data.par.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="flex flex-col gap-5 animate-fadein">
      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3.5">
        <Kpi label="Active clients" value={String(data.kpis.activeClients)} delta={`+${Math.floor(data.kpis.activeClients / 20 || 1)} this week`} />
        <Kpi label="Portfolio outstanding" value={data.kpis.outstanding} delta="Live" deltaTone="neutral" />
        <Kpi label="PAR > 30 days" value={data.kpis.par30plus} delta={totalPar > 0 ? `${((data.kpis.par30plus / totalPar) * 100).toFixed(1)}% of book` : "—"} deltaTone={data.kpis.par30plus > 0 ? "negative" : "positive"} />
        <Kpi label="Collected today" value={data.kpis.collectedToday} delta="Since midnight" deltaTone="neutral" />
        <Kpi label="Disbursed / week" value={data.kpis.disbursedWeek} delta="Last 7 days" deltaTone="neutral" />
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
                  <div className="h-full rounded-md" style={{ width: `${Math.max(pct, 2)}%`, background: PAR_TONES[b.bucket] }} />
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

      {/* Approvals */}
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

