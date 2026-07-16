import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, User, Building2 } from "lucide-react";
import { getLoan } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { StatusBadge } from "@/components/mzizi/Badge";
import { Avatar } from "@/components/mzizi/Avatar";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/loans/$id")({
  component: LoanDetail,
  errorComponent: LoanError,
  notFoundComponent: LoanNotFound,
});

function LoanError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="max-w-lg mx-auto py-10 space-y-3">
      <p className="text-sm text-destructive">{error.message}</p>
      <button className="text-[12px] text-primary hover:underline"
        onClick={() => { reset(); router.invalidate(); }}>Retry</button>
    </div>
  );
}

function LoanNotFound() {
  return (
    <div className="max-w-lg mx-auto py-10 text-sm text-faint">
      Loan not found. <Link to="/loans" className="text-primary">Back to loans</Link>
    </div>
  );
}

function LoanDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getLoan);
  const { data, isLoading } = useQuery({ queryKey: ["loan", id], queryFn: () => fn({ data: { id } }) });

  if (isLoading || !data) return <div className="text-sm text-faint py-10 text-center">Loading…</div>;
  const { loan, schedule, repayments, outstanding, appliedCharges, accruals } = data as any;

  return (
    <div className="animate-fadein space-y-5">
      <Link to="/loans" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Back to Loans
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold">Loan · <span className="font-mono">{loan.id.slice(0, 8).toUpperCase()}</span></h1>
            <StatusBadge status={loan.status} />
          </div>
          <div className="text-[12.5px] text-muted-foreground flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><Building2 size={12} /> {loan.branch?.code ?? loan.branch?.name ?? "—"}</span>
            <span>· {loan.product?.name}</span>
            <span>· {loan.product?.interest_method} · {loan.frequency}</span>
          </div>
        </div>
        {loan.client && (
          <Link to="/clients/$id" params={{ id: loan.client.id }}
            className="inline-flex items-center gap-2 border border-border rounded-lg px-3 py-2 hover:border-primary text-[12.5px]">
            <Avatar name={loan.client.full_name} color={loan.client.avatar_color} size={28} />
            <div className="flex flex-col">
              <span className="font-semibold">{loan.client.full_name}</span>
              <span className="text-[11px] text-faint">{loan.client.phone ?? loan.client.national_id ?? "—"}</span>
            </div>
          </Link>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Principal" value={money(loan.principal)} />
        <Metric label="Outstanding" value={money(outstanding.outstanding_principal)} tone="primary" />
        <Metric label="Repaid" value={money(outstanding.principal_repaid)} />
        <Metric label="Rate · Term" value={`${Number(loan.annual_rate_pct).toFixed(2)}% · ${loan.term_months}m`} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold mb-2">Timeline</div>
          <Row k="Created" v={loan.created_at ? shortDate(loan.created_at) : "—"} />
          <Row k="Submitted" v={loan.submitted_at ? shortDate(loan.submitted_at) : "—"} />
          <Row k="Disbursed" v={loan.disbursed_at ? shortDate(loan.disbursed_at) : "—"} />
          
        </Card>
        <Card>
          <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold mb-2">Purpose</div>
          <div className="text-[12.5px] text-secondary-foreground whitespace-pre-wrap">{loan.purpose || "—"}</div>
        </Card>
        <Card>
          <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold mb-2">Initial charges</div>
          {appliedCharges.length === 0 ? (
            <div className="text-[12px] text-faint">None applied.</div>
          ) : appliedCharges.map((c: any) => (
            <Row key={c.id} k={c.charge?.name ?? "Charge"} v={money(Number(c.amount))} />
          ))}
        </Card>
      </div>

      <Card padded={false}>
        <div className="px-5 py-3 border-b border-border text-[11px] uppercase tracking-wider text-faint font-semibold">Repayment schedule</div>
        <div className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-2.5 px-5 border-b border-border bg-secondary/40"
             style={{ gridTemplateColumns: "60px 1fr 1fr 1fr 1fr 1fr 120px" }}>
          <div>#</div><div>Due</div><div className="text-right">Principal</div><div className="text-right">Interest</div>
          <div className="text-right">Paid P</div><div className="text-right">Paid I</div><div>State</div>
        </div>
        {schedule.length === 0 ? (
          <div className="text-center text-faint text-sm py-6">No schedule yet.</div>
        ) : schedule.map((s: any) => (
          <div key={s.seq} className="grid items-center text-[12.5px] py-2 px-5 border-b border-row-divider last:border-b-0"
               style={{ gridTemplateColumns: "60px 1fr 1fr 1fr 1fr 1fr 120px" }}>
            <div className="font-mono text-faint">{s.seq}</div>
            <div>{shortDate(s.due_date)}</div>
            <div className="text-right font-mono">{money(Number(s.principal_due))}</div>
            <div className="text-right font-mono">{money(Number(s.interest_due))}</div>
            <div className="text-right font-mono text-muted-foreground">{money(Number(s.principal_paid))}</div>
            <div className="text-right font-mono text-muted-foreground">{money(Number(s.interest_paid))}</div>
            <div><span className={cn("text-[10.5px] px-1.5 py-0.5 rounded border capitalize",
              s.state === "paid" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" :
              s.state === "overdue" ? "bg-rose-500/10 text-rose-700 border-rose-500/30" :
              s.state === "partial" ? "bg-amber-500/10 text-amber-700 border-amber-500/30" :
              "bg-muted text-faint border-border")}>{s.state}</span></div>
          </div>
        ))}
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card padded={false}>
          <div className="px-5 py-3 border-b border-border text-[11px] uppercase tracking-wider text-faint font-semibold">Repayments</div>
          {repayments.length === 0 ? (
            <div className="text-center text-faint text-sm py-6">No repayments received.</div>
          ) : repayments.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-2 border-b border-row-divider last:border-b-0 text-[12.5px]">
              <div>
                <div>{shortDate(r.received_at)}</div>
                <div className="text-[11px] text-faint">{r.channel ?? "—"}{r.reference ? ` · ${r.reference}` : ""}</div>
              </div>
              <div className="font-mono font-semibold">{money(Number(r.amount))}</div>
            </div>
          ))}
        </Card>
        <Card padded={false}>
          <div className="px-5 py-3 border-b border-border text-[11px] uppercase tracking-wider text-faint font-semibold">Daily interest accruals</div>
          {accruals.length === 0 ? (
            <div className="text-center text-faint text-sm py-6">No accruals recorded.</div>
          ) : accruals.map((a: any, i: number) => (
            <div key={i} className="flex items-center justify-between px-5 py-2 border-b border-row-divider last:border-b-0 text-[12.5px]">
              <div>{shortDate(a.accrual_date)}</div>
              <div className="font-mono">{money(Number(a.daily_amount))}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "primary" }) {
  return (
    <Card>
      <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className={cn("text-lg font-semibold font-mono mt-1", tone === "primary" && "text-primary")}>{value}</div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 text-[12.5px]">
      <span className="text-faint">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
