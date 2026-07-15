import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listSavingsAccounts, postSavingsTransaction } from "@/lib/savings.functions";
import { Card } from "@/components/mzizi/Card";
import { FormGrid, FormField, FormActions, inputCls, selectCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { money, getActiveCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transactions/savings-withdrawal")({
  component: SavingsWithdrawalPage,
});

function SavingsWithdrawalPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");

  const listFn = useServerFn(listSavingsAccounts);
  const { data: accounts } = useQuery({
    queryKey: ["savings-accounts", "active"],
    queryFn: () => listFn({ data: { status: "active" } }),
  });

  const postFn = useServerFn(postSavingsTransaction);
  const post = useMutation({
    mutationFn: postFn,
    onSuccess: () => {
      toast.success("Withdrawal posted");
      qc.invalidateQueries();
      navigate({ to: "/transactions" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = (accounts ?? []).find((a: any) => a.id === accountId);
  const available = selected ? Number(selected.available_balance ?? selected.balance ?? 0) : 0;
  const exceeds = !!(selected && amount && Number(amount) > available);
  const valid = accountId && amount && Number(amount) > 0 && !exceeds;

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/transactions" className="text-xs text-primary hover:underline">← Back to transactions</Link>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          post.mutate({
            data: {
              account_id: accountId,
              txn_type: "withdrawal",
              amount: Number(amount),
              channel: "branch",
              reference: reference || null,
              narration: narration || null,
            },
          });
        }}
        className="flex flex-col gap-4"
      >
        <Card className="p-6">
          <FormGrid>
            <FormField label="Savings account" required span={8}>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectCls}>
                <option value="">Select active account…</option>
                {(accounts ?? []).map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.account_no} — {a.client?.full_name} — {money(Number(a.balance ?? 0))}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label={`Amount (${getActiveCurrency()})`}
              required
              span={4}
              error={exceeds ? "Exceeds available balance" : undefined}
              hint={selected ? `Available ${money(available)}` : undefined}
            >
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0"
                className={`${inputCls} font-mono font-semibold`}
              />
            </FormField>
            <FormField label="Reference" span={4}>
              <input value={reference} onChange={(e) => setReference(e.target.value)} className={`${inputCls} font-mono`} maxLength={120} placeholder="Voucher / slip no." />
            </FormField>
            <FormField label="Narration" span={8}>
              <input value={narration} onChange={(e) => setNarration(e.target.value)} className={inputCls} maxLength={200} placeholder="Optional description" />
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
