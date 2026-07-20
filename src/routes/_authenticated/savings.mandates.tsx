import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Plus, Play, PauseCircle, XCircle, CheckCircle2, History } from "lucide-react";
import { Card } from "@/components/mzizi/Card";
import { Modal } from "@/components/mzizi/Modal";
import {
  FormGrid,
  FormField,
  inputCls,
  selectCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import {
  listSavingsAccounts,
  listSavingsLoanMandates,
  createSavingsLoanMandate,
  setSavingsLoanMandateStatus,
  listSavingsAutoCollectionRuns,
  listSavingsAutoCollectionResults,
  triggerSavingsAutoCollection,
} from "@/lib/savings.functions";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/savings/mandates")({
  component: MandatesPage,
});

const MANDATE_TYPES = [
  { code: "arrears_only", label: "Arrears only" },
  { code: "full_installment", label: "Full installment (arrears + next due)" },
  { code: "minimum_due", label: "Minimum due" },
  { code: "fixed_amount", label: "Fixed amount" },
];

function MandatesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"mandates" | "runs">("mandates");
  const [openCreate, setOpenCreate] = useState(false);
  const [viewRun, setViewRun] = useState<any | null>(null);

  const listFn = useServerFn(listSavingsLoanMandates);
  const { data: mandates = [] } = useQuery({
    queryKey: ["savings-mandates"],
    queryFn: () => listFn({ data: {} }),
  });
  const acctFn = useServerFn(listSavingsAccounts);
  const { data: accounts = [] } = useQuery({
    queryKey: ["savings-accounts", "active"],
    queryFn: () => acctFn({ data: { status: "active" } }),
  });
  const runFn = useServerFn(listSavingsAutoCollectionRuns);
  const { data: runs = [] } = useQuery({
    queryKey: ["savings-auto-runs"],
    queryFn: () => runFn({ data: { limit: 50 } }),
    enabled: tab === "runs",
  });

  const createFn = useServerFn(createSavingsLoanMandate);
  const createM = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Mandate created — pending activation");
      qc.invalidateQueries({ queryKey: ["savings-mandates"] });
      setOpenCreate(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const statusFn = useServerFn(setSavingsLoanMandateStatus);
  const statusM = useMutation({
    mutationFn: statusFn,
    onSuccess: () => {
      toast.success("Mandate updated");
      qc.invalidateQueries({ queryKey: ["savings-mandates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const triggerFn = useServerFn(triggerSavingsAutoCollection);
  const triggerM = useMutation({
    mutationFn: triggerFn,
    onSuccess: (r: any) => {
      toast.success(
        `Run complete — collected ${r?.collected ?? 0}, partial ${r?.partial ?? 0}, insufficient ${r?.insufficient ?? 0}`,
      );
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="animate-fadein space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/savings"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> Back to Savings
          </Link>
          <h1 className="text-lg font-semibold mt-1">Loan repayment mandates</h1>
          <p className="text-[12px] text-faint">
            Automatic savings-to-loan collection. Runs twice daily plus manual trigger.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 border border-border rounded-lg p-0.5 bg-card">
            {(["mandates", "runs"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-3 py-1.5 text-[12px] font-medium rounded-md",
                  tab === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "mandates" ? "Mandates" : "Runs"}
              </button>
            ))}
          </div>
          {tab === "mandates" ? (
            <button
              onClick={() => setOpenCreate(true)}
              className={cn(btnPrimaryCls, "inline-flex items-center gap-1.5")}
            >
              <Plus size={14} /> New mandate
            </button>
          ) : (
            <button
              onClick={() => triggerM.mutate({ data: { window: "manual" } })}
              disabled={triggerM.isPending}
              className={cn(btnPrimaryCls, "inline-flex items-center gap-1.5")}
            >
              <Play size={14} /> {triggerM.isPending ? "Running…" : "Run now"}
            </button>
          )}
        </div>
      </div>

      {tab === "mandates" ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                  <th className="py-2 pr-3">Savings acct</th>
                  <th className="py-2 pr-3">Loan</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Windows</th>
                  <th className="py-2 pr-3">Effective</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {(mandates as any[]).length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-faint">
                      No mandates yet.
                    </td>
                  </tr>
                )}
                {(mandates as any[]).map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-mono text-xs">{m.savings_account?.account_no}</div>
                      <div className="text-[11px] text-faint">
                        {m.savings_account?.client?.full_name}
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{m.loan?.loan_no}</td>
                    <td className="py-2 pr-3 text-xs capitalize">
                      {String(m.mandate_type).replace(/_/g, " ")}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">
                      {m.mandate_type === "fixed_amount"
                        ? money(Number(m.fixed_amount ?? 0), true)
                        : m.max_amount_per_run
                          ? `≤ ${money(Number(m.max_amount_per_run), true)}`
                          : "—"}
                    </td>
                    <td className="py-2 pr-3 text-[11px]">
                      {m.morning_run ? "AM " : ""}
                      {m.afternoon_run ? "PM" : ""}
                      {!m.morning_run && !m.afternoon_run ? "—" : ""}
                    </td>
                    <td className="py-2 pr-3 text-[11px] text-muted-foreground">
                      {m.effective_from} → {m.effective_to ?? "∞"}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium",
                          m.status === "active" && "bg-emerald-500/15 text-emerald-700",
                          m.status === "pending" && "bg-amber-500/15 text-amber-700",
                          m.status === "suspended" && "bg-slate-500/15 text-slate-700",
                          m.status === "cancelled" && "bg-rose-500/15 text-rose-700",
                        )}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <div className="inline-flex gap-1">
                        {m.status === "pending" && (
                          <button
                            className={cn(btnSecondaryCls, "h-7 px-2 text-[11px]")}
                            onClick={() =>
                              statusM.mutate({ data: { id: m.id, action: "activate" } })
                            }
                          >
                            <CheckCircle2 size={12} className="inline mr-1" /> Activate
                          </button>
                        )}
                        {m.status === "active" && (
                          <button
                            className={cn(btnSecondaryCls, "h-7 px-2 text-[11px]")}
                            onClick={() => {
                              const r = window.prompt("Suspend reason?");
                              if (r) statusM.mutate({ data: { id: m.id, action: "suspend", reason: r } });
                            }}
                          >
                            <PauseCircle size={12} className="inline mr-1" /> Suspend
                          </button>
                        )}
                        {m.status === "suspended" && (
                          <button
                            className={cn(btnSecondaryCls, "h-7 px-2 text-[11px]")}
                            onClick={() =>
                              statusM.mutate({ data: { id: m.id, action: "activate" } })
                            }
                          >
                            Reactivate
                          </button>
                        )}
                        {m.status !== "cancelled" && (
                          <button
                            className={cn(btnSecondaryCls, "h-7 px-2 text-[11px] text-rose-600")}
                            onClick={() => {
                              const r = window.prompt("Cancellation reason?");
                              if (r) statusM.mutate({ data: { id: m.id, action: "cancel", reason: r } });
                            }}
                          >
                            <XCircle size={12} className="inline mr-1" /> Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Window</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Counts</th>
                  <th className="py-2 pr-3 text-right">Collected</th>
                  <th className="py-2 pr-3">Started</th>
                  <th className="py-2 pr-3 text-right">Detail</th>
                </tr>
              </thead>
              <tbody>
                {(runs as any[]).length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-faint">
                      No runs yet.
                    </td>
                  </tr>
                )}
                {(runs as any[]).map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{r.business_date}</td>
                    <td className="py-2 pr-3 text-xs capitalize">{r.run_window}</td>
                    <td className="py-2 pr-3 text-xs capitalize">{r.status}</td>
                    <td className="py-2 pr-3 text-[11px] text-muted-foreground">
                      {Object.entries(r.counts ?? {})
                        .filter(([, v]) => Number(v) > 0)
                        .map(([k, v]) => `${k}:${v}`)
                        .join(" · ") || "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">
                      {money(Number((r.totals ?? {}).collected_amount ?? 0), true)}
                    </td>
                    <td className="py-2 pr-3 text-[11px] text-muted-foreground">
                      {new Date(r.started_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <button
                        onClick={() => setViewRun(r)}
                        className={cn(btnSecondaryCls, "h-7 px-2 text-[11px]")}
                      >
                        <History size={12} className="inline mr-1" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {openCreate && (
        <CreateMandateModal
          accounts={accounts as any[]}
          onClose={() => setOpenCreate(false)}
          onSubmit={(payload) => createM.mutate({ data: payload })}
          pending={createM.isPending}
        />
      )}

      {viewRun && (
        <RunResultsModal run={viewRun} onClose={() => setViewRun(null)} />
      )}
    </div>
  );
}

function CreateMandateModal({
  accounts,
  onClose,
  onSubmit,
  pending,
}: {
  accounts: any[];
  onClose: () => void;
  onSubmit: (payload: any) => void;
  pending: boolean;
}) {
  const [savings_account_id, setSav] = useState("");
  const [loan_id, setLoan] = useState("");
  const [mandate_type, setType] = useState<
    "arrears_only" | "full_installment" | "minimum_due" | "fixed_amount"
  >("arrears_only");
  const [fixed_amount, setFixed] = useState("");
  const [max_amount_per_run, setMax] = useState("");
  const [min_protected_balance, setMin] = useState("");
  const [priority, setPriority] = useState("100");
  const [morning_run, setMorning] = useState(true);
  const [afternoon_run, setAfternoon] = useState(true);
  const [allow_partial, setPartial] = useState(true);
  const [consent_reference, setConsent] = useState("");
  const [effective_to, setEffTo] = useState("");

  const selectedAcct = useMemo(
    () => accounts.find((a) => a.id === savings_account_id),
    [accounts, savings_account_id],
  );
  const clientId = selectedAcct?.client?.id;
  const loansForClient = (selectedAcct?.client?.loans as any[]) ?? [];
  // Filter loans: only same client (we don't have loans in the account payload; user picks a loan_id string).
  const valid =
    savings_account_id &&
    loan_id &&
    consent_reference.length >= 2 &&
    (mandate_type !== "fixed_amount" || Number(fixed_amount) > 0);

  return (
    <Modal open title="New loan repayment mandate" onClose={onClose} width={620}>
      <FormGrid>
        <FormField label="Savings account" required span={12}>
          <select
            value={savings_account_id}
            onChange={(e) => {
              setSav(e.target.value);
              setLoan("");
            }}
            className={selectCls}
          >
            <option value="">Select savings account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_no} — {a.client?.full_name} — {money(Number(a.balance ?? 0))}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Loan ID" required span={12} hint={clientId ? `Client ${clientId.slice(0, 8)}…` : undefined}>
          <input
            className={`${inputCls} font-mono`}
            placeholder="Paste loan UUID"
            value={loan_id}
            onChange={(e) => setLoan(e.target.value.trim())}
          />
          {loansForClient.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {loansForClient.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLoan(l.id)}
                  className="text-[11px] px-1.5 py-0.5 rounded bg-secondary hover:bg-secondary/80"
                >
                  {l.loan_no}
                </button>
              ))}
            </div>
          )}
        </FormField>
        <FormField label="Mandate type" required span={6}>
          <select
            className={selectCls}
            value={mandate_type}
            onChange={(e) => setType(e.target.value as any)}
          >
            {MANDATE_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Priority" span={3}>
          <input
            className={`${inputCls} font-mono`}
            value={priority}
            onChange={(e) => setPriority(e.target.value.replace(/\D/g, ""))}
          />
        </FormField>
        <FormField label="Min protected balance" span={3}>
          <input
            className={`${inputCls} font-mono`}
            inputMode="numeric"
            value={min_protected_balance}
            onChange={(e) => setMin(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0"
          />
        </FormField>
        <FormField label="Fixed amount" span={6}>
          <input
            className={`${inputCls} font-mono`}
            inputMode="numeric"
            disabled={mandate_type !== "fixed_amount"}
            value={fixed_amount}
            onChange={(e) => setFixed(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={mandate_type === "fixed_amount" ? "0.00" : "n/a"}
          />
        </FormField>
        <FormField label="Cap per run" span={6}>
          <input
            className={`${inputCls} font-mono`}
            inputMode="numeric"
            value={max_amount_per_run}
            onChange={(e) => setMax(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Optional"
          />
        </FormField>
        <FormField label="Runs" span={6}>
          <div className="flex gap-3 items-center h-9 text-[12px]">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={morning_run} onChange={(e) => setMorning(e.target.checked)} /> Morning
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={afternoon_run} onChange={(e) => setAfternoon(e.target.checked)} /> Afternoon
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={allow_partial} onChange={(e) => setPartial(e.target.checked)} /> Allow partial
            </label>
          </div>
        </FormField>
        <FormField label="Effective until" span={6}>
          <input
            type="date"
            className={inputCls}
            value={effective_to}
            onChange={(e) => setEffTo(e.target.value)}
          />
        </FormField>
        <FormField label="Consent reference" required span={12}>
          <input
            className={inputCls}
            value={consent_reference}
            onChange={(e) => setConsent(e.target.value)}
            placeholder="Signed mandate form / letter reference"
            maxLength={120}
          />
        </FormField>
      </FormGrid>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={btnSecondaryCls}>
          Cancel
        </button>
        <button
          disabled={!valid || pending}
          onClick={() =>
            onSubmit({
              savings_account_id,
              loan_id,
              mandate_type,
              fixed_amount: fixed_amount ? Number(fixed_amount) : null,
              max_amount_per_run: max_amount_per_run ? Number(max_amount_per_run) : null,
              min_protected_balance: min_protected_balance ? Number(min_protected_balance) : 0,
              priority: Number(priority) || 100,
              morning_run,
              afternoon_run,
              allow_partial,
              consent_reference,
              consent_date: new Date().toISOString().slice(0, 10),
              effective_to: effective_to || null,
            })
          }
          className={btnPrimaryCls}
        >
          {pending ? "Saving…" : "Create mandate"}
        </button>
      </div>
    </Modal>
  );
}

function RunResultsModal({ run, onClose }: { run: any; onClose: () => void }) {
  const listFn = useServerFn(listSavingsAutoCollectionResults);
  const { data: results = [] } = useQuery({
    queryKey: ["savings-auto-results", run.id],
    queryFn: () => listFn({ data: { run_id: run.id } }),
  });
  return (
    <Modal open title={`Run · ${run.business_date} · ${run.run_window}`} onClose={onClose} width={780}>
      <div className="overflow-x-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
              <th className="py-2 pr-3">Savings</th>
              <th className="py-2 pr-3">Loan</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3 text-right">Requested</th>
              <th className="py-2 pr-3 text-right">Collected</th>
              <th className="py-2 pr-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {(results as any[]).length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-faint">
                  No results.
                </td>
              </tr>
            )}
            {(results as any[]).map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="py-2 pr-3">
                  <div className="font-mono text-xs">{r.savings_account?.account_no}</div>
                  <div className="text-[11px] text-faint">
                    {r.savings_account?.client?.full_name}
                  </div>
                </td>
                <td className="py-2 pr-3 font-mono text-xs">{r.loan?.loan_no}</td>
                <td className="py-2 pr-3 text-xs capitalize">{r.status}</td>
                <td className="py-2 pr-3 text-right font-mono text-xs">
                  {money(Number(r.requested ?? 0), true)}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-xs">
                  {money(Number(r.collected ?? 0), true)}
                </td>
                <td className="py-2 pr-3 text-[11px] text-muted-foreground max-w-[240px] truncate" title={r.reason ?? ""}>
                  {r.reason ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
