import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, HandCoins, X, Search } from "lucide-react";
import { listWriteOffs, recordWriteOffRecovery } from "@/lib/write-off.functions";
import { Card } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/lib/payment-methods";

export const Route = createFileRoute("/_authenticated/transactions/write-off-collection")({
  component: WriteOffCollectionPage,
});

const fmt = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function WriteOffCollectionPage() {
  const qc = useQueryClient();
  const writeOffsFn = useServerFn(listWriteOffs);
  const writeOffsQ = useQuery({ queryKey: ["write-offs"], queryFn: () => writeOffsFn() });
  const [q, setQ] = useState("");
  const [recoveryModal, setRecoveryModal] = useState<any | null>(null);

  const rows = useMemo(() => {
    const list = (writeOffsQ.data ?? []).filter((w: any) => !w.is_fully_recovered);
    if (!q.trim()) return list;
    const t = q.trim().toLowerCase();
    return list.filter(
      (w: any) =>
        (w.facility_no ?? "").toLowerCase().includes(t) ||
        (w.client_name ?? "").toLowerCase().includes(t),
    );
  }, [writeOffsQ.data, q]);

  return (
    <div className="animate-fadein space-y-6">
      <div>
        <Link
          to="/transactions"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Back to Transactions
        </Link>
        <h1 className="text-xl font-semibold mt-2">Write-off collection</h1>
        <p className="text-sm text-muted-foreground">
          Record recoveries against written-off facilities. Posts DR Cash / CR Bad Debt Recovery.
        </p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <div className="font-semibold text-[14px]">Facilities with outstanding write-offs</div>
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className={cn(inputCls, "h-8 pl-7 w-56 text-[12.5px]")}
              placeholder="Facility no or client"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-faint">
              <tr>
                <th className="text-left px-3 py-2">Facility</th>
                <th className="text-left px-3 py-2">Client</th>
                <th className="text-left px-3 py-2">Write-off date</th>
                <th className="text-right px-3 py-2">Total written off</th>
                <th className="text-right px-3 py-2">Recovered</th>
                <th className="text-right px-3 py-2">Outstanding</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {writeOffsQ.isLoading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-faint">
                    Loading…
                  </td>
                </tr>
              )}
              {!writeOffsQ.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-faint">
                    No outstanding write-offs.
                  </td>
                </tr>
              )}
              {rows.map((w: any) => {
                const outstanding = Number(w.total_written_off) - Number(w.total_recovered);
                return (
                  <tr key={w.id} className="border-t border-row-divider">
                    <td className="px-3 py-2 font-mono">
                      {w.facility_no ?? w.loan_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2">{w.client_name}</td>
                    <td className="px-3 py-2 text-faint">
                      {String(w.write_off_date).slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(w.total_written_off)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(w.total_recovered)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {fmt(outstanding)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setRecoveryModal(w)}
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11.5px] font-semibold border border-primary/40 text-primary hover:bg-primary/10"
                      >
                        <HandCoins size={12} /> Collect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {recoveryModal && (
        <RecoveryModal
          writeOff={recoveryModal}
          onClose={() => setRecoveryModal(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["write-offs"] });
            setRecoveryModal(null);
          }}
        />
      )}
    </div>
  );
}

function RecoveryModal({
  writeOff,
  onClose,
  onDone,
}: {
  writeOff: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const recFn = useServerFn(recordWriteOffRecovery);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [principal, setPrincipal] = useState(0);
  const [interest, setInterest] = useState(0);
  const [charges, setCharges] = useState(0);
  const [method, setMethod] = useState<string>("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const dueP = Number(writeOff.principal_written_off) - Number(writeOff.principal_recovered);
  const dueI = Number(writeOff.interest_written_off) - Number(writeOff.interest_recovered);
  const dueC = Number(writeOff.charges_written_off) - Number(writeOff.charges_recovered);
  const dueTotal = Number(writeOff.total_written_off) - Number(writeOff.total_recovered);
  const amount = useMemo(
    () => Number(principal || 0) + Number(interest || 0) + Number(charges || 0),
    [principal, interest, charges],
  );

  const m = useMutation({
    mutationFn: () =>
      recFn({
        data: {
          write_off_id: writeOff.id,
          recovery_date: date,
          amount,
          principal: Number(principal || 0),
          interest: Number(interest || 0),
          charges: Number(charges || 0),
          payment_method: method,
          reference: reference || undefined,
          notes: notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Recovery recorded");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalid =
    amount <= 0 ||
    Number(principal) > dueP + 0.01 ||
    Number(interest) > dueI + 0.01 ||
    Number(charges) > dueC + 0.01 ||
    amount > dueTotal + 0.01 ||
    !method;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="font-semibold text-[15px]">
            Record recovery — {writeOff.facility_no ?? writeOff.loan_id.slice(0, 8)}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="text-[12.5px] bg-secondary/40 border border-border rounded-md px-3 py-2 grid grid-cols-4 gap-3">
            <div>
              <div className="text-[10.5px] uppercase text-faint">Capital due</div>
              <div className="font-mono">{fmt(dueP)}</div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase text-faint">Interest due</div>
              <div className="font-mono">{fmt(dueI)}</div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase text-faint">Charges due</div>
              <div className="font-mono">{fmt(dueC)}</div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase text-faint">Total due</div>
              <div className="font-mono font-semibold">{fmt(dueTotal)}</div>
            </div>
          </div>
          <FormGrid>
            <FormField label="Recovery date" required span={6}>
              <input
                type="date"
                className={inputCls}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </FormField>
            <FormField label="Payment method" required span={6}>
              <select
                className={inputCls}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map((p) => (
                  <option key={p} value={p}>
                    {p.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Principal recovered" span={4}>
              <input
                type="number"
                step="0.01"
                className={cn(inputCls, "text-right font-mono")}
                value={principal}
                onChange={(e) => setPrincipal(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Interest recovered" span={4}>
              <input
                type="number"
                step="0.01"
                className={cn(inputCls, "text-right font-mono")}
                value={interest}
                onChange={(e) => setInterest(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Charges recovered" span={4}>
              <input
                type="number"
                step="0.01"
                className={cn(inputCls, "text-right font-mono")}
                value={charges}
                onChange={(e) => setCharges(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Reference (cheque/transfer no)" span={6}>
              <input
                className={inputCls}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </FormField>
            <FormField label="Notes" span={6}>
              <input
                className={inputCls}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </FormField>
          </FormGrid>
          <div className="flex items-center justify-end text-[13px] gap-2">
            <span className="text-faint">Total recovery:</span>
            <span className="font-mono font-semibold">{fmt(amount)}</span>
          </div>
          <FormActions>
            <button className={btnSecondaryCls} onClick={onClose} disabled={m.isPending}>
              Cancel
            </button>
            <button
              className={btnPrimaryCls}
              disabled={invalid || m.isPending}
              onClick={() => m.mutate()}
            >
              {m.isPending ? "Posting…" : "Post recovery"}
            </button>
          </FormActions>
        </div>
      </div>
    </div>
  );
}
