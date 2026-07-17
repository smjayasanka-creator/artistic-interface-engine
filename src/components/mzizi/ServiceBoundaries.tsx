import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Badge } from "@/components/mzizi/Badge";
import {
  Landmark, PiggyBank, CircleDollarSign, GitBranch, Plug,
  ShieldCheck, BookOpen, Users, ArrowRight, Package, Database, Radio, Mail,
} from "lucide-react";

type Domain = {
  id: string;
  label: string;
  tag: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  summary: string;
  ownedTables: string[];
  serverFns: string[];
  publicApi: string[];
  publishesEvents: string[];
  consumesEvents: string[];
  dependsOn: string[]; // other domain ids it must call synchronously
  extractionReadiness: "ready" | "partial" | "coupled";
  extractionNotes: string;
  accent: string;
};

const DOMAINS: Domain[] = [
  {
    id: "loans",
    label: "Loans",
    tag: "credit facilities",
    icon: Landmark,
    summary:
      "Origination (with draft save), disbursement, repayment, restructure, termination, write-off and legal action. Owns loan charges (fixed / variable / manual, capitalizable, inside/outside supplier), ALCO rate overrides, debit notes, and attached securities with document uploads + AI auto-fill.",
    ownedTables: [
      "loan", "loan_product", "loan_installment", "loan_installment_reclass",
      "repayment", "lending_group",
      "loan_charge", "loan_charge_product", "loan_applied_charge",
      "loan_alco_rate", "loan_security", "security_type",
    ],
    serverFns: [
      "src/lib/mzizi.functions.ts (loan.*)",
      "src/lib/loan-charges.functions.ts",
      "src/lib/loan-alco.functions.ts",
      "src/lib/security.functions.ts",
      "src/lib/security-ai.functions.ts",
    ],
    publicApi: [],
    publishesEvents: [
      "loan.drafted", "loan.submitted", "loan.disbursed", "loan.repaid",
      "loan.restructured", "loan.written_off", "loan.transferred_to_legal",
      "loan.charge_capitalized", "loan.security_attached", "loan.debit_note_issued",
    ],
    consumesEvents: ["client.kyc_verified", "workflow.approved", "alco.loan_rate_changed"],
    dependsOn: ["ledger", "workflow", "clients"],
    extractionReadiness: "partial",
    extractionNotes:
      "Ledger writes are transactional today, and the capitalized-charge reclass runs inside the accrual RPC. Extract only after ledger kernel + outbox pattern is in place. Security AI extraction already calls out to Lovable AI Gateway, so that side is decoupled.",
    accent: "from-indigo-500/10 to-indigo-500/0 border-indigo-500/30",
  },
  {
    id: "savings",
    label: "Savings",
    tag: "current & savings accounts",
    icon: PiggyBank,
    summary:
      "Opens, closes and transacts on ordinary savings accounts — deposits, withdrawals, passbook stock and issue.",
    ownedTables: [
      "savings_account", "savings_product", "savings_transaction",
      "passbook_stock", "passbook_issue", "savings_number_seq",
    ],
    serverFns: ["src/lib/savings.functions.ts"],
    publicApi: [],
    publishesEvents: [
      "savings.account_opened", "savings.deposited",
      "savings.withdrawn", "savings.closed",
    ],
    consumesEvents: ["client.kyc_verified", "alco.savings_rate_changed"],
    dependsOn: ["ledger", "clients"],
    extractionReadiness: "ready",
    extractionNotes:
      "Cleanest boundary — schema already isolated, no shared writes outside the ledger.",
    accent: "from-emerald-500/10 to-emerald-500/0 border-emerald-500/30",
  },
  {
    id: "fd",
    label: "Fixed Deposit",
    tag: "term deposits",
    icon: CircleDollarSign,
    summary:
      "Term deposit lifecycle: booking, interest schedule, daily accrual, payout, maturity, renewal and premature closure.",
    ownedTables: [
      "fixed_deposit", "fd_product", "fd_rate_tier",
      "fd_interest_schedule", "fd_accrual", "fd_transaction",
      "fd_nominee", "fd_number_seq",
    ],
    serverFns: ["src/lib/fd.functions.ts"],
    publicApi: [],
    publishesEvents: [
      "fd.booked", "fd.interest_accrued", "fd.interest_paid",
      "fd.matured", "fd.renewed", "fd.premature_closed",
    ],
    consumesEvents: ["client.kyc_verified", "alco.fd_rate_changed"],
    dependsOn: ["ledger", "clients"],
    extractionReadiness: "ready",
    extractionNotes:
      "Accrual is idempotent per (deposit, date) — perfect candidate for an isolated worker.",
    accent: "from-amber-500/10 to-amber-500/0 border-amber-500/30",
  },
  {
    id: "workflow",
    label: "Workflow",
    tag: "maker · checker",
    icon: GitBranch,
    summary:
      "Approval routing for sensitive mutations across every domain. Rule-driven, records approvers and timestamps.",
    ownedTables: [
      "workflow_definition", "workflow_instance",
      "workflow_step", "workflow_action", "delegation_authority",
    ],
    serverFns: ["src/lib/workflow.functions.ts"],
    publicApi: [],
    publishesEvents: [
      "workflow.submitted", "workflow.approved",
      "workflow.rejected", "workflow.escalated",
    ],
    consumesEvents: [
      "loan.origination_requested", "fd.closure_requested",
      "alco.rate_change_proposed",
    ],
    dependsOn: ["auth"],
    extractionReadiness: "ready",
    extractionNotes:
      "Already event-shaped. Only inbound coupling is the has_role() gate — trivial to lift over a JWT.",
    accent: "from-violet-500/10 to-violet-500/0 border-violet-500/30",
  },
  {
    id: "api",
    label: "Public API",
    tag: "/api/public/v1/*",
    icon: Plug,
    summary:
      "External integration surface for partner banks (CEFT, ATM, IB) and credit bureau (CRIB).",
    ownedTables: ["api_key", "api_transaction_log"],
    serverFns: ["src/lib/api-console.functions.ts", "src/lib/api-auth.server.ts"],
    publicApi: [
      "/api/public/v1/atm/authorize",
      "/api/public/v1/ceft/transfer",
      "/api/public/v1/crib/report",
      "/api/public/v1/ib/transaction",
      "/api/public/v1/transactions/inbound",
      "/api/public/v1/transactions/outbound",
      "/api/public/v1/health",
    ],
    publishesEvents: [
      "api.inbound_txn_received", "api.outbound_txn_dispatched",
    ],
    consumesEvents: [],
    dependsOn: ["loans", "savings", "fd", "ledger"],
    extractionReadiness: "ready",
    extractionNotes:
      "Perfect first extraction — it's already the edge of the system. Move to a dedicated Worker + separate rate limits.",
    accent: "from-rose-500/10 to-rose-500/0 border-rose-500/30",
  },
  {
    id: "alco",
    label: "ALCO Rates",
    tag: "pricing committee",
    icon: ShieldCheck,
    summary:
      "Asset-Liability Committee rate proposals for deposit and lending products, approved via workflow.",
    ownedTables: [
      "alco_rate_proposal", "alco_rate_proposal_item",
    ],
    serverFns: ["src/lib/alco.functions.ts"],
    publicApi: [],
    publishesEvents: [
      "alco.rate_change_proposed", "alco.fd_rate_changed",
      "alco.savings_rate_changed", "alco.loan_rate_changed",
    ],
    consumesEvents: ["workflow.approved"],
    dependsOn: ["workflow", "fd", "savings", "loans"],
    extractionReadiness: "ready",
    extractionNotes:
      "Low volume, high impact. Extract once event bus is live so downstream products can subscribe cleanly.",
    accent: "from-sky-500/10 to-sky-500/0 border-sky-500/30",
  },
  {
    id: "ledger",
    label: "Ledger (kernel)",
    tag: "double-entry GL",
    icon: BookOpen,
    summary:
      "Shared kernel. Every money-moving domain posts through post_entry(). Immutable, balanced, append-only.",
    ownedTables: ["gl_account", "journal_entry", "posting"],
    serverFns: ["(central post_entry RPC — planned)"],
    publicApi: [],
    publishesEvents: ["ledger.entry_posted"],
    consumesEvents: [],
    dependsOn: [],
    extractionReadiness: "coupled",
    extractionNotes:
      "Do NOT extract. Ledger is the shared kernel — colocated with Postgres for ACID balance guarantees.",
    accent: "from-slate-500/10 to-slate-500/0 border-slate-500/30",
  },
  {
    id: "clients",
    label: "Clients & Staff",
    tag: "party master",
    icon: Users,
    summary:
      "Customer master, KYC, staff, branches, company. Cross-cutting party data every domain reads.",
    ownedTables: [
      "client", "client_bank_account", "staff",
      "branch", "company", "company_invite", "user_roles",
    ],
    serverFns: ["src/lib/mzizi.functions.ts (client.*, staff.*)"],
    publicApi: [],
    publishesEvents: [
      "client.created", "client.kyc_verified", "client.bank_account_added",
    ],
    consumesEvents: [],
    dependsOn: ["auth"],
    extractionReadiness: "partial",
    extractionNotes:
      "Read-heavy from every domain — needs a well-cached read replica or GraphQL federation before extraction.",
    accent: "from-teal-500/10 to-teal-500/0 border-teal-500/30",
  },
];

const READINESS_TONE: Record<Domain["extractionReadiness"], { label: string; cls: string }> = {
  ready:   { label: "Ready to extract",   cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  partial: { label: "Partial — plan work", cls: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  coupled: { label: "Keep colocated",      cls: "bg-slate-500/10 text-slate-700 border-slate-500/30" },
};

export function ServiceBoundaries() {
  const [selectedId, setSelectedId] = useState<string>("fd");
  const selected = useMemo(
    () => DOMAINS.find((d) => d.id === selectedId)!,
    [selectedId],
  );

  const dependents = useMemo(
    () => DOMAINS.filter((d) => d.dependsOn.includes(selected.id)),
    [selected],
  );

  const summary = useMemo(() => {
    return {
      total: DOMAINS.length,
      ready: DOMAINS.filter((d) => d.extractionReadiness === "ready").length,
      partial: DOMAINS.filter((d) => d.extractionReadiness === "partial").length,
      coupled: DOMAINS.filter((d) => d.extractionReadiness === "coupled").length,
      tables: DOMAINS.reduce((n, d) => n + d.ownedTables.length, 0),
      events: DOMAINS.reduce((n, d) => n + d.publishesEvents.length, 0),
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>Service boundaries</CardTitle>
            <p className="text-[12.5px] text-muted-foreground mt-1 max-w-3xl">
              How the modular monolith maps to future services. Each domain owns its tables, publishes
              its own events and declares which other domains it depends on. Click a domain to inspect
              its contract and see how easy it would be to extract.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Domains" value={summary.total} />
            <MiniStat label="Owned tables" value={summary.tables} />
            <MiniStat label="Event types" value={summary.events} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {DOMAINS.map((d) => {
            const Icon = d.icon;
            const isSel = d.id === selected.id;
            const readiness = READINESS_TONE[d.extractionReadiness];
            return (
              <button
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                className={cn(
                  "text-left rounded-xl border bg-gradient-to-b p-3 transition-all",
                  "hover:border-primary/50 hover:shadow-sm",
                  d.accent,
                  isSel && "ring-2 ring-primary/40 border-primary shadow-sm",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-md flex items-center justify-center flex-none",
                    isSel ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
                  )}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate">{d.label}</div>
                    <div className="text-[10.5px] text-muted-foreground truncate">{d.tag}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10.5px]">
                  <span className="text-muted-foreground">
                    {d.ownedTables.length} tables · {d.publishesEvents.length} events
                  </span>
                  <span className={cn("px-1.5 py-0.5 rounded-full border font-semibold", readiness.cls)}>
                    {readiness.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <selected.icon size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>{selected.label} service</CardTitle>
                <span className={cn(
                  "text-[10.5px] font-semibold px-2 py-0.5 rounded-full border",
                  READINESS_TONE[selected.extractionReadiness].cls,
                )}>
                  {READINESS_TONE[selected.extractionReadiness].label}
                </span>
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">{selected.tag}</div>
            </div>
          </div>
          <p className="text-[13px] text-foreground/90 mt-3">{selected.summary}</p>

          <Section title="Owned tables" icon={Database}>
            <div className="flex flex-wrap gap-1.5">
              {selected.ownedTables.map((t) => (
                <code key={t} className="text-[11.5px] px-2 py-1 rounded-md bg-muted font-mono">{t}</code>
              ))}
            </div>
          </Section>

          <Section title="Server functions" icon={Package}>
            <div className="flex flex-wrap gap-1.5">
              {selected.serverFns.map((f) => (
                <code key={f} className="text-[11.5px] px-2 py-1 rounded-md bg-muted font-mono">{f}</code>
              ))}
            </div>
          </Section>

          {selected.publicApi.length > 0 && (
            <Section title="Public HTTP endpoints" icon={Radio}>
              <div className="flex flex-col gap-1">
                {selected.publicApi.map((p) => (
                  <code key={p} className="text-[11.5px] px-2 py-1 rounded-md bg-muted font-mono">{p}</code>
                ))}
              </div>
            </Section>
          )}

          <Section title="Extraction notes" icon={ArrowRight}>
            <p className="text-[12.5px] text-foreground/85">{selected.extractionNotes}</p>
          </Section>
        </Card>

        <Card>
          <CardTitle>Event contract</CardTitle>
          <EventList title="Publishes" items={selected.publishesEvents} tone="publish" />
          <EventList title="Consumes" items={selected.consumesEvents} tone="consume" />

          <div className="mt-4 pt-3 border-t border-border">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Depends on (sync)
            </div>
            <DomainChips ids={selected.dependsOn} onSelect={setSelectedId} empty="No sync dependencies — fully autonomous." />
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Depended on by
            </div>
            <DomainChips
              ids={dependents.map((d) => d.id)}
              onSelect={setSelectedId}
              empty="Nothing depends on this domain synchronously."
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>Extraction roadmap</CardTitle>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Recommended order if you decide to split. Each step is independently valuable and reversible.
        </p>
        <ol className="mt-3 space-y-2">
          {[
            ["1", "Ledger kernel RPC", "Centralize every GL write through public.post_entry(). No physical split — just a contract."],
            ["2", "Outbox tables per domain", "Every state change writes a domain_event row in the same transaction. Log-only initially."],
            ["3", "Extract Public API", "Move /api/public/v1/* to its own Worker with dedicated rate limits + observability."],
            ["4", "Extract Workflow", "Deploy independently; connect to core via outbox + REST. First true service split."],
            ["5", "Extract FD", "Highest-value isolated domain (heavy accrual jobs). Split its schema + accrual worker."],
            ["6", "Extract Savings, then Loans", "Once event bus is proven. Loans last because of ledger coupling."],
          ].map(([step, title, note]) => (
            <li key={step} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-[12px] flex-none">
                {step}
              </div>
              <div>
                <div className="text-[13px] font-semibold">{title}</div>
                <div className="text-[12px] text-muted-foreground">{note}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-1.5 min-w-[90px]">
      <div className="text-[16px] font-semibold font-mono">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({
  title, icon: Icon, children,
}: { title: string; icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        <Icon size={12} />
        {title}
      </div>
      {children}
    </div>
  );
}

function EventList({ title, items, tone }: { title: string; items: string[]; tone: "publish" | "consume" }) {
  return (
    <div className="mt-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{title}</div>
      {items.length === 0 ? (
        <div className="text-[12px] text-muted-foreground italic">None</div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((e) => (
            <div
              key={e}
              className={cn(
                "text-[11.5px] font-mono px-2 py-1 rounded-md border flex items-center gap-2",
                tone === "publish"
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
                  : "border-sky-500/30 bg-sky-500/5 text-sky-800 dark:text-sky-300",
              )}
            >
              <ArrowRight size={11} className={tone === "publish" ? "" : "rotate-180"} />
              {e}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DomainChips({ ids, onSelect, empty }: { ids: string[]; onSelect: (id: string) => void; empty: string }) {
  if (ids.length === 0) return <div className="text-[12px] text-muted-foreground italic">{empty}</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const d = DOMAINS.find((x) => x.id === id);
        if (!d) return <Badge key={id} tone="neutral">{id}</Badge>;
        const Icon = d.icon;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11.5px] hover:border-primary/50 hover:bg-primary/[0.03]"
          >
            <Icon size={12} />
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
