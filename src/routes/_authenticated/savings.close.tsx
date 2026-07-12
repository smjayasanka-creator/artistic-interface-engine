import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
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
import {
  listSavingsAccounts,
  closeSavingsAccount,
  listAccountTransactions,
} from "@/lib/savings.functions";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/savings/close")({
  component: CloseSavings,
});

const CHANNELS = [
  { v: "branch", l: "Branch counter" },
  { v: "atm", l: "ATM" },
  { v: "ceft", l: "CEFT" },
  { v: "internet_banking", l: "Internet Banking" },
  { v: "mobile", l: "Mobile" },
  { v: "api", l: "External API" },
  { v: "other", l: "Other" },
];

function CloseSavings() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listSavingsAccounts);
  const txnFn = useServerFn(listAccountTransactions);
  const closeFn = useServerFn(closeSavingsAccount);

  const { data: accounts } = useQuery({
    queryKey: ["savings-accounts", "active"],
    queryFn: () => listFn({ data: { status: "active" } }),
  });

  const [accountId, setAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [channel, setChannel] = useState("branch");
  const [externalRef, setExternalRef] = useState("");

  const account = useMemo(
    () => (accounts ?? []).find((a: any) => a.id === accountId),
    [accounts, accountId],
  );

  const { data: txns } = useQuery({
    queryKey: ["savings-txns", accountId],
    queryFn: () => txnFn({ data: { account_id: accountId } }),
    enabled: !!accountId,
  });

  const closureFee = Number((account as any)?.product?.closure_fee ?? 0);
  const balance = Number((account as any)?.balance ?? 0);
  const payout = Math.max(0, balance - closureFee);

  const closeM = useMutation({
    mutationFn: () =>
      closeFn({
        data: {
          account_id: accountId,
          reason,
          payout_channel: channel as any,
          external_ref: externalRef || null,
        },
      }),
    onSuccess: () => {
      toast.success("Account closed");
      qc.invalidateQueries({ queryKey: ["savings-accounts"] });
      navigate({ to: "/savings" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to close"),
  });

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Card>
        <div className="mb-3">
          <div className="text-sm font-semibold">Close Savings Account</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Applies closure fee (if any), pays out remaining balance and marks the account closed.
          </div>
        </div>

        <FormGrid>
          <FormField label="Account" required span={12}>
            <select
              className={selectCls}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Select an active account…</option>
              {(accounts ?? []).map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.account_no} — {a.client?.full_name} — {money(a.balance, true)}
                </option>
              ))}
            </select>
          </FormField>
        </FormGrid>

        {account && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-md border border-border p-3">
              <div className="text-[11px] uppercase text-faint">Current Balance</div>
              <div className="text-lg font-semibold">{money(balance, true)}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-[11px] uppercase text-faint">Closure Fee</div>
              <div className="text-lg font-semibold">{money(closureFee, true)}</div>
            </div>
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
              <div className="text-[11px] uppercase text-faint">Payout to Customer</div>
              <div className="text-lg font-semibold text-primary">{money(payout, true)}</div>
            </div>
          </div>
        )}

        <FormGrid className="mt-4">
          <FormField label="Reason" required span={12}>
            <input
              className={inputCls}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer request / relocated / consolidation"
            />
          </FormField>
          <FormField label="Payout Channel" span={6}>
            <select className={selectCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.l}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="External Reference" span={6}>
            <input
              className={inputCls}
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              placeholder="External payout ref"
            />
          </FormField>
        </FormGrid>

        {balance < 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
            <AlertTriangle size={14} /> Account is in overdraft — settle before closure.
          </div>
        )}

        <FormActions align="between">
          <button className={btnSecondaryCls} onClick={() => navigate({ to: "/savings" })}>
            Cancel
          </button>
          <button
            className={btnPrimaryCls}
            disabled={!accountId || reason.length < 3 || balance < 0 || closeM.isPending}
            onClick={() => closeM.mutate()}
          >
            {closeM.isPending ? "Closing…" : "Close Account"}
          </button>
        </FormActions>
      </Card>

      {account && (
        <Card>
          <div className="mb-3 text-sm font-semibold">Recent transactions</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Channel</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3 text-right">Balance</th>
                  <th className="py-2 pr-3">Reference</th>
                </tr>
              </thead>
              <tbody>
                {(txns ?? []).map((t: any) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 text-xs">{t.txn_date}</td>
                    <td className="py-2 pr-3 capitalize text-xs">{t.txn_type}</td>
                    <td className="py-2 pr-3 capitalize text-xs">{t.channel}</td>
                    <td className="py-2 pr-3 text-right font-mono">{money(t.amount, true)}</td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {money(t.running_balance, true)}
                    </td>
                    <td className="py-2 pr-3 text-xs">{t.reference ?? "—"}</td>
                  </tr>
                ))}
                {!txns?.length && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-muted-foreground text-sm">
                      No transactions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
