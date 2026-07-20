import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Play, Coins } from "lucide-react";
import { Card } from "@/components/mzizi/Card";
import { inputCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import {
  listSavingsAccruals,
  listSavingsPostings,
  runSavingsInterestAccrual,
  runSavingsInterestCapitalization,
} from "@/lib/savings.functions";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/savings/interest")({
  component: InterestPage,
});

function InterestPage() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<"accruals" | "postings">("accruals");
  const [bizDate, setBizDate] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [force, setForce] = useState(false);

  const accrualsFn = useServerFn(listSavingsAccruals);
  const postingsFn = useServerFn(listSavingsPostings);
  const { data: accruals = [] } = useQuery({
    queryKey: ["savings-accruals"],
    queryFn: () => accrualsFn({ data: { limit: 200 } }),
    enabled: tab === "accruals",
  });
  const { data: postings = [] } = useQuery({
    queryKey: ["savings-postings"],
    queryFn: () => postingsFn({ data: { limit: 200 } }),
    enabled: tab === "postings",
  });

  const accrueFn = useServerFn(runSavingsInterestAccrual);
  const capFn = useServerFn(runSavingsInterestCapitalization);

  const accrueM = useMutation({
    mutationFn: () => accrueFn({ data: { business_date: bizDate } }),
    onSuccess: (r: any) => {
      toast.success(`Accrued ${r?.accrued ?? 0} accounts · ${money(r?.gross_interest ?? 0)}`);
      qc.invalidateQueries({ queryKey: ["savings-accruals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const capM = useMutation({
    mutationFn: () => capFn({ data: { period_end: periodEnd, force } }),
    onSuccess: (r: any) => {
      toast.success(
        `Capitalised ${r?.posted ?? 0} accounts · gross ${money(r?.gross_total ?? 0)} · WHT ${money(r?.wht_total ?? 0)}`,
      );
      qc.invalidateQueries({ queryKey: ["savings-postings"] });
      qc.invalidateQueries({ queryKey: ["savings-accruals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/savings" className="text-primary hover:underline inline-flex items-center gap-1 text-sm">
            <ArrowLeft size={14} /> Back to Savings
          </Link>
          <h1 className="text-lg font-semibold">Interest & WHT</h1>
        </div>
        <Link
          to="/admin/savings/wht"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          <Coins size={12} /> WHT rules
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-3.5">
          <div className="mb-2 text-sm font-semibold">Daily accrual</div>
          <p className="text-xs text-muted-foreground mb-2">
            Sweep active savings accounts for the business date. Idempotent per (account, date).
          </p>
          <div className="flex items-end gap-2">
            <label className="text-xs">
              <div className="text-faint mb-1">Business date</div>
              <input
                type="date"
                className={inputCls}
                value={bizDate}
                onChange={(e) => setBizDate(e.target.value)}
              />
            </label>
            <button
              className={btnPrimaryCls}
              disabled={accrueM.isPending}
              onClick={() => accrueM.mutate()}
            >
              <Play size={12} className="mr-1" />
              {accrueM.isPending ? "Running…" : "Run accrual"}
            </button>
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="mb-2 text-sm font-semibold">Capitalisation</div>
          <p className="text-xs text-muted-foreground mb-2">
            Posts accrued interest to deposits, deducts WHT per rule, and writes a balanced GL entry.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <div className="text-faint mb-1">Period end</div>
              <input
                type="date"
                className={inputCls}
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </label>
            <label className="text-xs flex items-center gap-1.5">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              Force (ignore product cap schedule)
            </label>
            <button
              className={btnSecondaryCls}
              disabled={capM.isPending}
              onClick={() => capM.mutate()}
            >
              <Play size={12} className="mr-1" />
              {capM.isPending ? "Running…" : "Capitalise"}
            </button>
          </div>
        </Card>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab("accruals")}
          className={`h-8 px-3 rounded text-xs ${tab === "accruals" ? "bg-primary text-primary-foreground" : "border border-input"}`}
        >
          Accruals
        </button>
        <button
          onClick={() => setTab("postings")}
          className={`h-8 px-3 rounded text-xs ${tab === "postings" ? "bg-primary text-primary-foreground" : "border border-input"}`}
        >
          Capitalisation history
        </button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          {tab === "accruals" ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2 pr-3 text-right">Eligible balance</th>
                  <th className="py-2 pr-3 text-right">Rate %</th>
                  <th className="py-2 pr-3 text-right">Day count</th>
                  <th className="py-2 pr-3 text-right">Gross interest</th>
                </tr>
              </thead>
              <tbody>
                {accruals.map((r: any) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{r.accrual_date}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.account_id.slice(0, 8)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{money(r.eligible_balance, true)}</td>
                    <td className="py-2 pr-3 text-right">{Number(r.rate_pct).toFixed(3)}</td>
                    <td className="py-2 pr-3 text-right">{r.day_count}</td>
                    <td className="py-2 pr-3 text-right font-mono">{money(r.gross_interest, true)}</td>
                  </tr>
                ))}
                {!accruals.length && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground text-sm">
                      No accruals yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                  <th className="py-2 pr-3">Period</th>
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2 pr-3 text-right">Gross</th>
                  <th className="py-2 pr-3 text-right">WHT</th>
                  <th className="py-2 pr-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {postings.map((r: any) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">
                      {r.period_start} → {r.period_end}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.account_id.slice(0, 8)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{money(r.gross_interest, true)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{money(r.wht_amount, true)}</td>
                    <td className="py-2 pr-3 text-right font-mono font-semibold">
                      {money(r.net_interest, true)}
                    </td>
                  </tr>
                ))}
                {!postings.length && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground text-sm">
                      No capitalisation runs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
