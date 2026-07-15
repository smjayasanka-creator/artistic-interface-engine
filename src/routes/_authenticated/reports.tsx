import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getReports, getFinancials, getSubledgerReconciliation } from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { money, getActiveCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports")({
  component: Reports,
});

type TabKey =
  | "overview"
  | "income"
  | "balance"
  | "trial"
  | "ledger"
  | "recon"
  | "portfolio"
  | "customer";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "income", label: "Income Statement" },
  { key: "balance", label: "Balance Sheet" },
  { key: "trial", label: "Trial Balance" },
  { key: "ledger", label: "Ledger" },
  { key: "recon", label: "Reconciliation" },
  { key: "portfolio", label: "Portfolio" },
  { key: "customer", label: "Customer" },
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
      {tab === "overview" &&
        (data ? <OverviewTab data={data} /> : <Loading />)}
      {tab === "income" &&
        (fin ? <IncomeStatementTab data={fin.incomeStatement} /> : <Loading />)}
      {tab === "balance" &&
        (fin ? <BalanceSheetTab data={fin.balanceSheet} /> : <Loading />)}
      {tab === "trial" &&
        (fin ? <TrialBalanceTab data={fin.trialBalance} /> : <Loading />)}
      {tab === "ledger" && <LedgerTab />}
      {tab === "recon" && <ReconciliationTab />}
      {tab === "portfolio" &&
        (fin ? <PortfolioTab rows={fin.portfolio} /> : <Loading />)}
      {tab === "customer" &&
        (fin ? <CustomerTab rows={fin.customers} /> : <Loading />)}
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

function TrialBalanceTab({ data }: { data: any }) {
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

/* ─── Portfolio ─── */

function PortfolioTab({ rows }: { rows: any[] }) {
  const total = rows.reduce((s, r) => s + r.outstanding, 0);
  return (
    <Card>
      <CardTitle subtitle="Outstanding by loan product">Portfolio breakdown</CardTitle>
      <div
        className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold pb-2 border-b border-border"
        style={{ gridTemplateColumns: "2fr .8fr 1.2fr 1.2fr .8fr" }}
      >
        <div>Product</div>
        <div className="text-right">Loans</div>
        <div className="text-right">Disbursed</div>
        <div className="text-right">Outstanding</div>
        <div className="text-right">Share</div>
      </div>
      {rows.length === 0 && <EmptyRow label="No disbursed loans yet." />}
      {rows.map((p) => (
        <div
          key={p.name}
          className="grid items-center py-3 border-b border-row-divider last:border-b-0 text-[13px]"
          style={{ gridTemplateColumns: "2fr .8fr 1.2fr 1.2fr .8fr" }}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
            {p.name}
          </div>
          <div className="font-mono text-right text-muted-foreground">{p.count}</div>
          <div className="font-mono text-right">{money(p.principal)}</div>
          <div className="font-mono text-right font-semibold">{money(p.outstanding)}</div>
          <div className="font-mono text-right text-muted-foreground">
            {total > 0 ? ((p.outstanding / total) * 100).toFixed(1) : "0"}%
          </div>
        </div>
      ))}
      <div
        className="grid items-center py-3 mt-1 border-t-2 border-border text-[13px] font-semibold"
        style={{ gridTemplateColumns: "2fr .8fr 1.2fr 1.2fr .8fr" }}
      >
        <div>Total</div>
        <div className="font-mono text-right">{rows.reduce((s, r) => s + r.count, 0)}</div>
        <div className="font-mono text-right">{money(rows.reduce((s, r) => s + r.principal, 0))}</div>
        <div className="font-mono text-right">{money(total)}</div>
        <div className="font-mono text-right">100%</div>
      </div>
    </Card>
  );
}

/* ─── Customer ─── */

function CustomerTab({ rows }: { rows: any[] }) {
  const total = rows.reduce((s, r) => s + r.outstanding, 0);
  return (
    <Card>
      <CardTitle subtitle="Ranked by outstanding principal">Customer exposure</CardTitle>
      <div
        className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold pb-2 border-b border-border"
        style={{ gridTemplateColumns: "2.4fr .7fr 1.2fr 1.2fr .8fr" }}
      >
        <div>Customer</div>
        <div className="text-right">Loans</div>
        <div className="text-right">Disbursed</div>
        <div className="text-right">Outstanding</div>
        <div className="text-right">Share</div>
      </div>
      {rows.length === 0 && <EmptyRow label="No customer loans yet." />}
      {rows.map((c, i) => (
        <div
          key={c.name + i}
          className="grid items-center py-3 border-b border-row-divider last:border-b-0 text-[13px]"
          style={{ gridTemplateColumns: "2.4fr .7fr 1.2fr 1.2fr .8fr" }}
        >
          <div>{c.name}</div>
          <div className="font-mono text-right text-muted-foreground">{c.loans}</div>
          <div className="font-mono text-right">{money(c.principal)}</div>
          <div className="font-mono text-right font-semibold">{money(c.outstanding)}</div>
          <div className="font-mono text-right text-muted-foreground">
            {total > 0 ? ((c.outstanding / total) * 100).toFixed(1) : "0"}%
          </div>
        </div>
      ))}
    </Card>
  );
}

/* ─── Ledger placeholder ─── */

function LedgerTab() {
  return (
    <Card className="min-h-[16rem] flex flex-col items-center justify-center text-center">
      <div className="text-sm font-medium text-muted-foreground">Ledger</div>
      <div className="text-xs text-faint mt-1">Use the General Ledger page for full journal lines and account filters.</div>
    </Card>
  );
}

/* ─── Sub-ledger vs GL Reconciliation ─── */

function ReconciliationTab() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState<string>(today);
  const [fromDate, setFromDate] = useState<string>("");
  const reconFn = useServerFn(getSubledgerReconciliation);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["subledger-recon", asOf, fromDate],
    queryFn: () => reconFn({ data: { asOf, fromDate: fromDate || undefined } }),
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wider text-faint font-semibold">From date (optional)</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-border rounded-md px-3 py-1.5 text-sm bg-background"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wider text-faint font-semibold">As of date</label>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="border border-border rounded-md px-3 py-1.5 text-sm bg-background"
            />
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
          {fromDate && (
            <button
              type="button"
              onClick={() => setFromDate("")}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted"
            >
              Clear range
            </button>
          )}
          <div className="text-xs text-faint ml-auto">
            {fromDate ? "Period movement" : "Balance snapshot"}
          </div>
        </div>
      </Card>

      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Checks run" value={data.totals.checked} tone="primary" />
            <MetricCard label="Matches" value={data.totals.checked - data.totals.breaks} tone="positive" />
            <MetricCard label="Breaks" value={data.totals.breaks} tone={data.totals.breaks > 0 ? "negative" : "positive"} />
          </div>

          <Card>
            <CardTitle subtitle={fromDate ? `Movement ${fromDate} → ${data.asOf}` : `Snapshot as of ${data.asOf}`}>
              Sub-ledger vs GL control accounts
            </CardTitle>
            <div
              className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold pb-2 border-b border-border"
              style={{ gridTemplateColumns: "70px 1.6fr 1.4fr 140px 140px 140px 90px" }}
            >
              <div>Code</div>
              <div>Control account</div>
              <div>Sub-ledger</div>
              <div className="text-right">GL balance</div>
              <div className="text-right">Sub-ledger</div>
              <div className="text-right">Difference</div>
              <div className="text-right">Status</div>
            </div>
            {data.rows.length === 0 && <EmptyRow label="No control accounts mapped." />}
            {data.rows.map((r: any) => (
              <div
                key={r.code}
                className={cn(
                  "grid items-center py-3 border-b border-row-divider last:border-b-0 text-[13px]",
                  r.status === "break" && "bg-red-50/40",
                )}
                style={{ gridTemplateColumns: "70px 1.6fr 1.4fr 140px 140px 140px 90px" }}
              >
                <div className="font-mono text-[11.5px] text-muted-foreground">{r.code}</div>
                <div>
                  <div>{r.name}</div>
                  {r.note && (
                    <div className="text-[11px] text-amber-700 mt-0.5 leading-snug">{r.note}</div>
                  )}
                </div>
                <div className="text-muted-foreground text-[12.5px]">{r.subledger}</div>
                <div className="font-mono text-right">{money(r.gl_balance)}</div>
                <div className="font-mono text-right">{money(r.subledger_balance)}</div>
                <div
                  className={cn(
                    "font-mono text-right font-semibold",
                    r.status === "break" ? "text-red-600" : "text-emerald-600",
                  )}
                >
                  {money(r.difference)}
                </div>
                <div className="text-right">
                  <span
                    className={cn(
                      "inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold uppercase tracking-wide",
                      r.status === "break"
                        ? "bg-red-100 text-red-700"
                        : "bg-emerald-100 text-emerald-700",
                    )}
                  >
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
            <div
              className="grid items-center py-3 mt-1 border-t-2 border-border text-[13px] font-semibold"
              style={{ gridTemplateColumns: "70px 1.6fr 1.4fr 140px 140px 140px 90px" }}
            >
              <div />
              <div>Totals</div>
              <div />
              <div className="font-mono text-right">{money(data.totals.totalGl)}</div>
              <div className="font-mono text-right">{money(data.totals.totalSub)}</div>
              <div
                className={cn(
                  "font-mono text-right",
                  Math.abs(data.totals.totalDiff) > 0.01 ? "text-red-600" : "text-emerald-600",
                )}
              >
                {money(data.totals.totalDiff)}
              </div>
              <div />
            </div>
          </Card>

          <Card>
            <div className="text-xs text-muted-foreground leading-relaxed">
              <strong>How this works.</strong> Each control account's GL balance is the signed sum of postings on that
              account (respecting normal balance). The sub-ledger side aggregates the underlying business-fact tables:
              savings uses <code>savings_transaction</code>, fixed deposits use <code>fd_transaction</code>, and loans
              use <code>v_loan_outstanding</code> for the current snapshot (or disbursed − repayments for a historical
              range). A non-zero difference means a posting was skipped, split incorrectly, or that a sub-ledger row was
              written outside the ledger kernel.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ─── UI atoms ─── */

function MetricCard({ label, value, tone }: { label: string; value: number; tone: "primary" | "positive" | "negative" }) {
  const color =
    tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-red-600" : "text-foreground";
  return (
    <Card>
      <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className={cn("mt-2 text-xl font-mono font-semibold", color)}>{money(value)}</div>
    </Card>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="text-center text-faint text-sm py-8">{label}</div>;
}
