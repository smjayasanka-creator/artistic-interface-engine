import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import {
  User2,
  Wallet,
  PiggyBank,
  Landmark,
  ReceiptText,
  FileText,
  Phone,
  Mail,
  MapPin,
  IdCard,
  Calendar,
  ArrowUpRight,
  Copy,
  Download,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { getClient, updateClient } from "@/lib/mzizi.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/mzizi/Card";
import { Avatar } from "@/components/mzizi/Avatar";
import { StatusBadge } from "@/components/mzizi/Badge";
import { ClientSearchBar } from "@/components/mzizi/ClientSearchBar";
import { money, shortDate, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: Client360,
});

type TabKey = "overview" | "loans" | "savings" | "fd" | "transactions" | "documents" | "profile";

function Client360() {
  const { id } = Route.useParams();
  const fn = useServerFn(getClient);
  const { data, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: () => fn({ data: { id } }),
  });
  const [tab, setTab] = useState<TabKey>("overview");

  if (isLoading || !data) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-32 rounded-xl bg-muted/60" />
        <div className="h-10 rounded-md bg-muted/40" />
        <div className="h-64 rounded-xl bg-muted/40" />
      </div>
    );
  }

  const { client, active, stats, loans, repayments, savings, savingsTxns, fds, fdTxns, bankAccounts, documents } = data;

  const tabs: { key: TabKey; label: string; icon: any; count?: number }[] = [
    { key: "overview", label: "Overview", icon: User2 },
    { key: "loans", label: "Loans", icon: Wallet, count: loans.length },
    { key: "savings", label: "Savings", icon: PiggyBank, count: savings.length },
    { key: "fd", label: "Fixed Deposits", icon: Landmark, count: fds.length },
    { key: "transactions", label: "Transactions", icon: ReceiptText, count: repayments.length + savingsTxns.length + fdTxns.length },
    { key: "documents", label: "Documents", icon: FileText, count: documents.length },
    { key: "profile", label: "Profile", icon: IdCard },
  ];

  function copy(value: string, label: string) {
    navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied`));
  }

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <div className="w-full max-w-md">
        <ClientSearchBar />
      </div>

      <Link to="/clients" className="text-xs text-primary hover:underline w-fit">← Back to clients</Link>

      {/* Google-Material style header */}
      <Card padded={false} className="overflow-hidden">
        <div
          className="h-28 relative"
          style={{
            background: `linear-gradient(135deg, ${client.avatar_color ?? "#0f766e"} 0%, color-mix(in oklab, ${client.avatar_color ?? "#0f766e"} 60%, #0b1220) 100%)`,
          }}
        />
        <div className="px-6 pb-5 pt-3 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="-mt-16 relative z-10 ring-4 ring-card rounded-full bg-card shrink-0 w-fit">
            {client.photo_url ? (
              <img src={client.photo_url} alt={client.full_name} className="w-24 h-24 rounded-full object-cover" />
            ) : (
              <Avatar name={client.full_name} color={client.avatar_color} size={96} />
            )}
          </div>
          <div className="flex-1 min-w-0 sm:pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold truncate">{client.full_name}</h1>
              <StatusBadge status={client.status} />
              {client.is_introducer && (
                <span className="text-[10px] uppercase tracking-wider rounded-full bg-primary/10 text-primary px-2 py-0.5">
                  Introducer
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-[12px] text-muted-foreground mt-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => copy(client.id, "Customer code")}
                className="inline-flex items-center gap-1 font-mono hover:text-foreground"
                title="Copy customer code"
              >
                <Copy size={11} /> {client.id.slice(0, 8).toUpperCase()}
              </button>
              {client.national_id && (
                <span className="inline-flex items-center gap-1"><IdCard size={12} /> {client.national_id}</span>
              )}
              {client.phone && (
                <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Phone size={12} /> {client.phone}
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Mail size={12} /> {client.email}
                </a>
              )}
              <span className="inline-flex items-center gap-1"><Calendar size={12} /> Since {shortDate(client.joined_on)}</span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 sm:pt-1 flex-wrap">
            <button
              type="button"
              onClick={() => setTab("profile")}
              className="border border-border-strong px-3.5 py-2 rounded-full text-[12.5px] font-medium hover:border-input inline-flex items-center gap-1"
            >
              <Pencil size={12} /> Edit details
            </button>
            <Link to="/collections/new" search={{ loanId: active?.id }} className="border border-border-strong px-3.5 py-2 rounded-full text-[12.5px] font-medium hover:border-input">
              Record repayment
            </Link>
            <Link to="/loans/new" className="bg-primary text-primary-foreground px-3.5 py-2 rounded-full text-[12.5px] font-semibold hover:bg-primary-hover inline-flex items-center gap-1">
              New loan <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border-t border-border">
          <Kpi label="Outstanding loans" value={money(stats.outstanding)} sub={`${stats.activeLoans} active`} />
          <Kpi label="Savings balance" value={money(stats.savings)} sub={`${stats.activeSavings} account${stats.activeSavings === 1 ? "" : "s"}`} />
          <Kpi label="Fixed deposits" value={money(stats.fdBalance)} sub={`${stats.activeFds} active`} />
          <Kpi label="On-time rate" value={`${stats.onTimeRate}%`} sub="Loan repayments" />
        </div>
      </Card>

      {/* Material 3 tab bar */}
      <div className="border-b border-border overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 min-w-max">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2.5 text-[12.5px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-t-md",
                )}
              >
                <Icon size={14} />
                {t.label}
                {typeof t.count === "number" && (
                  <span
                    className={cn(
                      "text-[10px] rounded-full px-1.5 py-0.5 font-mono",
                      active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab panels */}
      {tab === "overview" && (
        <OverviewPanel active={active} repayments={repayments} savingsTxns={savingsTxns} fdTxns={fdTxns} />
      )}
      {tab === "loans" && <LoansPanel loans={loans} active={active} />}
      {tab === "savings" && <SavingsPanel savings={savings} savingsTxns={savingsTxns} />}
      {tab === "fd" && <FdPanel fds={fds} fdTxns={fdTxns} />}
      {tab === "transactions" && (
        <TransactionsPanel repayments={repayments} savingsTxns={savingsTxns} fdTxns={fdTxns} loans={loans} savings={savings} fds={fds} />
      )}
      {tab === "documents" && <DocumentsPanel documents={documents} clientId={client.id} />}
      {tab === "profile" && <ProfilePanel client={client} bankAccounts={bankAccounts} />}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className="font-mono text-lg font-semibold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">{children}</div>
      {right}
    </div>
  );
}

function OverviewPanel({ active, repayments, savingsTxns, fdTxns }: any) {
  const combined = useMemo(() => {
    const rows: { kind: string; when: string; label: string; amount: number }[] = [
      ...repayments.map((r: any) => ({ kind: "Loan repayment", when: r.received_at, label: r.channel ?? "—", amount: Number(r.amount) })),
      ...savingsTxns.map((s: any) => ({ kind: `Savings ${s.txn_type}`, when: s.txn_date, label: s.reference ?? s.narration ?? "—", amount: Number(s.amount) })),
      ...fdTxns.map((f: any) => ({ kind: `FD ${f.type}`, when: f.txn_date, label: f.reference ?? "—", amount: Number(f.amount) })),
    ];
    rows.sort((a, b) => (a.when < b.when ? 1 : -1));
    return rows.slice(0, 10);
  }, [repayments, savingsTxns, fdTxns]);

  return (
    <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
      <Card>
        {active ? (
          <>
            <SectionTitle>Active loan · {active.product?.name}</SectionTitle>
            <div className="text-[12px] text-muted-foreground mb-2">
              {money(active.principal)} · {active.term_months} months · {active.frequency}
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${active.principal > 0 ? (active.repaid / Number(active.principal)) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[11.5px] text-muted-foreground mb-4">
              <span>{money(active.repaid)} repaid</span>
              <span>{money(active.outstanding)} outstanding</span>
            </div>
            <SectionTitle>Upcoming installments</SectionTitle>
            <div className="divide-y divide-row-divider">
              {(active.schedule ?? []).slice(0, 6).map((i: any) => {
                const paid = i.state === "paid";
                const due = i.state === "due" || i.state === "overdue" || i.state === "partial";
                return (
                  <div key={i.seq} className="flex items-center gap-3 py-2 text-[12.5px]">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold"
                      style={{
                        background: paid ? "var(--status-active-bg)" : due ? "var(--status-pending-bg)" : "var(--muted)",
                        color: paid ? "var(--status-active-fg)" : due ? "var(--status-pending-fg)" : "var(--faint)",
                      }}
                    >
                      {paid ? "✓" : due ? "!" : i.seq}
                    </div>
                    <div className="flex-1">Installment {i.seq} · {shortDate(i.due_date)}</div>
                    <div className="font-mono">{money(Number(i.principal_due) + Number(i.interest_due))}</div>
                    <div className="w-16 text-right text-[10.5px] font-semibold capitalize" style={{ color: paid ? "var(--primary)" : due ? "var(--status-pending-fg)" : "var(--faint)" }}>
                      {i.state}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <SectionTitle>No active loan</SectionTitle>
            <div className="text-sm text-muted-foreground">
              This member has no disbursed loans. Start an application via{" "}
              <Link to="/loans/new" className="text-primary">New loan</Link>.
            </div>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle>Recent activity</SectionTitle>
        {combined.length === 0 ? (
          <div className="text-sm text-muted-foreground">No activity yet.</div>
        ) : (
          <div className="relative pl-5">
            <div className="absolute left-1 top-1 bottom-1 w-0.5 bg-border" />
            {combined.map((r, i) => (
              <div key={i} className="relative pb-4 last:pb-0">
                <div className="absolute -left-5 top-1 w-2.5 h-2.5 rounded-full bg-card border-2 border-primary" />
                <div className="text-[12.5px] font-medium flex justify-between gap-2">
                  <span className="truncate">{r.kind}</span>
                  <span className="font-mono">{money(r.amount)}</span>
                </div>
                <div className="text-[11px] text-faint mt-0.5">{r.label} · {relTime(r.when)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function LoansPanel({ loans }: any) {
  if (loans.length === 0) {
    return <EmptyState icon={Wallet} title="No loans" hint="This customer has no loan history." />;
  }
  return (
    <Card padded={false}>
      <Table
        cols="1.5fr 1fr .8fr .8fr 1fr 1fr .8fr"
        head={["Product", "Principal", "Term", "Rate", "Frequency", "Disbursed", "Status"]}
        rows={loans.map((l: any) => [
          l.product?.name ?? "—",
          <span className="font-mono">{money(l.principal)}</span>,
          `${l.term_months}m`,
          <span className="font-mono">{Number(l.annual_rate_pct).toFixed(2)}%</span>,
          l.frequency,
          l.disbursed_at ? shortDate(l.disbursed_at) : "—",
          <StatusBadge status={l.status} />,
        ])}
      />
    </Card>
  );
}

function SavingsPanel({ savings, savingsTxns }: any) {
  if (savings.length === 0) return <EmptyState icon={PiggyBank} title="No savings accounts" hint="Open a savings account for this customer." />;
  return (
    <div className="flex flex-col gap-4">
      <Card padded={false}>
        <Table
          cols="1fr 1.4fr 1fr 1fr 1fr .8fr"
          head={["Account #", "Product", "Balance", "Available", "Opened", "Status"]}
          rows={savings.map((s: any) => [
            <span className="font-mono">{s.account_no}</span>,
            s.product?.name ?? "—",
            <span className="font-mono">{money(s.balance)}</span>,
            <span className="font-mono">{money(s.available_balance)}</span>,
            s.opened_on ? shortDate(s.opened_on) : "—",
            <StatusBadge status={s.status} />,
          ])}
        />
      </Card>
      <Card padded={false}>
        <div className="px-5 py-3 border-b border-border text-[11px] uppercase tracking-wider text-faint font-semibold">
          Savings transactions
        </div>
        <Table
          cols="1fr 1.2fr .8fr 1fr 1fr 1.5fr"
          head={["Date", "Type", "Channel", "Amount", "Balance", "Reference"]}
          rows={savingsTxns.map((t: any) => [
            shortDate(t.txn_date),
            t.txn_type,
            t.channel ?? "—",
            <span className="font-mono">{money(t.amount)}</span>,
            <span className="font-mono">{money(t.running_balance)}</span>,
            <span className="font-mono truncate">{t.reference ?? t.narration ?? "—"}</span>,
          ])}
          empty="No savings transactions."
        />
      </Card>
    </div>
  );
}

function FdPanel({ fds, fdTxns }: any) {
  if (fds.length === 0) return <EmptyState icon={Landmark} title="No fixed deposits" hint="Book a fixed deposit for this customer." />;
  return (
    <div className="flex flex-col gap-4">
      <Card padded={false}>
        <Table
          cols="1fr 1.4fr 1fr .8fr 1fr 1fr .8fr"
          head={["Certificate", "Product", "Principal", "Rate", "Value date", "Maturity", "Status"]}
          rows={fds.map((f: any) => [
            <span className="font-mono">{f.certificate_no ?? "—"}</span>,
            f.product?.name ?? "—",
            <span className="font-mono">{money(f.principal)}</span>,
            <span className="font-mono">{Number(f.rate_at_booking).toFixed(2)}%</span>,
            f.value_date ? shortDate(f.value_date) : "—",
            f.maturity_date ? shortDate(f.maturity_date) : "—",
            <StatusBadge status={f.status} />,
          ])}
        />
      </Card>
      <Card padded={false}>
        <div className="px-5 py-3 border-b border-border text-[11px] uppercase tracking-wider text-faint font-semibold">
          FD transactions
        </div>
        <Table
          cols="1fr 1.4fr 1fr 1.5fr"
          head={["Date", "Type", "Amount", "Reference"]}
          rows={fdTxns.map((t: any) => [
            shortDate(t.txn_date),
            t.type,
            <span className="font-mono">{money(t.amount)}</span>,
            <span className="font-mono truncate">{t.reference ?? "—"}</span>,
          ])}
          empty="No FD transactions."
        />
      </Card>
    </div>
  );
}

function TransactionsPanel({ repayments, savingsTxns, fdTxns }: any) {
  const [filter, setFilter] = useState<"all" | "loan" | "savings" | "fd">("all");
  const rows = useMemo(() => {
    const r: { kind: string; source: "loan" | "savings" | "fd"; when: string; type: string; ref: string; amount: number }[] = [
      ...repayments.map((x: any) => ({ kind: "Loan repayment", source: "loan" as const, when: x.received_at, type: x.channel ?? "—", ref: x.id.slice(0, 8), amount: Number(x.amount) })),
      ...savingsTxns.map((x: any) => ({ kind: "Savings", source: "savings" as const, when: x.txn_date, type: x.txn_type, ref: x.reference ?? x.narration ?? "—", amount: Number(x.amount) })),
      ...fdTxns.map((x: any) => ({ kind: "Fixed deposit", source: "fd" as const, when: x.txn_date, type: x.type, ref: x.reference ?? "—", amount: Number(x.amount) })),
    ];
    r.sort((a, b) => (a.when < b.when ? 1 : -1));
    return filter === "all" ? r : r.filter((x) => x.source === filter);
  }, [repayments, savingsTxns, fdTxns, filter]);

  const filters: { key: typeof filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: repayments.length + savingsTxns.length + fdTxns.length },
    { key: "loan", label: "Loans", count: repayments.length },
    { key: "savings", label: "Savings", count: savingsTxns.length },
    { key: "fd", label: "FD", count: fdTxns.length },
  ];

  return (
    <Card padded={false}>
      <div className="px-5 py-3 border-b border-border flex items-center gap-1.5 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "text-[11.5px] font-medium px-3 py-1.5 rounded-full border transition-colors",
              filter === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-card text-secondary-foreground border-border hover:border-border-strong",
            )}
          >
            {f.label} <span className="font-mono opacity-70">{f.count}</span>
          </button>
        ))}
      </div>
      <Table
        cols="1fr 1fr 1fr 1.4fr 1fr"
        head={["Date", "Source", "Type", "Reference", "Amount"]}
        rows={rows.map((r) => [
          shortDate(r.when),
          r.kind,
          r.type,
          <span className="font-mono truncate">{r.ref}</span>,
          <span className="font-mono">{money(r.amount)}</span>,
        ])}
        empty="No transactions in this filter."
      />
    </Card>
  );
}

function DocumentsPanel({ documents, clientId }: { documents: any[]; clientId: string }) {
  async function open(path: string) {
    const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not open file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  if (!documents || documents.length === 0) {
    return <EmptyState icon={FileText} title="No documents on file" hint={`Client ID: ${clientId.slice(0, 8).toUpperCase()} · Upload NIC copy & billing proof during onboarding.`} />;
  }
  return (
    <Card padded={false}>
      <div className="divide-y divide-row-divider">
        {documents.map((d) => (
          <div key={d.path} className="flex items-center gap-3 px-5 py-3 text-[13px]">
            <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <FileText size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{d.name}</div>
              <div className="text-[11px] text-faint">
                {(d.size / 1024).toFixed(1)} KB{d.updated_at ? ` · ${relTime(d.updated_at)}` : ""}
              </div>
            </div>
            <button onClick={() => open(d.path)} className="text-[12px] text-primary hover:underline inline-flex items-center gap-1">
              <Download size={12} /> Open
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProfilePanel({ client, bankAccounts }: any) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <SectionTitle>Personal</SectionTitle>
        <Field label="Full name" value={client.full_name} />
        <Field label="Date of birth" value={client.date_of_birth ? shortDate(client.date_of_birth) : "—"} />
        <Field label="Gender" value={client.gender ?? "—"} />
        <Field label="Occupation" value={client.occupation ?? "—"} />
        <Field label="Monthly income" value={client.monthly_income ? money(Number(client.monthly_income), true) : "—"} mono />
        <Field label="Risk grade" value={client.risk_grade ?? "—"} />
      </Card>
      <Card>
        <SectionTitle>Contact</SectionTitle>
        <Field label="Phone" value={client.phone ?? "—"} icon={<Phone size={12} />} />
        <Field label="Email" value={client.email ?? "—"} icon={<Mail size={12} />} />
        <Field label="Address" value={client.address ?? "—"} icon={<MapPin size={12} />} />
        <Field label="GN Division" value={client.gn_division ?? "—"} />
        <Field label="DS Division" value={client.divisional_secretariat ?? "—"} />
        <Field label="District / Province" value={`${client.district ?? "—"} · ${client.province ?? "—"}`} />
      </Card>
      <Card className="md:col-span-2">
        <SectionTitle>Bank accounts</SectionTitle>
        {bankAccounts.length === 0 ? (
          <div className="text-sm text-muted-foreground">No bank accounts on file.</div>
        ) : (
          <div className="divide-y divide-row-divider">
            {bankAccounts.map((b: any) => (
              <div key={b.id} className="py-2 flex items-center gap-3 text-[13px]">
                <div className="flex-1">
                  <div className="font-medium">
                    {b.bank_name} {b.branch_name ? `· ${b.branch_name}` : ""}
                    {b.is_primary && <span className="ml-2 text-[10px] uppercase tracking-wider rounded-full bg-primary/10 text-primary px-2 py-0.5">Primary</span>}
                  </div>
                  <div className="text-[11.5px] text-faint">{b.account_name}</div>
                </div>
                <div className="font-mono text-[12px]">{b.account_no}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-[12.5px] border-b border-row-divider last:border-b-0">
      <span className="text-muted-foreground inline-flex items-center gap-1.5">{icon}{label}</span>
      <span className={cn("text-right", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function Table({ cols, head, rows, empty }: { cols: string; head: React.ReactNode[]; rows: React.ReactNode[][]; empty?: string }) {
  return (
    <>
      <div
        className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
        style={{ gridTemplateColumns: cols }}
      >
        {head.map((h, i) => <div key={i}>{h}</div>)}
      </div>
      {rows.length === 0 ? (
        <div className="text-center text-faint text-sm py-8">{empty ?? "No rows."}</div>
      ) : (
        rows.map((r, i) => (
          <div
            key={i}
            className="grid items-center text-[13px] py-3 px-5 border-b border-row-divider last:border-b-0 hover:bg-row-hover"
            style={{ gridTemplateColumns: cols }}
          >
            {r.map((c, j) => <div key={j} className="truncate">{c}</div>)}
          </div>
        ))
      )}
    </>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) {
  return (
    <Card>
      <div className="flex flex-col items-center text-center py-10">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
          <Icon size={20} />
        </div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[12px] text-muted-foreground mt-1">{hint}</div>
      </div>
    </Card>
  );
}
