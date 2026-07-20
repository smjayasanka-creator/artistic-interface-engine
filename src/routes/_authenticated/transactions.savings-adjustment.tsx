import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { listSavingsAccounts, postSavingsAdjustment } from "@/lib/savings.functions";
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

export const Route = createFileRoute("/_authenticated/transactions/savings-adjustment")({
  component: SavingsAdjustmentPage,
});

function SavingsAdjustmentPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const idem = useMemo(() => `adj:${crypto.randomUUID()}`, []);

  const listFn = useServerFn(listSavingsAccounts);
  const { data: accounts } = useQuery({
    queryKey: ["savings-accounts", "active"],
    queryFn: () => listFn({ data: { status: "active" } }),
  });

  const adjFn = useServerFn(postSavingsAdjustment);
  const submit = useMutation({
    mutationFn: adjFn,
    onSuccess: () => {
      toast.success("Adjustment posted");
      qc.invalidateQueries();
      navigate({ to: "/transactions" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = accountId && amount && Number(amount) > 0 && reason.trim().length >= 3;

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/transactions" className="text-xs text-primary hover:underline">
        ← Back to transactions
      </Link>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          submit.mutate({
            data: {
              account_id: accountId,
              direction,
              amount: Number(amount),
              reason: reason.trim(),
              reference: reference || null,
              idempotency_key: idem,
            },
          });
        }}
        className="flex flex-col gap-4"
      >
        <Card className="p-6">
          <div className="mb-3 text-sm font-semibold">Savings adjustment</div>
          <FormGrid>
            <FormField label="Savings account" required span={8}>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={selectCls}
              >
                <option value="">Select account…</option>
                {(accounts ?? []).map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.account_no} — {a.client?.full_name} — {money(Number(a.balance ?? 0))}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Direction" required span={4}>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as any)}
                className={selectCls}
              >
                <option value="credit">Credit (increase balance)</option>
                <option value="debit">Debit (decrease balance)</option>
              </select>
            </FormField>
            <FormField label={`Amount (${getActiveCurrency()})`} required span={4}>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0"
                className={`${inputCls} font-mono font-semibold`}
              />
            </FormField>
            <FormField label="Reference" span={4}>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className={inputCls}
                maxLength={60}
                placeholder="Optional"
              />
            </FormField>
            <FormField label="Reason" required span={12}>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={inputCls}
                maxLength={200}
                placeholder="Why is this adjustment being posted?"
              />
            </FormField>
          </FormGrid>
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            Adjustments post directly to the account ledger and general ledger. Use only for
            authorised corrections.
          </div>
        </Card>

        <FormActions>
          <Link to="/transactions" className={btnSecondaryCls}>
            Cancel
          </Link>
          <button type="submit" disabled={!valid || submit.isPending} className={btnPrimaryCls}>
            {submit.isPending ? "Posting…" : "Post adjustment"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}
