import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertOctagon, ArrowLeft, HandCoins, X, Eye } from "lucide-react";
import {
  listWriteOffCandidates,
  listWriteOffs,
  listWriteOffRecoveries,
  recordWriteOffRecovery,
} from "@/lib/write-off.functions";
import { writeOffLoan } from "@/lib/lifecycle.functions";
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

export const Route = createFileRoute("/_authenticated/loans/write-off")({
  component: WriteOffWorkspace,
});

const fmt = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function WriteOffWorkspace() {
  const qc = useQueryClient();
  const candidatesFn = useServerFn(listWriteOffCandidates);
  const writeOffsFn = useServerFn(listWriteOffs);
  const writeOffFn = useServerFn(writeOffLoan);

  const candidatesQ = useQuery({
    queryKey: ["write-off-candidates"],
    queryFn: () => candidatesFn(),
  });
  const writeOffsQ = useQuery({ queryKey: ["write-offs"], queryFn: () => writeOffsFn() });

  const [woModal, setWoModal] = useState<null | {
    id: string;
    contract_no: string | null;
    client_name: string;
    outstanding_total: number;
  }>(null);
  const [recoveryModal, setRecoveryModal] = useState<null | any>(null);
  const [viewModal, setViewModal] = useState<null | any>(null);

  const woM = useMutation({
    mutationFn: (v: { loan_id: string; reason: string; use_provision: boolean }) =>
      writeOffFn({
        data: {
          loan_id: v.loan_id,
          reason: v.reason,
          use_provision: v.use_provision,
          idempotency_key: `loan:writeoff:${v.loan_id}`,
        },
      }),
    onSuccess: () => {
      toast.success("Loan written off");
      setWoModal(null);
      qc.invalidateQueries({ queryKey: ["write-off-candidates"] });
      qc.invalidateQueries({ queryKey: ["write-offs"] });
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="animate-fadein space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            to="/loans"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> Back to Loans
          </Link>
          <h1 className="text-xl font-semibold mt-2">Write off</h1>
          <p className="text-sm text-muted-foreground">
            Write off overdue facilities, track written-off balances and record subsequent
            collections.
          </p>
        </div>
      </div>

      {/* Candidates */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-[14px]">Facilities eligible for write-off</div>
          <div className="text-[11.5px] text-faint">{candidatesQ.data?.length ?? 0} shown</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-faint">
              <tr>
                <th className="text-left px-3 py-2">Facility</th>
                <th className="text-left px-3 py-2">Client</th>
                <th className="text-right px-3 py-2">Outstanding capital</th>
                <th className="text-right px-3 py-2">Interest</th>
                <th className="text-right px-3 py-2">Charges</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {candidatesQ.isLoading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-faint">
                    Loading…
                  </td>
                </tr>
              )}
              {candidatesQ.data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-faint">
                    No eligible facilities.
                  </td>
                </tr>
              )}
              {candidatesQ.data?.map((c) => (
                <tr key={c.id} className="border-t border-row-divider">
                  <td className="px-3 py-2 font-mono">{c.contract_no ?? c.id.slice(0, 8)}</td>
                  <td className="px-3 py-2">{c.client_name}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(c.outstanding_principal)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(c.outstanding_interest)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(c.outstanding_charges)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {fmt(c.outstanding_total)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() =>
                        setWoModal({
                          id: c.id,
                          contract_no: c.contract_no,
                          client_name: c.client_name,
                          outstanding_total: c.outstanding_total,
                        })
                      }
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-semibold border border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      <AlertOctagon size={12} /> Write off
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Master table */}
      <div id="collections" />
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-[14px]">Written-off facilities</div>
          <div className="text-[11.5px] text-faint">{writeOffsQ.data?.length ?? 0} rows</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-wider text-faint">
              <tr>
                <th className="text-left px-3 py-2">Facility</th>
                <th className="text-left px-3 py-2">Client</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-right px-3 py-2">Capital</th>
                <th className="text-right px-3 py-2">Interest</th>
                <th className="text-right px-3 py-2">Charges</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-right px-3 py-2">Recovered</th>
                <th className="text-left px-3 py-2">Reason</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {writeOffsQ.isLoading && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-faint">
                    Loading…
                  </td>
                </tr>
              )}
              {writeOffsQ.data?.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-faint">
                    No write-offs yet.
                  </td>
                </tr>
              )}
              {writeOffsQ.data?.map((w: any) => {
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
                    <td className="px-3 py-2 text-right font-mono">
                      {fmt(w.principal_written_off)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmt(w.interest_written_off)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(w.charges_written_off)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {fmt(w.total_written_off)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span
                        className={w.is_fully_recovered ? "text-emerald-600 font-semibold" : ""}
                      >
                        {fmt(w.total_recovered)}
                      </span>
                      {outstanding > 0 && (
                        <div className="text-[10.5px] text-faint">{fmt(outstanding)} due</div>
                      )}
                    </td>
                    <td
                      className="px-3 py-2 text-muted-foreground truncate max-w-[220px]"
                      title={w.reason}
                    >
                      {w.reason}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => setViewModal(w)}
                        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11.5px] border border-input hover:bg-muted mr-1"
                        title="View recoveries"
                      >
                        <Eye size={12} />
                      </button>
                      {!w.is_fully_recovered && (
                        <button
                          onClick={() => setRecoveryModal(w)}
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11.5px] font-semibold border border-primary/40 text-primary hover:bg-primary/10"
                        >
                          <HandCoins size={12} /> Collect
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {woModal && (
        <WriteOffModal
          loan={woModal}
          onCancel={() => setWoModal(null)}
          onSubmit={(v) => woM.mutate({ loan_id: woModal.id, ...v })}
          submitting={woM.isPending}
        />
      )}
      {recoveryModal && (
        <RecoveryModal
          writeOff={recoveryModal}
          onClose={() => setRecoveryModal(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["write-offs"] });
            qc.invalidateQueries({ queryKey: ["write-off-recoveries", recoveryModal.id] });
            setRecoveryModal(null);
          }}
        />
      )}
      {viewModal && <RecoveriesViewModal writeOff={viewModal} onClose={() => setViewModal(null)} />}
    </div>
  );
}

function ModalShell({
  title,
  onCancel,
  children,
  width = "max-w-2xl",
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className={cn(
          "bg-card rounded-xl border border-border w-full max-h-[90vh] overflow-auto",
          width,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="font-semibold text-[15px]">{title}</div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

function WriteOffModal({
  loan,
  onCancel,
  onSubmit,
  submitting,
}: {
  loan: { id: string; contract_no: string | null; client_name: string; outstanding_total: number };
  onCancel: () => void;
  onSubmit: (v: { reason: string; use_provision: boolean }) => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState("");
  const [useProvision, setUseProvision] = useState(false);
  return (
    <ModalShell title={`Write off ${loan.contract_no ?? loan.id.slice(0, 8)}`} onCancel={onCancel}>
      <div className="text-[12.5px] text-muted-foreground bg-secondary/40 border border-border rounded-md px-3 py-2">
        <div>
          <b>{loan.client_name}</b> — outstanding{" "}
          <span className="font-mono">{fmt(loan.outstanding_total)}</span>
        </div>
        <div className="mt-1">
          Posts the reversal to the loan product's Bad Debt Expense (or Loan Loss Provision) and
          records the master row. Cannot be undone.
        </div>
      </div>
      <FormGrid>
        <FormField label="Reason" required span={12}>
          <textarea
            className={cn(inputCls, "min-h-[72px]")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        <FormField label="Charge to loan-loss provision (ECL)" span={12}>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={useProvision}
              onChange={(e) => setUseProvision(e.target.checked)}
            />
            Use provision instead of expense
          </label>
        </FormField>
      </FormGrid>
      <FormActions>
        <button className={btnSecondaryCls} onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button
          className={cn(btnPrimaryCls, "bg-destructive hover:bg-destructive/90")}
          disabled={submitting || reason.trim().length < 3}
          onClick={() => onSubmit({ reason: reason.trim(), use_provision: useProvision })}
        >
          {submitting ? "Writing off…" : "Confirm write off"}
        </button>
      </FormActions>
    </ModalShell>
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
    <ModalShell
      title={`Record recovery — ${writeOff.facility_no ?? writeOff.loan_id.slice(0, 8)}`}
      onCancel={onClose}
    >
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
          <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
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
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
          {m.isPending ? "Recording…" : "Record recovery"}
        </button>
      </FormActions>
    </ModalShell>
  );
}

function RecoveriesViewModal({ writeOff, onClose }: { writeOff: any; onClose: () => void }) {
  const fn = useServerFn(listWriteOffRecoveries);
  const q = useQuery({
    queryKey: ["write-off-recoveries", writeOff.id],
    queryFn: () => fn({ data: { write_off_id: writeOff.id } }),
  });
  return (
    <ModalShell
      title={`Recoveries — ${writeOff.facility_no ?? writeOff.loan_id.slice(0, 8)}`}
      onCancel={onClose}
      width="max-w-3xl"
    >
      <div className="text-[12.5px] bg-secondary/40 border border-border rounded-md px-3 py-2 grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10.5px] uppercase text-faint">Written off</div>
          <div className="font-mono">{fmt(writeOff.total_written_off)}</div>
        </div>
        <div>
          <div className="text-[10.5px] uppercase text-faint">Recovered</div>
          <div className="font-mono">{fmt(writeOff.total_recovered)}</div>
        </div>
        <div>
          <div className="text-[10.5px] uppercase text-faint">Outstanding</div>
          <div className="font-mono font-semibold">
            {fmt(Number(writeOff.total_written_off) - Number(writeOff.total_recovered))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/40 text-[10.5px] uppercase text-faint">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-right px-3 py-2">Principal</th>
              <th className="text-right px-3 py-2">Interest</th>
              <th className="text-right px-3 py-2">Charges</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-left px-3 py-2">Method</th>
              <th className="text-left px-3 py-2">Reference</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-faint">
                  Loading…
                </td>
              </tr>
            )}
            {q.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-faint">
                  No recoveries yet.
                </td>
              </tr>
            )}
            {q.data?.map((r: any) => (
              <tr key={r.id} className="border-t border-row-divider">
                <td className="px-3 py-2">{String(r.recovery_date).slice(0, 10)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.principal_portion)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.interest_portion)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.charges_portion)}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(r.amount)}</td>
                <td className="px-3 py-2">{r.payment_method?.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.reference ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FormActions>
        <button className={btnSecondaryCls} onClick={onClose}>
          Close
        </button>
      </FormActions>
    </ModalShell>
  );
}
