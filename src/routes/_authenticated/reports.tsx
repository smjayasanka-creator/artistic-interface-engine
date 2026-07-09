import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getReports } from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports")({
  component: Reports,
});

type TabKey = "overview" | "income" | "balance" | "ledger";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "income", label: "Income Statement" },
  { key: "balance", label: "Balance Sheet" },
  { key: "ledger", label: "Ledger" },
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
  const fn = useServerFn(getReports);
  const { data } = useQuery({ queryKey: ["reports"], queryFn: () => fn() });
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const disbMax = Math.max(1, ...data.disbursement.map((m) => m.total));
  const parMax = Math.max(1, ...data.par.map((p) => p.value));
  const totalPortfolio = data.products.reduce((s, p) => s + p.out, 0);

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardTitle subtitle="Last 6 months · KES">Disbursement volume</CardTitle>
          <div className="flex items-end gap-3 h-40 mt-3">
            {data.disbursement.map((m, i) => {
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
          <CardTitle subtitle="Principal at risk · KES">PAR trend</CardTitle>
          <div className="flex items-end gap-3 h-40 mt-3">
            {data.par.map((p) => (
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
        {data.products.map((p) => (
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
