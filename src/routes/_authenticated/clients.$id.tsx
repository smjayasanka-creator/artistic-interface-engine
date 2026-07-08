import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getClient } from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Avatar } from "@/components/mzizi/Avatar";
import { StatusBadge } from "@/components/mzizi/Badge";

import { money, shortDate, relTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: Client360,
});

function Client360() {
  const { id } = Route.useParams();
  const fn = useServerFn(getClient);
  const { data } = useQuery({ queryKey: ["client", id], queryFn: () => fn({ data: { id } }) });
  const modals = useModals();
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const { client, active, stats, repayments } = data;

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/clients" className="text-xs text-primary hover:underline">← Back to clients</Link>
      <Card padded={false} className="p-6 flex items-center gap-5">
        <Avatar name={client.full_name} color={client.avatar_color} size={60} />
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            <div className="text-xl font-semibold">{client.full_name}</div>
            <StatusBadge status={client.status} />
          </div>
          <div className="text-[12.5px] text-muted-foreground mt-1">
            {client.phone ?? "—"} · ID {client.national_id ?? "—"} · {client.group?.name ?? "Individual"} · Member since {shortDate(client.joined_on)}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => modals.openRepay({ loanId: active?.id })} className="border border-border-strong px-3.5 py-2 rounded-[9px] text-[12.5px] font-medium hover:border-input">Record repayment</button>
          <Link to="/loans/new" className="bg-primary text-primary-foreground px-3.5 py-2 rounded-[9px] text-[12.5px] font-semibold hover:bg-primary-hover">New loan</Link>
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-3.5">
        <Card><div className="text-[11.5px] text-muted-foreground">Outstanding</div><div className="font-mono text-xl font-semibold mt-2">{money(stats.outstanding)}</div></Card>
        <Card><div className="text-[11.5px] text-muted-foreground">Savings</div><div className="font-mono text-xl font-semibold mt-2">{money(stats.savings)}</div></Card>
        <Card><div className="text-[11.5px] text-muted-foreground">Active loans</div><div className="font-mono text-xl font-semibold mt-2 text-primary">{stats.activeLoans}</div></Card>
        <Card><div className="text-[11.5px] text-muted-foreground">On-time rate</div><div className="font-mono text-xl font-semibold mt-2 text-primary">{stats.onTimeRate}%</div></Card>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <Card>
          {active ? (
            <>
              <CardTitle subtitle={`${money(active.principal)} · ${active.term_months} months · ${active.frequency}`}>
                Active loan · {active.product?.name}
              </CardTitle>
              <div className="h-2 bg-muted rounded-md overflow-hidden mb-2">
                <div className="h-full rounded-md bg-primary" style={{ width: `${active.principal > 0 ? (active.repaid / Number(active.principal)) * 100 : 0}%` }} />
              </div>
              <div className="flex justify-between text-[11.5px] text-muted-foreground mb-4">
                <span>{money(active.repaid)} repaid</span><span>{money(active.outstanding)} outstanding</span>
              </div>
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-2">Repayment schedule</div>
              {active.schedule.slice(0, 8).map((i: any) => {
                const paid = i.state === "paid";
                const due = i.state === "due" || i.state === "overdue" || i.state === "partial";
                return (
                  <div key={i.seq} className="flex items-center gap-3 py-2 border-t border-row-divider text-[12.5px]">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] flex-none font-semibold"
                         style={{ background: paid ? "var(--status-active-bg)" : due ? "var(--status-pending-bg)" : "var(--muted)", color: paid ? "var(--status-active-fg)" : due ? "var(--status-pending-fg)" : "var(--faint)" }}>
                      {paid ? "✓" : due ? "!" : i.seq}
                    </div>
                    <div className="flex-1">Installment {i.seq} · {shortDate(i.due_date)}</div>
                    <div className="font-mono text-secondary-foreground">{money(Number(i.principal_due) + Number(i.interest_due))}</div>
                    <div className="w-16 text-right text-[10.5px] font-semibold capitalize" style={{ color: paid ? "var(--primary)" : due ? "var(--status-pending-fg)" : "var(--faint)" }}>
                      {i.state}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <CardTitle>No active loan</CardTitle>
              <div className="text-sm text-muted-foreground">This member has no disbursed loans. Start an application via <Link to="/loans/new" className="text-primary">New loan</Link>.</div>
            </>
          )}
        </Card>

        <Card>
          <CardTitle>Activity</CardTitle>
          <div className="relative pl-5">
            <div className="absolute left-1 top-1 bottom-1 w-0.5 bg-border" />
            {repayments.length === 0 && <div className="text-sm text-muted-foreground">No repayments yet.</div>}
            {repayments.map((r: any) => (
              <div key={r.id} className="relative pb-4">
                <div className="absolute -left-5 top-0.5 w-2.5 h-2.5 rounded-full bg-card border-2 border-primary" />
                <div className="text-[12.5px] font-medium">Repayment {money(r.amount)} · {r.channel}</div>
                <div className="text-[11px] text-faint mt-0.5">{relTime(r.received_at)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
