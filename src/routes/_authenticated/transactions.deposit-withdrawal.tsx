import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listActiveDeposits, recordDepositWithdrawal } from "@/lib/fd.functions";
import { Card } from "@/components/mzizi/Card";
import { FormGrid, FormField, FormActions, inputCls, selectCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { money, getActiveCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transactions/deposit-withdrawal")({
  component: DepositWithdrawalPage,
});

function DepositWithdrawalPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [depositId, setDepositId] = useState("");
  const [amount, setAmount] = useState("");
  const [txnDate, setTxnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");

  const listFn = useServerFn(listActiveDeposits);
  const { data: deposits } = useQuery({ queryKey: ["active-deposits"], queryFn: () => listFn() });

  const postFn = useServerFn(recordDepositWithdrawal);
  const post = useMutation({
    mutationFn: postFn,
    onSuccess: () => {
      toast.success("Withdrawal posted");
      qc.invalidateQueries();
      navigate({ to: "/transactions" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = (deposits ?? []).find((d: any) => d.id === depositId);
  const valid =
    depositId &&
    amount &&
    Number(amount) > 0 &&
    txnDate &&
    (!selected || Number(amount) <= Number(selected.principal));

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/transactions" className="text-xs text-primary hover:underline">← Back to transactions</Link>
      <div>
        <h1 className="text-xl font-semibold">Deposit Withdrawal</h1>
        <p className="text-sm text-muted-foreground mt-1">Record a withdrawal against an active fixed deposit.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          post.mutate({
            data: {
              deposit_id: depositId,
              amount: Number(amount),
              txn_date: txnDate,
              ...(reference ? { reference } : {}),
            },
          });
        }}
        className="flex flex-col gap-4"
      >
        <Card className="p-6">
          <FormGrid>
            <FormField label="Deposit" required span={8}>
              <select value={depositId} onChange={(e) => setDepositId(e.target.value)} className={selectCls}>
                <option value="">Select active deposit…</option>
                {(deposits ?? []).map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.certificate_no} — {d.client?.full_name} — {money(Number(d.principal))}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Date" required span={2}>
              <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} className={`${inputCls} font-mono`} />
            </FormField>
            <FormField
              label={`Amount (${getActiveCurrency()})`}
              required
              span={2}
              error={selected && amount && Number(amount) > Number(selected.principal) ? "Exceeds principal" : undefined}
              hint={selected ? `Max ${money(Number(selected.principal))}` : undefined}
            >
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0"
                className={`${inputCls} font-mono font-semibold`}
              />
            </FormField>
            <FormField label="Reference" span={12}>
              <input value={reference} onChange={(e) => setReference(e.target.value)} className={`${inputCls} font-mono`} maxLength={120} placeholder="Payout voucher / bank / M-Pesa reference" />
            </FormField>
          </FormGrid>
        </Card>

        <FormActions>
          <Link to="/transactions" className={btnSecondaryCls}>Cancel</Link>
          <button type="submit" disabled={!valid || post.isPending} className={btnPrimaryCls}>
            {post.isPending ? "Posting…" : "Post withdrawal"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}
