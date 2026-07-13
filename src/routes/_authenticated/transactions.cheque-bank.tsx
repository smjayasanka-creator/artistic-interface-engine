import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/mzizi/Card";
import { FormGrid, FormField, FormActions, inputCls, selectCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { getActiveCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transactions/cheque-bank")({
  component: ChequeBankPage,
});

function ChequeBankPage() {
  const navigate = useNavigate();
  const [bankAccount, setBankAccount] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeDate, setChequeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [depositDate, setDepositDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [drawerBank, setDrawerBank] = useState("");
  const [drawerName, setDrawerName] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"deposited" | "cleared" | "bounced">("deposited");
  const [narration, setNarration] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const valid = bankAccount && chequeNo && amount && Number(amount) > 0 && drawerName;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setTimeout(() => {
      toast.success(`Cheque ${chequeNo} recorded (${status})`);
      setSubmitting(false);
      navigate({ to: "/transactions" });
    }, 400);
  }

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/transactions" className="text-xs text-primary hover:underline">← Back to transactions</Link>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card className="p-6">
          <FormGrid>
            <FormField label="Deposit into bank account" required span={6}>
              <select value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className={selectCls}>
                <option value="">Select bank account…</option>
                <option value="kcb_current">KCB — Current</option>
                <option value="equity_operating">Equity — Operating</option>
                <option value="coop_settlement">Co-op — Settlement</option>
                <option value="ncba_collections">NCBA — Collections</option>
              </select>
            </FormField>
            <FormField label="Cheque no." required span={3}>
              <input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} className={`${inputCls} font-mono`} maxLength={30} placeholder="000123" />
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

            <FormField label="Cheque date" required span={3}>
              <input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className={`${inputCls} font-mono`} />
            </FormField>
            <FormField label="Deposit date" required span={3}>
              <input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} className={`${inputCls} font-mono`} />
            </FormField>
            <FormField label="Drawer bank" span={3}>
              <input value={drawerBank} onChange={(e) => setDrawerBank(e.target.value)} className={inputCls} maxLength={80} placeholder="e.g. Absa Bank" />
            </FormField>
            <FormField label="Status" span={3}>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={selectCls}>
                <option value="deposited">Deposited</option>
                <option value="cleared">Cleared</option>
                <option value="bounced">Bounced</option>
              </select>
            </FormField>

            <FormField label="Drawer / payer name" required span={6}>
              <input value={drawerName} onChange={(e) => setDrawerName(e.target.value)} className={inputCls} maxLength={120} placeholder="Name on the cheque" />
            </FormField>
            <FormField label="Narration" span={6}>
              <input value={narration} onChange={(e) => setNarration(e.target.value)} className={inputCls} maxLength={200} placeholder="Purpose / loan reference" />
            </FormField>
          </FormGrid>
        </Card>

        <FormActions>
          <Link to="/transactions" className={btnSecondaryCls}>Cancel</Link>
          <button type="submit" disabled={!valid || submitting} className={btnPrimaryCls}>
            {submitting ? "Posting…" : "Post cheque"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}
