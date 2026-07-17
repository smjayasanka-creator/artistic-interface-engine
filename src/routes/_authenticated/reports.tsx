import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getReports,
  getFinancials,
  getReportFilterOptions,
  getReportGeneralLedger,
  getReportLoanBase,
} from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { money, getActiveCurrency, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, BookOpen, FileBarChart, Scale } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  component: Reports,
});

type TabKey = "overview" | "income" | "balance" | "custom";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "income", label: "Income Statement" },
  { key: "balance", label: "Balance Sheet" },
  { key: "custom", label: "Custom Reports" },
];

function TabHeader({ tab, setTab }: { tab: TabKey; setTab: (t: TabKey) => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-border -mx-1 px-1 overflow-x-auto">
      {TABS.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2.5 text-[12.5px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Reports() {
  const [tab, setTab] = useState<TabKey>("overview");
  const reportsFn = useServerFn(getReports);
  const finFn = useServerFn(getFinancials);
  const { data } = useQuery({ queryKey: ["reports"], queryFn: () => reportsFn() });
  const { data: fin } = useQuery({ queryKey: ["financials"], queryFn: () => finFn() });

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <TabHeader tab={tab} setTab={setTab} />
      {tab === "overview" && (data ? <OverviewTab data={data} /> : <Loading />)}
      {tab === "income" && (fin ? <IncomeStatementTab data={fin.incomeStatement} /> : <Loading />)}
      {tab === "balance" && (fin ? <BalanceSheetTab data={fin.balanceSheet} /> : <Loading />)}
      {tab === "custom" && <CustomReportsTab fin={fin} />}
    </div>
  );
}

function Loading() {
  return <div className="text-sm text-muted-foreground">Loading…</div>;
}

function OverviewTab({ data }: { data: any }) {
  const disbMax = Math.max(1, ...data.disbursement.map((m: any) => m.total));
  const parMax = Math.max(1, ...data.par.map((p: any) => p.value));
  const totalPortfolio = data.products.reduce((s: number, p: any) => s + p.out, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardTitle subtitle={`Last 6 months · ${getActiveCurrency()}`}>Disbursement volume</CardTitle>
          <div className="flex items-end gap-3 h-40 mt-3">
            {data.disbursement.map((m: any, i: number) => {
              const isCurrent = i === data.disbursement.length - 1;
              return (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full rounded-t-md" style={{ height: `${(m.total / disbMax) * 100}%`, background: isCurrent ? "var(--primary)" : "var(--teal-soft)", minHeight: 4 }} />
                  <div className="text-[11px] text-muted-foreground">{m.label}</div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <CardTitle subtitle={`Principal at risk · ${getActiveCurrency()}`}>PAR trend</CardTitle>
          <div className="flex items-end gap-3 h-40 mt-3">
            {data.par.map((p: any) => (
              <div key={p.label} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full rounded-t-md" style={{ height: `${(p.value / parMax) * 100}%`, background: "#f59e0b", minHeight: 4 }} />
                <div className="text-[11px] text-muted-foreground">{p.label}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <CardTitle>Portfolio by product</CardTitle>
        <div className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold pb-2.5 border-b border-border"
             style={{ gridTemplateColumns: "2fr 1.2fr .7fr .8fr" }}>
          <div>Product</div><div>Outstanding</div><div>Loans</div><div>Share</div>
        </div>
        {data.products.map((p: any) => (
          <div key={p.name} className="grid items-center py-3 border-b border-row-divider last:border-b-0 text-[13px]"
               style={{ gridTemplateColumns: "2fr 1.2fr .7fr .8fr" }}>
            <div className="flex items-center gap-2.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />{p.name}</div>
            <div className="font-mono font-semibold">{money(p.out)}</div>
            <div className="font-mono text-muted-foreground">{p.count}</div>
            <div className="font-mono text-muted-foreground">{totalPortfolio > 0 ? ((p.out / totalPortfolio) * 100).toFixed(1) : "0"}%</div>
          </div>
        ))}
        {data.products.length === 0 && <div className="text-center text-faint text-sm py-8">No disbursed loans yet.</div>}
      </Card>
    </div>
  );
}

/* ─── Statement helpers ─── */

function StatementRow({ code, name, amount, bold }: { code?: string; name: string; amount: number; bold?: boolean }) {
  return (
    <div
      className={cn(
        "grid items-center py-2.5 border-b border-row-divider last:border-b-0 text-[13px]",
        bold && "font-semibold text-foreground",
      )}
      style={{ gridTemplateColumns: "80px 1fr 160px" }}
    >
      <div className="font-mono text-[11.5px] text-muted-foreground">{code ?? ""}</div>
      <div>{name}</div>
      <div className="font-mono text-right">{money(amount)}</div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold pb-2 pt-1 border-b border-border"
      style={{ gridTemplateColumns: "80px 1fr 160px" }}
    >
      <div>Code</div>
      <div>{label}</div>
      <div className="text-right">Amount ({getActiveCurrency()})</div>
    </div>
  );
}

/* ─── Income Statement ─── */

function IncomeStatementTab({ data }: { data: any }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Total income" value={data.totalIncome} tone="positive" />
        <MetricCard label="Total expense" value={data.totalExpense} tone="negative" />
        <MetricCard label="Net profit" value={data.netIncome} tone={data.netIncome >= 0 ? "primary" : "negative"} />
      </div>
      <Card>
        <CardTitle subtitle="Revenue accounts">Income</CardTitle>
        <SectionHeader label="Account" />
        {data.income.length === 0 && <EmptyRow label="No income postings yet." />}
        {data.income.map((r: any) => (
          <StatementRow key={r.code} code={r.code} name={r.name} amount={r.amount} />
        ))}
        <StatementRow name="Total income" amount={data.totalIncome} bold />
      </Card>
      <Card>
        <CardTitle subtitle="Operating costs">Expenses</CardTitle>
        <SectionHeader label="Account" />
        {data.expense.length === 0 && <EmptyRow label="No expense postings yet." />}
        {data.expense.map((r: any) => (
          <StatementRow key={r.code} code={r.code} name={r.name} amount={r.amount} />
        ))}
        <StatementRow name="Total expenses" amount={data.totalExpense} bold />
      </Card>
      <Card>
        <div className="flex items-center justify-between py-1">
          <div className="text-sm font-semibold">Net profit / (loss)</div>
          <div className={cn("font-mono text-base font-semibold", data.netIncome < 0 ? "text-red-600" : "text-emerald-600")}>
            {money(data.netIncome)}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ─── Balance Sheet ─── */

function BalanceSheetTab({ data }: { data: any }) {
  const totalEquityWithNet = data.totalEquity + data.netIncome;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Total assets" value={data.totalAssets} tone="primary" />
        <MetricCard label="Total liabilities" value={data.totalLiab} tone="negative" />
        <MetricCard label="Total equity" value={totalEquityWithNet} tone="positive" />
      </div>
      <Card>
        <CardTitle subtitle="What the business owns">Assets</CardTitle>
        <SectionHeader label="Account" />
        {data.assets.length === 0 && <EmptyRow label="No asset accounts posted." />}
        {data.assets.map((r: any) => (
          <StatementRow key={r.code} code={r.code} name={r.name} amount={r.amount} />
        ))}
        <StatementRow name="Total assets" amount={data.totalAssets} bold />
      </Card>
      <Card>
        <CardTitle subtitle="What the business owes">Liabilities</CardTitle>
        <SectionHeader label="Account" />
        {data.liabilities.length === 0 && <EmptyRow label="No liability accounts posted." />}
        {data.liabilities.map((r: any) => (
          <StatementRow key={r.code} code={r.code} name={r.name} amount={r.amount} />
        ))}
        <StatementRow name="Total liabilities" amount={data.totalLiab} bold />
      </Card>
      <Card>
        <CardTitle subtitle="Owner's capital & retained earnings">Equity</CardTitle>
        <SectionHeader label="Account" />
        {data.equity.map((r: any) => (
          <StatementRow key={r.code} code={r.code} name={r.name} amount={r.amount} />
        ))}
        <StatementRow name="Current period net income" amount={data.netIncome} />
        <StatementRow name="Total equity" amount={totalEquityWithNet} bold />
      </Card>
      <Card>
        <div className="flex items-center justify-between py-1 text-sm">
          <div className="font-semibold">Liabilities + Equity</div>
          <div className="font-mono font-semibold">{money(data.totalLiab + totalEquityWithNet)}</div>
        </div>
        <div className="flex items-center justify-between py-1 text-xs text-muted-foreground">
          <div>Balance check (Assets − L&amp;E)</div>
          <div className="font-mono">{money(data.totalAssets - (data.totalLiab + totalEquityWithNet))}</div>
        </div>
      </Card>
    </div>
  );
}

/* ─── Trial Balance ─── */

function TrialBalanceReport({ data }: { data: any }) {
  return (
    <Card>
      <CardTitle subtitle="All accounts · debit & credit totals">Trial Balance</CardTitle>
      <div
        className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold pb-2 border-b border-border"
        style={{ gridTemplateColumns: "80px 1.6fr .8fr 160px 160px" }}
      >
        <div>Code</div>
        <div>Account</div>
        <div>Type</div>
        <div className="text-right">Debit</div>
        <div className="text-right">Credit</div>
      </div>
      {data.rows.length === 0 && <EmptyRow label="No postings recorded." />}
      {data.rows.map((r: any) => (
        <div
          key={r.id}
          className="grid items-center py-2.5 border-b border-row-divider last:border-b-0 text-[13px]"
          style={{ gridTemplateColumns: "80px 1.6fr .8fr 160px 160px" }}
        >
          <div className="font-mono text-[11.5px] text-muted-foreground">{r.code}</div>
          <div>{r.name}</div>
          <div className="capitalize text-muted-foreground text-[12px]">{r.type}</div>
          <div className="font-mono text-right">{r.debit ? money(r.debit) : "—"}</div>
          <div className="font-mono text-right">{r.credit ? money(r.credit) : "—"}</div>
        </div>
      ))}
      <div
        className="grid items-center py-3 mt-1 border-t-2 border-border text-[13px] font-semibold"
        style={{ gridTemplateColumns: "80px 1.6fr .8fr 160px 160px" }}
      >
        <div />
        <div>Totals</div>
        <div />
        <div className="font-mono text-right">{money(data.totalDebit)}</div>
        <div className="font-mono text-right">{money(data.totalCredit)}</div>
      </div>
    </Card>
  );
}

/* ─── Custom Reports ─── */

type CustomReportKey = "trial" | "gl" | "loan-base";

function CustomReportsTab({ fin }: { fin: any }) {
  const [view, setView] = useState<CustomReportKey | null>(null);

  if (view === "trial") {
    return (
      <div className="flex flex-col gap-3">
        <BackHeader onBack={() => setView(null)} title="Trial Balance" />
        {fin ? <TrialBalanceReport data={fin.trialBalance} /> : <Loading />}
      </div>
    );
  }
  if (view === "gl") {
    return (
      <div className="flex flex-col gap-3">
        <BackHeader onBack={() => setView(null)} title="General Ledger View" />
        <GeneralLedgerReport />
      </div>
    );
  }
  if (view === "loan-base") {
    return (
      <div className="flex flex-col gap-3">
        <BackHeader onBack={() => setView(null)} title="Loan Base Report (As at Date)" />
        <LoanBaseReport />
      </div>
    );
  }

  const tiles: { key: CustomReportKey; title: string; desc: string; icon: any; accent: string }[] = [
    {
      key: "trial",
      title: "Trial Balance",
      desc: "All accounts · debit & credit totals",
      icon: Scale,
      accent: "from-blue-500/15 to-blue-500/0 text-blue-600",
    },
    {
      key: "gl",
      title: "General Ledger View",
      desc: "Transactions by account, period, branch",
      icon: BookOpen,
      accent: "from-violet-500/15 to-violet-500/0 text-violet-600",
    },
    {
      key: "loan-base",
      title: "Loan Base Report (As at Date)",
      desc: "Loan portfolio snapshot at a chosen date",
      icon: FileBarChart,
      accent: "from-emerald-500/15 to-emerald-500/0 text-emerald-600",
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            className="group text-left"
          >
            <Card className="p-3.5 hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0 ${t.accent}`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px] truncate">{t.title}</div>
                  <div className="text-[11.5px] text-muted-foreground truncate">{t.desc}</div>
                </div>
                <ArrowRight size={16} className="text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}

function BackHeader({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-muted"
      >
        <ArrowLeft size={14} /> Custom Reports
      </button>
      <div className="text-[13.5px] font-semibold">{title}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
      {children}
    </div>
  );
}

/* ─── General Ledger Report ─── */

function GeneralLedgerReport() {
  const optsFn = useServerFn(getReportFilterOptions);
  const { data: opts } = useQuery({ queryKey: ["report-filter-options"], queryFn: () => optsFn() });

  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const [accountId, setAccountId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>(firstOfMonth);
  const [toDate, setToDate] = useState<string>(today);
  const [submitted, setSubmitted] = useState<{ accountId: string; branchId: string; fromDate: string; toDate: string } | null>(null);

  const glFn = useServerFn(getReportGeneralLedger);
  const { data, isFetching } = useQuery({
    queryKey: ["report-gl", submitted],
    queryFn: () =>
      glFn({
        data: {
          accountId: submitted!.accountId || undefined,
          branchId: submitted!.branchId || undefined,
          fromDate: submitted!.fromDate || undefined,
          toDate: submitted!.toDate || undefined,
        },
      }),
    enabled: !!submitted,
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <FieldLabel>Account</FieldLabel>
            <select
              className="w-full h-9 px-2 rounded-md border border-border bg-background text-[13px]"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">All accounts</option>
              {(opts?.accounts ?? []).map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>From</FieldLabel>
            <input
              type="date"
              className="w-full h-9 px-2 rounded-md border border-border bg-background text-[13px]"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>To</FieldLabel>
            <input
              type="date"
              className="w-full h-9 px-2 rounded-md border border-border bg-background text-[13px]"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Branch</FieldLabel>
            <select
              className="w-full h-9 px-2 rounded-md border border-border bg-background text-[13px]"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">All branches</option>
              {(opts?.branches ?? []).map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setSubmitted({ accountId, branchId, fromDate, toDate })}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-[12.5px] font-semibold"
          >
            {isFetching ? "Loading…" : "Run report"}
          </button>
        </div>
      </Card>

      {!submitted && (
        <Card className="min-h-[10rem] flex items-center justify-center text-sm text-muted-foreground">
          Choose filters and click Run report.
        </Card>
      )}

      {submitted && data && (
        <Card padded={false}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div>
              <div className="text-[13px] font-semibold">
                {data.account ? `${data.account.code} — ${data.account.name}` : "All accounts"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {submitted.fromDate || "—"} → {submitted.toDate || "—"}
              </div>
            </div>
            <div className="text-right text-[12px]">
              <div className="text-muted-foreground">Opening</div>
              <div className="font-mono font-semibold">{money(data.opening)}</div>
            </div>
          </div>
          <div
            className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-2.5 px-5 border-b border-border bg-secondary/40"
            style={{ gridTemplateColumns: ".85fr .9fr 2fr 1fr 1fr 1.1fr" }}
          >
            <div>Date</div>
            <div>Txn #</div>
            <div>Narration</div>
            <div className="text-right">Debit</div>
            <div className="text-right">Credit</div>
            <div className="text-right">Balance</div>
          </div>
          {data.lines.length === 0 && <EmptyRow label="No transactions in this period." />}
          {data.lines.map((r: any) => (
            <div
              key={r.id}
              className="grid items-center text-[12.5px] py-2.5 px-5 border-b border-row-divider"
              style={{ gridTemplateColumns: ".85fr .9fr 2fr 1fr 1fr 1.1fr" }}
            >
              <div className="text-muted-foreground">{shortDate(r.date)}</div>
              <div className="font-mono text-ledger-ref">{r.reference}</div>
              <div className="text-muted-foreground truncate">{r.description}</div>
              <div className="text-right font-mono text-debit">{r.debit > 0 ? money(r.debit) : ""}</div>
              <div className="text-right font-mono text-primary">{r.credit > 0 ? money(r.credit) : ""}</div>
              <div className="text-right font-mono font-semibold">{money(r.balance)}</div>
            </div>
          ))}
          {data.lines.length > 0 && (
            <div
              className="grid items-center text-[13px] py-3 px-5 bg-secondary/40 font-semibold"
              style={{ gridTemplateColumns: ".85fr .9fr 2fr 1fr 1fr 1.1fr" }}
            >
              <div className="col-span-3">Totals ({data.lines.length} lines)</div>
              <div className="text-right font-mono text-debit">{money(data.totalDebit)}</div>
              <div className="text-right font-mono text-primary">{money(data.totalCredit)}</div>
              <div className="text-right font-mono">{money(data.closing)}</div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ─── Loan Base Report ─── */

function LoanBaseReport() {
  const optsFn = useServerFn(getReportFilterOptions);
  const { data: opts } = useQuery({ queryKey: ["report-filter-options"], queryFn: () => optsFn() });

  const today = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState<string>(today);
  const [branchId, setBranchId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [submitted, setSubmitted] = useState<{ asOf: string; branchId: string; productId: string } | null>({
    asOf: today,
    branchId: "",
    productId: "",
  });

  const lbFn = useServerFn(getReportLoanBase);
  const { data, isFetching } = useQuery({
    queryKey: ["report-loan-base", submitted],
    queryFn: () =>
      lbFn({
        data: {
          asOf: submitted!.asOf,
          branchId: submitted!.branchId || undefined,
          productId: submitted!.productId || undefined,
        },
      }),
    enabled: !!submitted,
  });

  const totals = (data?.rows ?? []).reduce(
    (acc: any, r: any) => {
      acc.facility += r.facility_amount;
      acc.principal += r.principal_outstanding;
      acc.interest += r.interest_outstanding;
      acc.charges += r.charges_outstanding;
      acc.total += r.total_outstanding;
      acc.arrears += r.rental_arrears;
      acc.accrued += r.accrued_interest;
      return acc;
    },
    { facility: 0, principal: 0, interest: 0, charges: 0, total: 0, arrears: 0, accrued: 0 },
  );

  const cols = "1fr 1.4fr 1fr .5fr .5fr 1fr 1fr .9fr 1.1fr .6fr 1fr 1fr";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <FieldLabel>As at date</FieldLabel>
            <input
              type="date"
              className="w-full h-9 px-2 rounded-md border border-border bg-background text-[13px]"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Branch</FieldLabel>
            <select
              className="w-full h-9 px-2 rounded-md border border-border bg-background text-[13px]"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">All branches</option>
              {(opts?.branches ?? []).map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Product</FieldLabel>
            <select
              className="w-full h-9 px-2 rounded-md border border-border bg-background text-[13px]"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">All products</option>
              {(opts?.products ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setSubmitted({ asOf, branchId, productId })}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-[12.5px] font-semibold"
          >
            {isFetching ? "Loading…" : "Run report"}
          </button>
        </div>
      </Card>

      <Card padded={false}>
        <div
          className="grid text-[10px] uppercase tracking-wider text-faint font-semibold py-2.5 px-4 border-b border-border bg-secondary/40 gap-2"
          style={{ gridTemplateColumns: cols }}
        >
          <div>Contract #</div>
          <div>Customer</div>
          <div className="text-right">Facility</div>
          <div className="text-right">Rate</div>
          <div className="text-right">Term</div>
          <div className="text-right">Cap. O/S</div>
          <div className="text-right">Int. O/S</div>
          <div className="text-right">Chg. O/S</div>
          <div className="text-right">Total O/S</div>
          <div className="text-right">DIA</div>
          <div className="text-right">Rental Arrears</div>
          <div className="text-right">Accrued Int.</div>
        </div>
        {(data?.rows ?? []).length === 0 && <EmptyRow label="No loans match these filters." />}
        {(data?.rows ?? []).map((r: any) => (
          <div
            key={r.loan_id}
            className="grid items-center text-[12px] py-2.5 px-4 border-b border-row-divider gap-2"
            style={{ gridTemplateColumns: cols }}
          >
            <div className="font-mono text-ledger-ref truncate">{r.contract_no}</div>
            <div className="truncate">{r.customer}</div>
            <div className="text-right font-mono">{money(r.facility_amount)}</div>
            <div className="text-right font-mono text-muted-foreground">{Number(r.rate).toFixed(2)}%</div>
            <div className="text-right font-mono text-muted-foreground">{r.term_months}m</div>
            <div className="text-right font-mono">{money(r.principal_outstanding)}</div>
            <div className="text-right font-mono">{money(r.interest_outstanding)}</div>
            <div className="text-right font-mono">{money(r.charges_outstanding)}</div>
            <div className="text-right font-mono font-semibold">{money(r.total_outstanding)}</div>
            <div className={cn("text-right font-mono", r.days_in_arrears > 0 ? "text-red-600 font-semibold" : "text-muted-foreground")}>{r.days_in_arrears}</div>
            <div className="text-right font-mono">{r.rental_arrears > 0 ? money(r.rental_arrears) : "—"}</div>
            <div className="text-right font-mono">{money(r.accrued_interest)}</div>
          </div>
        ))}
        {(data?.rows ?? []).length > 0 && (
          <div
            className="grid items-center text-[12.5px] py-3 px-4 bg-secondary/40 font-semibold gap-2"
            style={{ gridTemplateColumns: cols }}
          >
            <div className="col-span-2">Totals ({data!.rows.length})</div>
            <div className="text-right font-mono">{money(totals.facility)}</div>
            <div />
            <div />
            <div className="text-right font-mono">{money(totals.principal)}</div>
            <div className="text-right font-mono">{money(totals.interest)}</div>
            <div className="text-right font-mono">{money(totals.charges)}</div>
            <div className="text-right font-mono">{money(totals.total)}</div>
            <div />
            <div className="text-right font-mono">{money(totals.arrears)}</div>
            <div className="text-right font-mono">{money(totals.accrued)}</div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ─── Shared ─── */

function EmptyRow({ label }: { label: string }) {
  return <div className="text-center text-faint text-sm py-8">{label}</div>;
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: "primary" | "positive" | "negative" }) {
  const color =
    tone === "primary"
      ? "text-primary"
      : tone === "positive"
        ? "text-emerald-600"
        : "text-red-600";
  return (
    <Card>
      <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className={cn("text-[22px] font-semibold font-mono mt-1", color)}>{money(value)}</div>
    </Card>
  );
}
