import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { listSavingsAccounts, postSavingsTransfer } from "@/lib/savings.functions";
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

export const Route = createFileRoute("/_authenticated/transactions/savings-transfer")({
  component: SavingsTransferPage,
});

function SavingsTransferPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const idem = useMemo(() => `xfer:${crypto.randomUUID()}`, []);

  const listFn = useServerFn(listSavingsAccounts);
  const { data: accounts } = useQuery({
    queryKey: ["savings-accounts", "active"],
    queryFn: () => listFn({ data: { status: "active" } }),
  });

  const transferFn = useServerFn(postSavingsTransfer);
  const submit = useMutation({
    mutationFn: transferFn,
    onSuccess: (res: any) => {
      toast.success(`Transfer posted · ${res?.reference ?? "OK"}`);
      qc.invalidateQueries();
      navigate({ to: "/transactions" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const from = (accounts ?? []).find((a: any) => a.id === fromId);
  const to = (accounts ?? []).find((a: any) => a.id === toId);
  const currencyMismatch =
    from && to && String(from.currency ?? "") !== String(to.currency ?? "");
  const sameAcct = fromId && toId && fromId === toId;
  const valid =
    fromId && toId && !sameAcct && !currencyMismatch && amount && Number(amount) > 0;

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
              from_account_id: fromId,
              to_account_id: toId,
              amount: Number(amount),
              reference: reference || null,
              narration: narration || null,
              idempotency_key: idem,
            },
          });
        }}
        className="flex flex-col gap-4"
      >
        <Card className="p-6">
          <div className="mb-3 text-sm font-semibold">Savings transfer</div>
          <FormGrid>
            <FormField label="From account" required span={6}>
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className={selectCls}
              >
                <option value="">Select source…</option>
                {(accounts ?? []).map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.account_no} — {a.client?.full_name} — {money(Number(a.balance ?? 0))}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="To account" required span={6}>
              <select value={toId} onChange={(e) => setToId(e.target.value)} className={selectCls}>
                <option value="">Select destination…</option>
                {(accounts ?? [])
                  .filter((a: any) => a.id !== fromId)
                  .map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.account_no} — {a.client?.full_name} — {money(Number(a.balance ?? 0))}
                    </option>
                  ))}
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

            <FormField label="Narration" span={12}>
              <input
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                className={inputCls}
                maxLength={200}
                placeholder="Optional description"
              />
            </FormField>
          </FormGrid>

          {sameAcct && (
            <div className="mt-3 rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700">
              From and to accounts must differ.
            </div>
          )}
          {currencyMismatch && (
            <div className="mt-3 rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700">
              Currency mismatch between the selected accounts.
            </div>
          )}
        </Card>

        <FormActions>
          <Link to="/transactions" className={btnSecondaryCls}>
            Cancel
          </Link>
          <button type="submit" disabled={!valid || submit.isPending} className={btnPrimaryCls}>
            {submit.isPending ? "Posting…" : "Post transfer"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}
