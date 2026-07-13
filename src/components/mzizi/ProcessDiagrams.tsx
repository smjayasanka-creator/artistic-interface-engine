import { useEffect, useRef, useState } from "react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { cn } from "@/lib/utils";

type Proc = {
  id: string;
  title: string;
  summary: string;
  validations: string[];
  diagram: string;
};

const PROCESSES: Proc[] = [
  {
    id: "fd-lifecycle",
    title: "Fixed Deposit Lifecycle",
    summary:
      "From booking to maturity or premature closure. Handles rate cap enforcement, schedule generation, daily accrual and renewal.",
    validations: [
      "Principal ≥ product minimum; rate ≤ product maximum (and ≤ CBSL cap).",
      "Value date ≤ today; maturity = value_date + tenure_months.",
      "Payout option (monthly/quarterly/at_maturity) drives fd_interest_schedule rows.",
      "Approval required before certificate becomes active (workflow: fd_open).",
      "Premature closure applies penalty band from product config.",
      "Renewal at maturity re-runs buildSchedule() so cron continues to pay interest.",
    ],
    diagram: `flowchart TD
  A[New Deposit Form] --> V1{Validate principal,<br/>rate ≤ max,<br/>tenure}
  V1 -- fail --> X1[Reject with reason]
  V1 -- ok --> B[Create fd_transaction<br/>type = booking<br/>status = pending]
  B --> W[Route to workflow<br/>fd_open approval]
  W -- declined --> X2[Void certificate]
  W -- approved --> C[Activate FD<br/>status = active]
  C --> S[buildSchedule → insert<br/>fd_interest_schedule rows]
  S --> D{Daily cron<br/>fd-accrue}
  D -- due today --> P[Post interest payout<br/>credit savings / capitalize]
  D -- not due --> D
  P --> M{Maturity date<br/>reached?}
  M -- no --> D
  M -- yes --> N{Auto-renew?}
  N -- yes --> R[Create renewed FD<br/>fd_transaction type = renewal<br/>buildSchedule again]
  R --> D
  N -- no --> E[Mark matured,<br/>payout principal + accrued]
  C -.premature.-> PC{Premature<br/>close request}
  PC --> PV{Penalty applies?}
  PV -- yes --> PP[Reduce rate,<br/>recompute payout]
  PV -- no --> PO[Payout at book rate]
  PP --> Z[status = prematurely_closed]
  PO --> Z`,
  },
  {
    id: "savings-lifecycle",
    title: "Savings Account Lifecycle",
    summary:
      "Open account with opening deposit, transact via passbook, close with balance payout.",
    validations: [
      "Opening deposit ≥ product minimum balance.",
      "Passbook serial must be issued from active branch stock.",
      "Withdrawals blocked if balance would fall below minimum + lien.",
      "Close requires zero pending fees and manager approval.",
    ],
    diagram: `flowchart TD
  A[New Savings Form] --> V1{KYC valid?<br/>Opening ≥ min?}
  V1 -- no --> X1[Block submit]
  V1 -- yes --> B[Create savings_account<br/>status = active]
  B --> P[Issue passbook<br/>from branch stock]
  P --> T{Transaction}
  T -- deposit --> TD[Post credit,<br/>update balance]
  T -- withdraw --> V2{Balance − amount<br/>≥ min + lien?}
  V2 -- no --> X2[Reject]
  V2 -- yes --> TW[Post debit]
  TD --> T
  TW --> T
  T -- close --> C{Pending fees?}
  C -- yes --> X3[Settle fees first]
  C -- no --> CA[Payout balance,<br/>status = closed]`,
  },
  {
    id: "alco-workflow",
    title: "ALCO Rate Change Workflow",
    summary:
      "Treasury proposes new deposit product rates; workflow engine routes for approval before rates take effect.",
    validations: [
      "standard_rate ≤ maximum_rate ≤ cbsl_max_rate for every row.",
      "Only changed rows submitted (diff against current).",
      "Proposal must be approved via alco_rate_change workflow before Apply is enabled.",
      "Apply is idempotent — writes new rates and marks proposal applied.",
    ],
    diagram: `flowchart TD
  A[Edit rate drafts] --> D{Any row changed?}
  D -- no --> X1[Submit disabled]
  D -- yes --> V{std ≤ max ≤ cbsl<br/>for each row?}
  V -- fail --> X2[Show validation error]
  V -- ok --> S[Create alco_proposal<br/>status = pending]
  S --> W[Start workflow<br/>alco_rate_change]
  W -- declined --> X3[Proposal cancelled]
  W -- approved --> R{User clicks Apply}
  R --> U[Update fd_product rates,<br/>proposal.status = applied]
  U --> N[Notify subscribers via<br/>domain event dispatcher]`,
  },
  {
    id: "cron-jobs",
    title: "Daily Cron Jobs",
    summary:
      "pg_cron triggers /api/public/hooks/* endpoints to accrue interest, mature deposits and dispatch queued domain events.",
    validations: [
      "Each endpoint verifies HMAC signature before processing.",
      "Idempotency key stored per run — replaying the same day is safe.",
      "Failed rows moved to dead-letter with reason; success rows marked processed_at.",
    ],
    diagram: `flowchart TD
  C[pg_cron scheduler] --> H1[POST /hooks/fd-accrue]
  C --> H2[POST /hooks/fd-mature]
  C --> H3[POST /hooks/dispatch-domain-events]
  H1 --> S1{Signature valid?}
  H2 --> S2{Signature valid?}
  H3 --> S3{Signature valid?}
  S1 -- no --> X[401 Unauthorized]
  S2 -- no --> X
  S3 -- no --> X
  S1 -- yes --> A1[Select schedule rows<br/>due today AND unpaid]
  A1 --> A2[Post interest txn per row,<br/>mark paid_at]
  S2 -- yes --> M1[Select FDs where<br/>maturity_date ≤ today]
  M1 --> M2{Auto-renew?}
  M2 -- yes --> M3[Renew + buildSchedule]
  M2 -- no --> M4[Mature, payout]
  S3 -- yes --> E1[Pop queued events]
  E1 --> E2[Deliver to subscribers]
  E2 --> E3{Ack?}
  E3 -- no --> E4[Retry with backoff]
  E3 -- yes --> E5[Mark delivered]`,
  },
  {
    id: "loan-lifecycle",
    title: "Loan Lifecycle",
    summary:
      "Application → underwriting → disbursement → repayment schedule → closure or write-off.",
    validations: [
      "DTI and exposure limits checked at application.",
      "Collateral valuation required for secured products.",
      "Disbursement blocked until all workflow approvals resolved.",
      "Overdue > product grace triggers arrears classification.",
    ],
    diagram: `flowchart TD
  A[New Loan Form] --> V1{KYC + DTI +<br/>exposure ok?}
  V1 -- no --> X1[Reject]
  V1 -- yes --> U[Underwriting workflow]
  U -- declined --> X2[Application closed]
  U -- approved --> C{Secured product?}
  C -- yes --> CV[Register collateral]
  C -- no --> D
  CV --> D[Disburse funds,<br/>generate repayment schedule]
  D --> R{Installment due}
  R -- paid on time --> R
  R -- missed --> O{Past grace period?}
  O -- no --> R
  O -- yes --> AR[Classify arrears,<br/>accrue penalty]
  AR --> R
  R -- final paid --> CL[Close loan]
  AR -.uncollectible.-> WO[Write-off]`,
  },
];

export function ProcessDiagrams() {
  const [activeId, setActiveId] = useState<string>(PROCESSES[0].id);
  const active = PROCESSES.find((p) => p.id === activeId) ?? PROCESSES[0];

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <Card className="p-2 h-fit">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1.5">
          Processes
        </div>
        <div className="flex flex-col">
          {PROCESSES.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className={cn(
                "text-left px-2.5 py-2 rounded-md text-[13px] transition-colors",
                activeId === p.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted text-foreground/80",
              )}
            >
              {p.title}
            </button>
          ))}
        </div>
      </Card>

      <div className="flex flex-col gap-4 min-w-0">
        <Card>
          <CardTitle>{active.title}</CardTitle>
          <p className="text-[12.5px] text-muted-foreground mt-1">{active.summary}</p>
        </Card>

        <Card>
          <div className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Flow
          </div>
          <MermaidView code={active.diagram} id={active.id} />
        </Card>

        <Card>
          <div className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Logic, decisions & validations
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-[13px]">
            {active.validations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function MermaidView({ code, id }: { code: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const isDark = document.documentElement.classList.contains("dark");
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "loose",
          flowchart: { htmlLabels: true, curve: "basis" },
        });
        const { svg } = await mermaid.render(`m-${id}-${Date.now()}`, code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setErr(null);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to render diagram");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (err) {
    return (
      <div className="text-[12px] text-rose-600 font-mono whitespace-pre-wrap">{err}</div>
    );
  }
  return <div ref={ref} className="overflow-auto [&_svg]:max-w-full [&_svg]:h-auto" />;
}
