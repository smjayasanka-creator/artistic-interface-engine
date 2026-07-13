import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { Card } from "@/components/mzizi/Card";
import { FormGrid, FormField, FormActions, inputCls, selectCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { getActiveCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/transactions/cash-wallet")({
  component: CashWalletTransferPage,
});

type Direction = "cash_to_wallet" | "wallet_to_cash";

function CashWalletTransferPage() {
  const navigate = useNavigate();
  const [direction, setDirection] = useState<Direction>("cash_to_wallet");
  const [wallet, setWallet] = useState("");
  const [amount, setAmount] = useState("");
  const [txnDate, setTxnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const valid = wallet && amount && Number(amount) > 0 && txnDate;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setTimeout(() => {
      toast.success(direction === "cash_to_wallet" ? "Cash moved to wallet" : "Wallet cashed out");
      setSubmitting(false);
      navigate({ to: "/transactions" });
    }, 400);
  }

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/transactions" className="text-xs text-primary hover:underline">← Back to transactions</Link>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-2">
            <div className="grid grid-cols-2 rounded-lg border border-border overflow-hidden text-[12px] font-medium">
              {(["cash_to_wallet", "wallet_to_cash"] as Direction[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={cn(
                    "px-3.5 py-1.5 flex items-center gap-1.5 transition-colors",
                    direction === d ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                  )}
                >
                  <ArrowLeftRight size={13} />
                  {d === "cash_to_wallet" ? "Cash → Wallet" : "Wallet → Cash"}
                </button>
              ))}
            </div>
          </div>

          <FormGrid>
            <FormField label="Wallet" required span={6}>
              <select value={wallet} onChange={(e) => setWallet(e.target.value)} className={selectCls}>
                <option value="">Select wallet…</option>
                <option value="mpesa_paybill">M-Pesa Paybill</option>
                <option value="mpesa_till">M-Pesa Till</option>
                <option value="airtel_money">Airtel Money</option>
                <option value="agent_float">Agent Float</option>
              </select>
            </FormField>
            <FormField label="Date" required span={3}>
              <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} className={`${inputCls} font-mono`} />
            </FormField>
            <FormField label={`Amount (${getActiveCurrency()})`} required span={3}>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0"
                className={`${inputCls} font-mono font-semibold`}
              />
            </FormField>
            <FormField label="Reference" span={6}>
              <input value={reference} onChange={(e) => setReference(e.target.value)} className={`${inputCls} font-mono`} maxLength={120} placeholder="Wallet txn ID / receipt no." />
            </FormField>
            <FormField label="Narration" span={6}>
              <input value={narration} onChange={(e) => setNarration(e.target.value)} className={inputCls} maxLength={200} placeholder="Purpose of transfer" />
            </FormField>
          </FormGrid>
        </Card>

        <FormActions>
          <Link to="/transactions" className={btnSecondaryCls}>Cancel</Link>
          <button type="submit" disabled={!valid || submitting} className={btnPrimaryCls}>
            {submitting ? "Posting…" : "Post transfer"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}
