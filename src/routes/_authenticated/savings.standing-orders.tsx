import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listSavingsAccounts,
  listStandingOrders,
  upsertStandingOrder,
  setStandingOrderStatus,
  runStandingOrderNow,
} from "@/lib/savings.functions";
import { Card } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  selectCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { money, getActiveCurrency } from "@/lib/format";
import { Play, Pause, X, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/savings/standing-orders")({
  component: StandingOrdersPage,
});

const FREQ = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;
type Freq = (typeof FREQ)[number];

function StandingOrdersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listStandingOrders);
  const acctFn = useServerFn(listSavingsAccounts);
  const upsertFn = useServerFn(upsertStandingOrder);
  const statusFn = useServerFn(setStandingOrderStatus);
  const runFn = useServerFn(runStandingOrderNow);

  const { data: orders } = useQuery({
    queryKey: ["standing-orders", "all"],
    queryFn: () => listFn({ data: { status: "all" } }),
  });
  const { data: accounts } = useQuery({
    queryKey: ["savings-accounts", "active"],
    queryFn: () => acctFn({ data: { status: "active" } }),
  });

  const [showForm, setShowForm] = useState(false);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Freq>("monthly");
  const [next, setNext] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>("");
  const [maxRuns, setMaxRuns] = useState<string>("");
  const [narration, setNarration] = useState("");
  const [consent, setConsent] = useState("");

  const create = useMutation({
    mutationFn: upsertFn,
    onSuccess: () => {
      toast.success("Standing order saved");
      qc.invalidateQueries({ queryKey: ["standing-orders"] });
      setShowForm(false);
      setFromId(""); setToId(""); setAmount(""); setNarration(""); setConsent("");
      setEndDate(""); setMaxRuns("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: statusFn,
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["standing-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runNow = useMutation({
    mutationFn: runFn,
    onSuccess: (res: any) => {
      if (res?.ok) toast.success("Standing order executed");
      else toast.error(`Skipped: ${res?.reason ?? "unknown"}`);
      qc.invalidateQueries({ queryKey: ["standing-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = fromId && toId && fromId !== toId && amount && Number(amount) > 0 && next;

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link to="/savings" className="text-xs text-primary hover:underline">
          ← Back to savings
        </Link>
        <button className={btnPrimaryCls} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Close" : "New standing order"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            create.mutate({
              data: {
                from_account_id: fromId,
                to_account_id: toId,
                amount: Number(amount),
                frequency,
                next_run_date: next,
                end_date: endDate || null,
                max_runs: maxRuns ? Number(maxRuns) : null,
                narration: narration || null,
                consent_ref: consent || null,
              },
            });
          }}
        >
          <Card className="p-6">
            <div className="mb-3 text-sm font-semibold">Create standing order</div>
            <FormGrid>
              <FormField label="From account" required span={6}>
                <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={selectCls}>
                  <option value="">Select…</option>
                  {(accounts ?? []).map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.account_no} — {a.client?.full_name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="To account" required span={6}>
                <select value={toId} onChange={(e) => setToId(e.target.value)} className={selectCls}>
                  <option value="">Select…</option>
                  {(accounts ?? []).filter((a: any) => a.id !== fromId).map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.account_no} — {a.client?.full_name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={`Amount (${getActiveCurrency()})`} required span={3}>
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  className={`${inputCls} font-mono font-semibold`}
                  placeholder="0"
                />
              </FormField>
              <FormField label="Frequency" required span={3}>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as Freq)} className={selectCls}>
                  {FREQ.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </FormField>
              <FormField label="Next run" required span={3}>
                <input type="date" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
              </FormField>
              <FormField label="End date" span={3}>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
              </FormField>
              <FormField label="Max runs" span={3}>
                <input
                  inputMode="numeric"
                  value={maxRuns}
                  onChange={(e) => setMaxRuns(e.target.value.replace(/[^\d]/g, ""))}
                  className={inputCls}
                  placeholder="Unlimited"
                />
              </FormField>
              <FormField label="Consent ref" span={3}>
                <input value={consent} onChange={(e) => setConsent(e.target.value)} className={inputCls} maxLength={60} />
              </FormField>
              <FormField label="Narration" span={12}>
                <input value={narration} onChange={(e) => setNarration(e.target.value)} className={inputCls} maxLength={200} />
              </FormField>
            </FormGrid>
          </Card>
          <FormActions>
            <button type="button" className={btnSecondaryCls} onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" disabled={!valid || create.isPending} className={btnPrimaryCls}>
              {create.isPending ? "Saving…" : "Save"}
            </button>
          </FormActions>
        </form>
      )}

      <Card>
        <div className="mb-3 text-sm font-semibold">Standing orders</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                <th className="py-2 pr-3">From</th>
                <th className="py-2 pr-3">To</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Frequency</th>
                <th className="py-2 pr-3">Next run</th>
                <th className="py-2 pr-3">Runs</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Last run</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(orders ?? []).map((o: any) => {
                const busy = setStatus.isPending || runNow.isPending;
                return (
                  <tr key={o.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">
                      {o.from_account?.account_no}
                      <div className="text-[10px] text-muted-foreground">{o.from_account?.client?.full_name}</div>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {o.to_account?.account_no}
                      <div className="text-[10px] text-muted-foreground">{o.to_account?.client?.full_name}</div>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{money(Number(o.amount))}</td>
                    <td className="py-2 pr-3 capitalize text-xs">{o.frequency}</td>
                    <td className="py-2 pr-3 text-xs">{o.next_run_date}</td>
                    <td className="py-2 pr-3 text-xs">{o.runs_completed}{o.max_runs ? ` / ${o.max_runs}` : ""}</td>
                    <td className="py-2 pr-3 capitalize text-xs">{o.status}</td>
                    <td className="py-2 pr-3 text-xs">
                      {o.last_run_status ? (
                        <span className={o.last_run_status === "ok" ? "text-emerald-700" : "text-rose-700"}>
                          {o.last_run_status}
                        </span>
                      ) : "—"}
                      {o.last_run_error && (
                        <div className="text-[10px] text-rose-600 truncate max-w-[180px]" title={o.last_run_error}>
                          {o.last_run_error}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {o.status === "active" && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => runNow.mutate({ data: { id: o.id } })}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] border border-input hover:bg-muted disabled:opacity-40"
                              title="Run now"
                            >
                              <Zap size={11} /> Run
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => setStatus.mutate({ data: { id: o.id, status: "paused" } })}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] border border-input hover:bg-muted disabled:opacity-40"
                            >
                              <Pause size={11} /> Pause
                            </button>
                          </>
                        )}
                        {o.status === "paused" && (
                          <button
                            disabled={busy}
                            onClick={() => setStatus.mutate({ data: { id: o.id, status: "active" } })}
                            className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] border border-input hover:bg-muted disabled:opacity-40"
                          >
                            <Play size={11} /> Resume
                          </button>
                        )}
                        {(o.status === "active" || o.status === "paused") && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              const reason = prompt("Cancel reason?");
                              if (reason == null) return;
                              setStatus.mutate({ data: { id: o.id, status: "cancelled", reason } });
                            }}
                            className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] border border-rose-400 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                          >
                            <X size={11} /> Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!orders?.length && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground text-sm">
                    No standing orders yet.
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
