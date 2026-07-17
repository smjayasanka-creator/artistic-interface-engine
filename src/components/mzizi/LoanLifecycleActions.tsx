import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertOctagon, CalendarClock, X } from "lucide-react";
import { rescheduleLoan } from "@/lib/lifecycle.functions";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";

type Loan = {
  id: string;
  contract_no?: string | null;
  status: string;
};

type Installment = {
  seq: number;
  due_date: string;
  principal_due: number | string;
  interest_due: number | string;
  fee_due?: number | string;
  state: string;
};

export function LoanLifecycleActions({
  loan,
  schedule,
}: {
  loan: Loan;
  schedule: Installment[];
}) {
  const qc = useQueryClient();
  const [modal, setModal] = useState<null | "reschedule">(null);

  const rescheduleFn = useServerFn(rescheduleLoan);

  const rescheduleM = useMutation({
    mutationFn: (v: {
      reason: string;
      installments: Array<{
        due_date: string;
        principal_due: number;
        interest_due: number;
        fee_due?: number;
      }>;
    }) =>
      rescheduleFn({
        data: { loan_id: loan.id, reason: v.reason, installments: v.installments },
      }),
    onSuccess: () => {
      toast.success("Loan rescheduled");
      setModal(null);
      qc.invalidateQueries({ queryKey: ["loan", loan.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eligible = ["disbursed", "active", "overdue"].includes(loan.status);
  if (!eligible) return null;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setModal("reschedule")}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold border border-input bg-background hover:bg-muted"
        >
          <CalendarClock size={13} /> Reschedule
        </button>
        <Link
          to="/loans/write-off"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold border border-destructive/40 text-destructive bg-background hover:bg-destructive/10"
        >
          <AlertOctagon size={13} /> Write off →
        </Link>
      </div>

      {modal === "reschedule" && (
        <RescheduleModal
          schedule={schedule}
          onCancel={() => setModal(null)}
          onSubmit={(v) => rescheduleM.mutate(v)}
          submitting={rescheduleM.isPending}
        />
      )}
    </>
  );
}


function ModalShell({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-card rounded-xl border border-border max-w-3xl w-full max-h-[90vh] overflow-auto"
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
  onCancel,
  onSubmit,
  submitting,
}: {
  onCancel: () => void;
  onSubmit: (v: { reason: string; use_provision: boolean }) => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState("");
  const [useProvision, setUseProvision] = useState(false);
  return (
    <ModalShell title="Write off loan" onCancel={onCancel}>
      <div className="text-[12.5px] text-muted-foreground bg-secondary/40 border border-border rounded-md px-3 py-2">
        Marks the loan as written off, cancels remaining installments and posts the reversal
        against the loan product's Bad Debt Expense (or Loan Loss Provision, if used) and
        Suspended Interest accounts. Cannot be undone.
      </div>
      <FormGrid>
        <FormField label="Reason" required span={12}>
          <textarea
            className={cn(inputCls, "min-h-[72px]")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain the write-off rationale for the audit trail"
          />
        </FormField>
        <FormField label="Charge to loan loss provision (ECL)" span={12}>
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

function RescheduleModal({
  schedule,
  onCancel,
  onSubmit,
  submitting,
}: {
  schedule: Installment[];
  onCancel: () => void;
  onSubmit: (v: {
    reason: string;
    installments: Array<{
      due_date: string;
      principal_due: number;
      interest_due: number;
      fee_due?: number;
    }>;
  }) => void;
  submitting: boolean;
}) {
  const upcoming = (schedule ?? [])
    .filter((s) => s.state !== "paid")
    .map((s) => ({
      due_date: s.due_date.slice(0, 10),
      principal_due: Number(s.principal_due),
      interest_due: Number(s.interest_due),
      fee_due: Number(s.fee_due ?? 0),
    }));
  const [rows, setRows] = useState(upcoming.length ? upcoming : [
    { due_date: "", principal_due: 0, interest_due: 0, fee_due: 0 },
  ]);
  const [reason, setReason] = useState("");

  const total = rows.reduce(
    (s, r) => s + Number(r.principal_due || 0) + Number(r.interest_due || 0) + Number(r.fee_due || 0),
    0,
  );

  const canSubmit =
    reason.trim().length >= 3 &&
    rows.length > 0 &&
    rows.every((r) => r.due_date && Number(r.principal_due) >= 0 && Number(r.interest_due) >= 0);

  return (
    <ModalShell title="Reschedule loan" onCancel={onCancel}>
      <div className="text-[12.5px] text-muted-foreground bg-secondary/40 border border-border rounded-md px-3 py-2">
        Voids remaining installments and installs a new schedule. Repayments already applied
        are preserved. Existing GL postings are untouched.
      </div>
      <FormField label="Reason" required span={12}>
        <textarea
          className={cn(inputCls, "min-h-[60px]")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this loan being rescheduled?"
        />
      </FormField>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
            New installments
          </div>
          <button
            className="text-[11.5px] text-primary hover:underline"
            onClick={() =>
              setRows((r) => [...r, { due_date: "", principal_due: 0, interest_due: 0, fee_due: 0 }])
            }
          >
            + Add row
          </button>
        </div>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-2 px-2 border-y border-border bg-secondary/40"
          style={{ gridTemplateColumns: "40px 1.2fr 1fr 1fr 1fr 36px" }}
        >
          <div>#</div>
          <div>Due</div>
          <div className="text-right">Principal</div>
          <div className="text-right">Interest</div>
          <div className="text-right">Fee</div>
          <div></div>
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid items-center gap-2 py-1 px-2 border-b border-row-divider last:border-b-0"
            style={{ gridTemplateColumns: "40px 1.2fr 1fr 1fr 1fr 36px" }}
          >
            <div className="text-[11px] text-faint font-mono">{i + 1}</div>
            <input
              type="date"
              className={inputCls}
              value={r.due_date}
              onChange={(e) =>
                setRows((rs) => rs.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))
              }
            />
            <input
              type="number"
              step="0.01"
              className={cn(inputCls, "text-right font-mono")}
              value={r.principal_due}
              onChange={(e) =>
                setRows((rs) =>
                  rs.map((x, j) => (j === i ? { ...x, principal_due: Number(e.target.value) } : x)),
                )
              }
            />
            <input
              type="number"
              step="0.01"
              className={cn(inputCls, "text-right font-mono")}
              value={r.interest_due}
              onChange={(e) =>
                setRows((rs) =>
                  rs.map((x, j) => (j === i ? { ...x, interest_due: Number(e.target.value) } : x)),
                )
              }
            />
            <input
              type="number"
              step="0.01"
              className={cn(inputCls, "text-right font-mono")}
              value={r.fee_due ?? 0}
              onChange={(e) =>
                setRows((rs) =>
                  rs.map((x, j) => (j === i ? { ...x, fee_due: Number(e.target.value) } : x)),
                )
              }
            />
            <button
              className="text-muted-foreground hover:text-destructive text-[11px]"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              disabled={rows.length === 1}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex items-center justify-end text-[12px] pt-2 gap-2">
          <span className="text-faint">Total scheduled:</span>
          <span className="font-mono font-semibold">{total.toFixed(2)}</span>
        </div>
      </div>

      <FormActions>
        <button className={btnSecondaryCls} onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button
          className={btnPrimaryCls}
          disabled={submitting || !canSubmit}
          onClick={() =>
            onSubmit({
              reason: reason.trim(),
              installments: rows.map((r) => ({
                due_date: r.due_date,
                principal_due: Number(r.principal_due),
                interest_due: Number(r.interest_due),
                fee_due: Number(r.fee_due ?? 0),
              })),
            })
          }
        >
          {submitting ? "Rescheduling…" : "Apply new schedule"}
        </button>
      </FormActions>
    </ModalShell>
  );
}
