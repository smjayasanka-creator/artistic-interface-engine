import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Download, PiggyBank, LineChart, ArrowRight, CalendarClock } from "lucide-react";
import { listFixedDeposits, getFdSummary, listFdProducts } from "@/lib/fd.functions";
import { Card } from "@/components/mzizi/Card";
import { Kpi } from "@/components/mzizi/Kpi";

import { btnPrimaryCls, inputCls, selectCls } from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";
import { money, getActiveCurrency } from "@/lib/format";


export const Route = createFileRoute("/_authenticated/fd/")({
  component: FdRegister,
});

type Status = "" | "pending" | "active" | "matured" | "prematurely_closed" | "renewed";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  matured: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  prematurely_closed: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  renewed: "bg-violet-500/10 text-violet-700 border-violet-500/30",
};

function FdRegister() {
  const [status, setStatus] = useState<Status>("");
  const [productId, setProductId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const listFn = useServerFn(listFixedDeposits);
  const sumFn = useServerFn(getFdSummary);
  const prodFn = useServerFn(listFdProducts);

  const { data: deposits } = useQuery({
    queryKey: ["fd-list", status, productId, from, to],
    queryFn: () =>
      listFn({
        data: {
          status: status || undefined,
          product_id: productId || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      }),
  });
  const { data: summary } = useQuery({ queryKey: ["fd-summary"], queryFn: () => sumFn() });
  const { data: products } = useQuery({ queryKey: ["fd-products"], queryFn: () => prodFn() });

  const filtered = useMemo(() => {
    if (!q) return deposits ?? [];
    const s = q.toLowerCase();
    return (deposits ?? []).filter(
      (d) =>
        d.certificate_no.toLowerCase().includes(s) ||
        d.client?.full_name?.toLowerCase().includes(s) ||
        d.product?.name?.toLowerCase().includes(s),
    );
  }, [deposits, q]);

  function exportCsv() {
    const header = ["Certificate", "Client", "Product", "Principal", "Rate", "Tenure (m)", "Payout", "Value date", "Maturity", "Status"];
    const lines = [header.join(",")];
    for (const d of filtered) {
      lines.push(
        [
          d.certificate_no,
          `"${d.client?.full_name ?? ""}"`,
          `"${d.product?.name ?? ""}"`,
          Number(d.principal).toFixed(2),
          Number(d.rate_at_booking).toFixed(3),
          d.tenure_months,
          d.payout_option,
          d.value_date,
          d.maturity_date,
          d.status,
        ].join(","),
      );
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `fd-register-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Portfolio value" value={money(summary?.portfolio_value ?? 0)} />
        <Kpi label="Active deposits" value={String(summary?.active_count ?? 0)} />
        <Kpi label="Weighted avg rate" value={`${(summary?.weighted_avg_rate ?? 0).toFixed(3)}%`} />
        <Kpi label="Interest paid MTD" value={money(summary?.interest_paid_mtd ?? 0)} />
        <Kpi label="Maturing this month" value={`${summary?.maturing_count ?? 0}`} delta={money(summary?.maturing_this_month ?? 0)} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { to: "/fd/new", icon: PiggyBank, title: "New Deposit", desc: "Book a new fixed deposit certificate", accent: "from-emerald-500/15 to-emerald-500/0 text-emerald-600" },
          { to: "/fd", icon: CalendarClock, title: "Maturity Register", desc: "Track deposits maturing soon", accent: "from-sky-500/15 to-sky-500/0 text-sky-600" },
          { to: "#alco", icon: LineChart, title: "ALCO Rates", desc: "Standard, maximum & CBSL cap per product", accent: "from-violet-500/15 to-violet-500/0 text-violet-600" },
        ].map((c) => {
          const Icon = c.icon;
          const inner = (
            <Card className="p-3.5 hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0 ${c.accent}`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px] truncate">{c.title}</div>
                  <div className="text-[11.5px] text-muted-foreground truncate">{c.desc}</div>
                </div>
                <ArrowRight size={16} className="text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Card>
          );
          return c.to.startsWith("#") ? (
            <a key={c.to} href={c.to} className="group">{inner}</a>
          ) : (
            <Link key={c.to} to={c.to} className="group">{inner}</Link>
          );
        })}
      </div>




      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input placeholder="Search cert / client / product…" className={cn(inputCls, "w-64")} value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={selectCls + " w-40"} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="">All status</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="matured">Matured</option>
            <option value="prematurely_closed">Prematurely closed</option>
            <option value="renewed">Renewed</option>
          </select>
          <select className={selectCls + " w-52"} value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">All products</option>
            {(products ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <input type="date" className={inputCls + " w-40"} value={from} onChange={(e) => setFrom(e.target.value)} title="Maturity from" />
          <input type="date" className={inputCls + " w-40"} value={to} onChange={(e) => setTo(e.target.value)} title="Maturity to" />
          <div className="ml-auto flex gap-2">
            <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm border border-input hover:bg-muted" onClick={exportCsv}>
              <Download size={14} /> Export CSV
            </button>
            <Link to="/fd/new" className={btnPrimaryCls}>
              <Plus size={15} className="mr-1.5" /> New deposit
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-faint font-semibold border-b border-border">
                <th className="py-2 pr-3">Certificate</th>
                <th className="py-2 pr-3">Client</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3 text-right">Principal ({getActiveCurrency()})</th>
                <th className="py-2 pr-3 text-right">Rate %</th>
                <th className="py-2 pr-3">Tenure</th>
                <th className="py-2 pr-3">Payout</th>
                <th className="py-2 pr-3">Maturity</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-muted/40">
                  <td className="py-2 pr-3 font-mono">
                    <Link to="/fd/$id" params={{ id: d.id }} className="text-primary hover:underline">
                      {d.certificate_no}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{d.client?.full_name ?? "—"}</td>
                  <td className="py-2 pr-3">{d.product?.name ?? "—"}</td>
                  <td className="py-2 pr-3 text-right font-mono">{money(Number(d.principal))}</td>
                  <td className="py-2 pr-3 text-right font-mono">{Number(d.rate_at_booking).toFixed(3)}</td>
                  <td className="py-2 pr-3">{d.tenure_months}m</td>
                  <td className="py-2 pr-3 capitalize">{d.payout_option.replace("_", " ")}</td>
                  <td className="py-2 pr-3">{d.maturity_date}</td>
                  <td className="py-2 pr-3">
                    <span className={cn("inline-flex px-2 py-0.5 rounded border text-[10.5px] uppercase tracking-wide", STATUS_TONE[d.status])}>
                      {d.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground">
                    No deposits match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>

  );
}
