import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowLeft,
  FileText,
  Receipt,
  Lock,
  Repeat,
  Percent,
  Users,
  BookMarked,
  History,
} from "lucide-react";
import { Card } from "@/components/mzizi/Card";
import { StatusBadge } from "@/components/mzizi/Badge";
import { getSavingsAccountDetail, activateSavingsAccount } from "@/lib/savings.functions";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/savings/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["savings-account-detail", params.id],
      queryFn: () => getSavingsAccountDetail({ data: { id: params.id } }),
    }),
  component: SavingsDetail,
  errorComponent: DetailError,
  notFoundComponent: DetailNotFound,
});

function DetailError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="max-w-lg mx-auto py-10 space-y-3">
      <p className="text-sm text-destructive">{error.message}</p>
      <button
        className="text-[12px] text-primary hover:underline"
        onClick={() => {
          reset();
          router.invalidate();
        }}
      >
        Retry
      </button>
    </div>
  );
}

function DetailNotFound() {
  return (
    <div className="max-w-lg mx-auto py-10 text-sm text-faint">
      Savings account not found.{" "}
      <Link to="/savings" className="text-primary">
        Back to savings
      </Link>
    </div>
  );
}

type TabKey =
  | "overview"
  | "transactions"
  | "holds"
  | "mandates"
  | "interest"
  | "holders"
  | "passbook"
  | "audit";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "overview", label: "Overview", icon: FileText },
  { key: "transactions", label: "Transactions", icon: Receipt },
  { key: "holds", label: "Holds & Blocks", icon: Lock },
  { key: "mandates", label: "Loan Mandates", icon: Repeat },
  { key: "interest", label: "Interest / WHT", icon: Percent },
  { key: "holders", label: "Holders & Nominees", icon: Users },
  { key: "passbook", label: "Passbook", icon: BookMarked },
  { key: "audit", label: "Audit", icon: History },
];

function SavingsDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getSavingsAccountDetail);
  const { data } = useQuery({
    queryKey: ["savings-account-detail", id],
    queryFn: () => fn({ data: { id } }),
  });
  const [tab, setTab] = useState<TabKey>("overview");

  if (!data) return null;
  const a: any = data.account;
  const activeHolds = data.holds.filter((h: any) => h.active);
  const heldAmount = activeHolds.reduce((s: number, h: any) => s + Number(h.amount ?? 0), 0);

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Link to="/savings" className="text-[12px] text-faint hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft size={12} /> Back
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
              Savings account
            </div>
            <div className="mt-0.5 text-xl font-semibold font-mono">{a.account_no}</div>
            <div className="text-[12.5px] text-muted-foreground mt-0.5">
              {a.client?.full_name} · {a.product?.name} · {a.branch?.name}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={String(a.status)} />
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">Balance</div>
              <div className="text-lg font-semibold font-mono">{money(a.balance)}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">Available</div>
              <div className="text-lg font-semibold font-mono">{money(a.available_balance)}</div>
            </div>
          </div>
        </div>
        {activeHolds.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
            {activeHolds.length} active hold{activeHolds.length > 1 ? "s" : ""} — {money(heldAmount)} restricted
          </div>
        )}
        <LifecycleBanner account={a} accountId={id} />
      </Card>


      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 h-9 text-[12.5px] rounded-t-md border-b-2 -mb-px",
                active
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <OverviewTab d={data} />}
      {tab === "transactions" && <TxnsTab rows={data.transactions} />}
      {tab === "holds" && <HoldsTab rows={data.holds} accountId={id} />}
      {tab === "mandates" && <MandatesTab rows={data.mandates} />}
      {tab === "interest" && <InterestTab accruals={data.accruals} postings={data.postings} />}
      {tab === "holders" && <HoldersTab holders={data.holders} nominees={data.nominees} mandate={data.signing_mandate} />}
      {tab === "passbook" && <PassbookTab accountId={id} />}
      {tab === "audit" && <AuditTab accountId={id} />}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[12.5px] py-1 border-b border-border/60 last:border-0">
      <div className="text-faint">{k}</div>
      <div className="font-medium text-right">{v ?? "—"}</div>
    </div>
  );
}

function OverviewTab({ d }: { d: any }) {
  const a = d.account;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card>
        <div className="text-sm font-semibold mb-2">Account</div>
        <KV k="Currency" v={a.currency} />
        <KV k="Opened" v={shortDate(a.opened_on)} />
        <KV k="Closed" v={a.closed_on ? shortDate(a.closed_on) : "—"} />
        <KV k="Uncleared" v={money(a.uncleared_balance)} />
        <KV k="Interest accrued" v={money(a.interest_accrued)} />
        <KV k="External ref" v={a.external_ref} />
        <KV k="Statement" v={a.statement_preference} />
        <KV k="Communication" v={a.communication_preference} />
      </Card>
      <Card>
        <div className="text-sm font-semibold mb-2">Customer</div>
        <KV k="Name" v={a.client?.full_name} />
        <KV k="NIC" v={a.client?.nic} />
        <KV k="Phone" v={a.client?.phone} />
        <KV k="Email" v={a.client?.email} />
        <div className="mt-2 text-[12px] text-primary">
          <Link to="/clients/$id" params={{ id: a.client?.id ?? "" }}>Open customer profile →</Link>
        </div>
      </Card>
    </div>
  );
}

function TxnsTab({ rows }: { rows: any[] }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Reference</th>
              <th className="py-2 pr-3">Narration</th>
              <th className="py-2 pr-3 text-right">Amount</th>
              <th className="py-2 pr-3 text-right">Running</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="py-2 pr-3 text-xs">{shortDate(r.created_at)}</td>
                <td className="py-2 pr-3 capitalize text-xs">{r.txn_type}</td>
                <td className="py-2 pr-3 font-mono text-xs">{r.reference}</td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">{r.narration}</td>
                <td className="py-2 pr-3 text-right font-mono">{money(r.amount, true)}</td>
                <td className="py-2 pr-3 text-right font-mono">{money(r.running_balance, true)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="py-6 text-center text-muted-foreground text-sm">No transactions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function HoldsTab({ rows, accountId }: { rows: any[]; accountId: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Holds & Blocks</div>
        <Link to="/savings/holds" search={{ account_id: accountId } as any} className="text-[12px] text-primary">Manage →</Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3 text-right">Amount</th>
              <th className="py-2 pr-3">Reason</th>
              <th className="py-2 pr-3">Expires</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Release</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id} className="border-b border-border last:border-0">
                <td className="py-2 pr-3 capitalize text-xs">{h.hold_type}</td>
                <td className="py-2 pr-3 text-right font-mono">{money(h.amount, true)}</td>
                <td className="py-2 pr-3 text-xs">{h.reason}</td>
                <td className="py-2 pr-3 text-xs">{h.expires_at ? shortDate(h.expires_at) : "—"}</td>
                <td className="py-2 pr-3 text-xs">{h.active ? "Active" : "Released"}</td>
                <td className="py-2 pr-3 text-xs capitalize">{h.release_status}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="py-6 text-center text-muted-foreground text-sm">No holds recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MandatesTab({ rows }: { rows: any[] }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Loan repayment mandates</div>
        <Link to="/savings/mandates" className="text-[12px] text-primary">Manage →</Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
              <th className="py-2 pr-3">Loan</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3 text-right">Cap / run</th>
              <th className="py-2 pr-3 text-right">Min protected</th>
              <th className="py-2 pr-3">Runs</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="py-2 pr-3 font-mono text-xs">{m.loan?.loan_no}</td>
                <td className="py-2 pr-3 capitalize text-xs">{m.mandate_type}</td>
                <td className="py-2 pr-3 text-right font-mono">{m.max_amount_per_run ? money(m.max_amount_per_run, true) : "—"}</td>
                <td className="py-2 pr-3 text-right font-mono">{money(m.min_protected_balance, true)}</td>
                <td className="py-2 pr-3 text-xs">
                  {[m.morning_run && "AM", m.afternoon_run && "PM"].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="py-2 pr-3 text-xs capitalize">{m.status}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="py-6 text-center text-muted-foreground text-sm">No mandates configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function InterestTab({ accruals, postings }: { accruals: any[]; postings: any[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card>
        <div className="text-sm font-semibold mb-2">Daily accruals</div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3 text-right">Eligible</th>
                <th className="py-2 pr-3 text-right">Rate %</th>
                <th className="py-2 pr-3 text-right">Interest</th>
              </tr>
            </thead>
            <tbody>
              {accruals.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-3 text-xs">{shortDate(r.accrual_date)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-xs">{money(r.eligible_balance, true)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-xs">{Number(r.rate_pct).toFixed(4)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-xs">{money(r.gross_interest, true)}</td>
                </tr>
              ))}
              {!accruals.length && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-sm">No accruals yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <div className="text-sm font-semibold mb-2">Capitalizations & WHT</div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                <th className="py-2 pr-3">Period</th>
                <th className="py-2 pr-3 text-right">Gross</th>
                <th className="py-2 pr-3 text-right">WHT</th>
                <th className="py-2 pr-3 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {postings.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-3 text-xs">{shortDate(r.period_start)} → {shortDate(r.period_end)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-xs">{money(r.gross_interest, true)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-xs">{money(r.wht_amount, true)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-xs">{money(r.net_interest, true)}</td>
                </tr>
              ))}
              {!postings.length && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-sm">No capitalizations yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function HoldersTab({ holders, nominees, mandate }: { holders: any[]; nominees: any[]; mandate: any }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card>
        <div className="text-sm font-semibold mb-2">Holders</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3 text-right">Ownership %</th>
              <th className="py-2 pr-3">Signatory</th>
            </tr>
          </thead>
          <tbody>
            {holders.map((h) => (
              <tr key={h.id} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-3 capitalize text-xs">{h.role}</td>
                <td className="py-1.5 pr-3 text-xs">{h.client?.full_name ?? h.full_name}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-xs">{h.ownership_pct ?? "—"}</td>
                <td className="py-1.5 pr-3 text-xs">{h.is_signatory ? "Yes" : "No"}</td>
              </tr>
            ))}
            {!holders.length && <tr><td colSpan={4} className="py-4 text-center text-muted-foreground text-sm">No holders.</td></tr>}
          </tbody>
        </table>
        {mandate && (
          <div className="mt-3 text-[12px] text-muted-foreground">
            Signing rule: <span className="font-medium capitalize">{mandate.signing_rule.replace(/_/g, " ")}</span>
            {mandate.min_signatories ? ` · ${mandate.min_signatories} min` : ""}
          </div>
        )}
      </Card>
      <Card>
        <div className="text-sm font-semibold mb-2">Nominees</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Relation</th>
              <th className="py-2 pr-3 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {nominees.map((n) => (
              <tr key={n.id} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-3 text-xs">{n.full_name}</td>
                <td className="py-1.5 pr-3 text-xs">{n.relation}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-xs">{n.percentage}</td>
              </tr>
            ))}
            {!nominees.length && <tr><td colSpan={3} className="py-4 text-center text-muted-foreground text-sm">No nominees.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function PassbookTab({ accountId: _accountId }: { accountId: string }) {
  return (
    <Card>
      <div className="text-sm font-semibold mb-2">Passbook</div>
      <p className="text-[12.5px] text-muted-foreground">
        Issue and manage passbooks from the{" "}
        <Link to="/savings/passbook" className="text-primary">passbook stock workspace</Link>.
      </p>
    </Card>
  );
}

function AuditTab({ accountId: _accountId }: { accountId: string }) {
  return (
    <Card>
      <div className="text-sm font-semibold mb-2">Audit trail</div>
      <p className="text-[12.5px] text-muted-foreground">
        Every state change on this account is captured in the global{" "}
        <Link to="/audit-log" className="text-primary">audit log</Link>. Filter by reference to see entries for this account.
      </p>
    </Card>
  );
}

function LifecycleBanner({ account, accountId }: { account: any; accountId: string }) {
  const router = useRouter();
  const activate = useServerFn(activateSavingsAccount);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState<string>(
    account.pending_opening_deposit != null ? String(account.pending_opening_deposit) : "",
  );
  const status = String(account.status);

  if (status === "pending_approval") {
    return (
      <div className="mt-3 rounded-md border border-blue-500/40 bg-blue-500/5 px-3 py-2 text-[12px] text-blue-800 dark:text-blue-200">
        Awaiting workflow approval. No money has been moved. Once approved the account will move to <b>pending funding</b>.
      </div>
    );
  }
  if (status !== "pending_funding") return null;

  const onActivate = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid initial deposit");
      return;
    }
    setBusy(true);
    try {
      await activate({
        data: {
          account_id: accountId,
          opening_deposit: value,
          payment_method: (account.pending_payment_method ?? null) as any,
          payment_details: (account.pending_payment_details ?? null) as any,
          idempotency_key: `activate:${accountId}`,
        },
      });
      toast.success("Account activated with initial deposit");
      router.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Activation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2.5 text-[12.5px] text-emerald-900 dark:text-emerald-100 space-y-2">
      <div>
        Approved — awaiting <b>initial deposit</b> to activate. Ledger entries will use the product's configured GL accounts.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px]">Initial deposit</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="editable-cell px-2 py-1 rounded border border-input bg-background font-mono text-[12px] w-32"
        />
        <button
          onClick={onActivate}
          disabled={busy}
          className="px-3 py-1 rounded bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-50"
        >
          {busy ? "Activating…" : "Activate account"}
        </button>
      </div>
    </div>
  );
}

