import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Building2, AlertTriangle, Calendar, TrendingUp, FileText, Receipt, Activity, ShieldCheck, ClipboardList } from "lucide-react";
import { getLoan } from "@/lib/mzizi.functions";
import { getLoanApplication } from "@/lib/loan-application.functions";
import { Card } from "@/components/mzizi/Card";
import { StatusBadge } from "@/components/mzizi/Badge";
import { Avatar } from "@/components/mzizi/Avatar";
import { LoanLifecycleActions } from "@/components/mzizi/LoanLifecycleActions";
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

type TabKey = "overview" | "schedule" | "repayments" | "charges" | "accruals" | "approvals" | "application";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "overview", label: "Overview", icon: FileText },
  { key: "schedule", label: "Schedule", icon: Calendar },
  { key: "repayments", label: "Repayments", icon: Receipt },
  { key: "charges", label: "Charges", icon: TrendingUp },
  { key: "accruals", label: "Accruals", icon: Activity },
  { key: "approvals", label: "Approvals", icon: ShieldCheck },
  { key: "application", label: "Application", icon: ClipboardList },
];


function LoanDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getLoan);
  const { data, isLoading } = useQuery({ queryKey: ["loan", id], queryFn: () => fn({ data: { id } }) });
  const [tab, setTab] = useState<TabKey>("overview");

  if (isLoading || !data) return <div className="text-sm text-faint py-10 text-center">Loading…</div>;
  const d = data as any;
  const { loan, schedule, repayments, outstanding, appliedCharges, accruals, approvals, arrears, nextDue, totals } = d;

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
            {arrears.count > 0 && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded border bg-rose-500/10 text-rose-700 border-rose-500/30">
                <AlertTriangle size={11} /> {arrears.count} in arrears
              </span>
            )}
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

      <LoanLifecycleActions loan={loan} schedule={schedule} />

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] border-b-2 -mb-px whitespace-nowrap",
                active ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
              )}>
              <Icon size={13} /> {t.label}
              {t.key === "approvals" && approvals?.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-faint">{approvals.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <Overview loan={loan} outstanding={outstanding} arrears={arrears} nextDue={nextDue} totals={totals} />
      )}
      {tab === "schedule" && <ScheduleTab schedule={schedule} />}
      {tab === "repayments" && <RepaymentsTab repayments={repayments} total={totals.repaid} />}
      {tab === "charges" && <ChargesTab charges={appliedCharges} total={totals.charges} />}
      {tab === "accruals" && <AccrualsTab accruals={accruals} total={totals.accrued} />}
      {tab === "approvals" && <ApprovalsTab approvals={approvals} />}
      {tab === "application" && <ApplicationTab applicationId={loan.application_id} applicationNo={loan.application_no} />}
    </div>
  );
}

function ApplicationTab({ applicationId, applicationNo }: { applicationId?: string | null; applicationNo?: string | null }) {
  const fn = useServerFn(getLoanApplication);
  const enabled = !!applicationId;
  const { data, isLoading } = useQuery({
    queryKey: ["loan-application", applicationId],
    queryFn: () => fn({ data: { id: applicationId! } }),
    enabled,
  });
  if (!enabled) {
    return <Card><div className="text-center text-faint text-sm py-4">No origination record linked to this loan.</div></Card>;
  }
  if (isLoading || !data) return <Card><div className="text-sm text-faint py-4 text-center">Loading application…</div></Card>;
  const m: any = data.master;
  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Application <span className="font-mono">{applicationNo ?? m?.application_no}</span></div>
          <StatusBadge status={m?.status ?? "—"} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12.5px]">
          <Row k="Requested principal" v={money(Number(m?.requested_principal ?? 0))} />
          <Row k="Requested tenor" v={`${m?.requested_tenor_months ?? 0} months`} />
          <Row k="Requested rate" v={m?.requested_rate_pct != null ? `${m.requested_rate_pct}%` : "—"} />
          <Row k="Frequency" v={m?.frequency ?? "—"} />
          <Row k="Submitted" v={m?.submitted_at ? shortDate(m.submitted_at) : "—"} />
          <Row k="Decided" v={m?.decided_at ? shortDate(m.decided_at) : "—"} />
          <Row k="Disbursed" v={m?.disbursed_at ? shortDate(m.disbursed_at) : "—"} />
          <Row k="Channel" v={m?.channel ?? "—"} />
        </div>
        {m?.purpose && <div className="mt-3 text-[12.5px]"><span className="text-faint">Purpose:</span> {m.purpose}</div>}
      </Card>
      {data.collateral?.length > 0 && (
        <Card>
          <div className="text-sm font-semibold mb-2">Securities ({data.collateral.length})</div>
          <ul className="text-[12.5px] space-y-1">
            {data.collateral.map((c: any) => (
              <li key={c.id} className="border-b border-border/50 pb-1">
                <span className="font-medium">{c.security_type?.name ?? "—"}</span>
                {c.notes && <span className="text-faint"> · {c.notes}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {data.status_history?.length > 0 && (
        <Card>
          <div className="text-sm font-semibold mb-2">Status history</div>
          <ul className="text-[12.5px] space-y-1">
            {data.status_history.map((h: any) => (
              <li key={h.id} className="flex items-center justify-between border-b border-border/50 pb-1">
                <span>{h.from_status ?? "—"} → <span className="font-medium">{h.to_status}</span>{h.reason ? ` · ${h.reason}` : ""}</span>
                <span className="text-faint">{shortDate(h.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}


function Overview({ loan, outstanding, arrears, nextDue, totals }: any) {
  return (
    <div className="space-y-5">
      {/* Arrears */}
      <Card padded={false}>
        <div className={cn("px-5 py-3 border-b border-border flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold",
          arrears.count > 0 ? "text-rose-700 bg-rose-500/5" : "text-faint")}>
          <AlertTriangle size={13} /> Arrears
        </div>
        <div className="p-5">
          {arrears.count === 0 ? (
            <div className="text-[13px] text-emerald-700">No overdue installments. Loan is current.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StatBox label="Overdue installments" value={String(arrears.count)} tone="danger" />
              <StatBox label="Days past due" value={String(arrears.days_past_due)} tone="danger" />
              <StatBox label="Principal in arrears" value={money(arrears.principal)} />
              <StatBox label="Interest in arrears" value={money(arrears.interest)} />
              <div className="col-span-2 border-t border-border pt-3 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">Total arrears</span>
                <span className="font-mono text-lg font-semibold text-rose-700">{money(arrears.total)}</span>
              </div>
              {arrears.oldest_due_date && (
                <div className="col-span-2 text-[11.5px] text-faint">Oldest overdue: {shortDate(arrears.oldest_due_date)}</div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Loan info + Timeline */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold mb-2">Loan information</div>
          <Row k="Product" v={loan.product?.name ?? "—"} />
          <Row k="Interest method" v={loan.product?.interest_method ?? "—"} />
          <Row k="Frequency" v={loan.frequency} />
          <Row k="Term" v={`${loan.term_months} months`} />
          <Row k="Rate" v={`${Number(loan.annual_rate_pct).toFixed(2)}% p.a.`} />
          <Row k="Branch" v={loan.branch?.name ?? "—"} />
        </Card>
        <Card>
          <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold mb-2">Timeline</div>
          <Row k="Created" v={loan.created_at ? shortDate(loan.created_at) : "—"} />
          <Row k="Submitted" v={loan.submitted_at ? shortDate(loan.submitted_at) : "—"} />
          <Row k="Disbursed" v={loan.disbursed_at ? shortDate(loan.disbursed_at) : "—"} />
          <div className="border-t border-border mt-2 pt-2">
            <Row k="Total repaid" v={money(totals.repaid)} />
            <Row k="Total charges" v={money(totals.charges)} />
            <Row k="Total accrued" v={money(totals.accrued)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function ScheduleTab({ schedule }: any) {
  return (
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
  );
}

function RepaymentsTab({ repayments, total }: any) {
  return (
    <Card padded={false}>
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">Repayments</div>
        <div className="text-[12px] text-faint">Total: <span className="font-mono font-semibold text-foreground">{money(total)}</span></div>
      </div>
      {repayments.length === 0 ? (
        <div className="text-center text-faint text-sm py-6">No repayments received.</div>
      ) : repayments.map((r: any) => (
        <div key={r.id} className="flex items-center justify-between px-5 py-2.5 border-b border-row-divider last:border-b-0 text-[12.5px]">
          <div>
            <div>{shortDate(r.received_at)}</div>
            <div className="text-[11px] text-faint">{r.channel ?? "—"}{r.reference ? ` · ${r.reference}` : ""}</div>
          </div>
          <div className="font-mono font-semibold">{money(Number(r.amount))}</div>
        </div>
      ))}
    </Card>
  );
}

function ChargesTab({ charges, total }: any) {
  return (
    <Card padded={false}>
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">Applied charges</div>
        <div className="text-[12px] text-faint">Total: <span className="font-mono font-semibold text-foreground">{money(total)}</span></div>
      </div>
      {charges.length === 0 ? (
        <div className="text-center text-faint text-sm py-6">No charges applied.</div>
      ) : charges.map((c: any) => (
        <div key={c.id} className="flex items-center justify-between px-5 py-2.5 border-b border-row-divider last:border-b-0 text-[12.5px]">
          <div>
            <div className="font-medium">{c.charge?.name ?? "Charge"}</div>
            <div className="text-[11px] text-faint capitalize">{c.charge?.charge_type ?? "—"} · {c.created_at ? shortDate(c.created_at) : ""}</div>
          </div>
          <div className="font-mono font-semibold">{money(Number(c.amount))}</div>
        </div>
      ))}
    </Card>
  );
}

function AccrualsTab({ accruals, total }: any) {
  return (
    <Card padded={false}>
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">Daily interest accruals</div>
        <div className="text-[12px] text-faint">Total: <span className="font-mono font-semibold text-foreground">{money(total)}</span></div>
      </div>
      {accruals.length === 0 ? (
        <div className="text-center text-faint text-sm py-6">No accruals recorded.</div>
      ) : accruals.map((a: any, i: number) => (
        <div key={i} className="flex items-center justify-between px-5 py-2 border-b border-row-divider last:border-b-0 text-[12.5px]">
          <div>{shortDate(a.accrual_date)}</div>
          <div className="font-mono">{money(Number(a.daily_amount))}</div>
        </div>
      ))}
    </Card>
  );
}

function ApprovalsTab({ approvals }: any) {
  if (!approvals || approvals.length === 0) {
    return <Card><div className="text-center text-faint text-sm py-4">No approval workflows linked to this loan.</div></Card>;
  }
  return (
    <div className="space-y-3">
      {approvals.map((inst: any) => {
        const steps = (inst.workflow?.steps ?? []).slice().sort((a: any, b: any) => a.step_order - b.step_order);
        const actionsByStep: Record<number, any[]> = {};
        for (const a of inst.actions ?? []) {
          (actionsByStep[a.step_order] ??= []).push(a);
        }
        return (
          <Card key={inst.id} padded={false}>
            <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[13px] font-semibold">{inst.workflow?.name ?? inst.transaction_type}</div>
                <div className="text-[11px] text-faint">{inst.reference_label} · Initiated {shortDate(inst.initiated_at)}</div>
              </div>
              <StatusBadge status={inst.status} />
            </div>
            <div className="p-5 space-y-2">
              {steps.map((step: any) => {
                const acts = actionsByStep[step.step_order] ?? [];
                const approvedCount = acts.filter((a) => a.decision === "approve").length;
                const isCurrent = inst.status === "pending" && inst.current_step === step.step_order;
                const isPast = inst.current_step > step.step_order || inst.status === "approved";
                const isDeclined = acts.some((a) => a.decision === "decline");
                return (
                  <div key={step.step_order} className={cn(
                    "border rounded-lg p-3",
                    isDeclined ? "border-rose-500/40 bg-rose-500/5" :
                    isCurrent ? "border-primary/50 bg-primary/5" :
                    isPast ? "border-emerald-500/30 bg-emerald-500/5" :
                    "border-border",
                  )}>
                    <div className="flex items-center justify-between text-[12.5px]">
                      <div className="flex items-center gap-2">
                        <span className={cn("font-mono text-[11px] px-1.5 py-0.5 rounded",
                          isDeclined ? "bg-rose-500/20 text-rose-700" :
                          isPast ? "bg-emerald-500/20 text-emerald-700" :
                          isCurrent ? "bg-primary/20 text-primary" : "bg-secondary text-faint")}>
                          #{step.step_order}
                        </span>
                        <span className="font-semibold">{step.name}</span>
                        <span className="text-[11px] text-faint">
                          · {step.approver_kind === "role" ? step.role : step.approver_kind}
                        </span>
                      </div>
                      <div className="text-[11px] text-faint">
                        {approvedCount}/{step.required_approvals ?? 1} approvals
                      </div>
                    </div>
                    {acts.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2">
                        {acts.map((a) => (
                          <div key={a.id} className="flex items-start justify-between text-[11.5px]">
                            <div>
                              <span className={cn("font-semibold capitalize",
                                a.decision === "approve" ? "text-emerald-700" : "text-rose-700")}>
                                {a.decision}d
                              </span>
                              {a.comment && <span className="text-faint"> — {a.comment}</span>}
                            </div>
                            <div className="text-faint font-mono">{shortDate(a.acted_at)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {inst.completed_at && (
                <div className="text-[11px] text-faint pt-1">Completed {shortDate(inst.completed_at)}</div>
              )}
            </div>
          </Card>
        );
      })}
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

function StatBox({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className={cn("text-base font-mono font-semibold mt-1", tone === "danger" && "text-rose-700")}>{value}</div>
    </div>
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
