import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  getActiveLoansForClient,
  getRepaymentContext,
  recordRepayment,
} from "@/lib/mzizi.functions";
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
import { cn } from "@/lib/utils";

const searchSchema = z.object({ loanId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/transactions/repayment")({
  validateSearch: (s) => searchSchema.parse(s),
  component: RecordRepaymentPage,
});

// Stable idempotency key. One key per prepared submission; regenerated only
// after a confirmed successful post (or when the user starts a new one).
function newIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `rep-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
}

// Anchor a "business date" as noon UTC so it lands on the same calendar
// day regardless of viewer timezone.
function businessDateToInstant(dateOnly: string): string {
  return `${dateOnly}T12:00:00.000Z`;
}

type SuccessSummary = {
  reference: string | null;
  received_at: string;
  business_date: string;
  amount: number;
  channel: string;
  notes: string | null;
  allocated_fees: number;
  allocated_interest: number;
  allocated_principal: number;
  unallocated_amount: number;
  loan_closed: boolean;
  idempotent_replay: boolean;
};

function RecordRepaymentPage() {
  const search = useSearch({ strict: false }) as { loanId?: string };
  const presetLoanId = search.loanId;
  const qc = useQueryClient();

  const [loanId, setLoanId] = useState<string>(presetLoanId ?? "");
  const [amount, setAmount] = useState<string>("");
  const [channel, setChannel] = useState<"cash" | "mpesa" | "bank">("mpesa");
  const [reference, setReference] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [receivedOn, setReceivedOn] = useState<string>("");
  const [idempotencyKey, setIdempotencyKey] = useState<string>(newIdempotencyKey);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<SuccessSummary | null>(null);

  const listFn = useServerFn(getActiveLoansForClient);
  const { data: loans } = useQuery({ queryKey: ["active-loans"], queryFn: () => listFn() });

  const ctxFn = useServerFn(getRepaymentContext);
  const { data: ctx } = useQuery({
    queryKey: ["repayment-context", loanId],
    queryFn: () => ctxFn({ data: { loan_id: loanId } }),
    enabled: !!loanId,
  });

  // Default the date field to the server's business date whenever context
  // arrives (or whenever we switch loans). Never derived from the browser
  // clock — the server owns "today".
  useEffect(() => {
    if (ctx?.business_date) setReceivedOn(ctx.business_date);
  }, [ctx?.business_date, loanId]);

  const canBackdate = !!ctx?.can_backdate;
  const businessDate = ctx?.business_date ?? "";
  const disbursedOn = ctx?.loan?.disbursed_at ? String(ctx.loan.disbursed_at).slice(0, 10) : "";

  const referenceRequired = channel === "bank" || channel === "mpesa";
  const referenceLabel =
    channel === "mpesa"
      ? "M-Pesa reference"
      : channel === "bank"
        ? "Bank reference"
        : "Receipt no. (cash policy)";

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!loanId) errs.loanId = "Select a loan";
    const amt = Number(amount);
    if (!amount || !(amt > 0)) errs.amount = "Enter an amount greater than 0";
    if (referenceRequired && !reference.trim())
      errs.reference = `${channel === "mpesa" ? "M-Pesa" : "Bank"} reference is required`;
    if (reference.trim().length > 80) errs.reference = "Reference must be 80 characters or fewer";
    if (notes.trim().length > 300) errs.notes = "Notes must be 300 characters or fewer";
    if (!receivedOn) {
      errs.receivedOn = "Received date is required";
    } else {
      if (businessDate && receivedOn > businessDate) {
        errs.receivedOn = "Cannot use a future date";
      }
      if (disbursedOn && receivedOn < disbursedOn) {
        errs.receivedOn = `Must be on or after disbursement (${disbursedOn})`;
      }
      if (!canBackdate && businessDate && receivedOn !== businessDate) {
        errs.receivedOn = "Backdating is not permitted — using today's business date";
      }
    }
    return errs;
  };

  const currentErrors = useMemo(validate, [
    loanId,
    amount,
    channel,
    reference,
    notes,
    receivedOn,
    businessDate,
    disbursedOn,
    canBackdate,
  ]);
  const valid = Object.keys(currentErrors).length === 0;

  const recordFn = useServerFn(recordRepayment);
  const post = useMutation({
    mutationFn: recordFn,
    onSuccess: (r: any) => {
      const summary: SuccessSummary = {
        reference: r.reference ?? null,
        received_at: r.received_at ?? businessDateToInstant(receivedOn),
        business_date: r.business_date ?? receivedOn,
        amount: Number(r.amount ?? amount),
        channel: r.channel ?? channel,
        notes: r.notes ?? (notes.trim() ? notes.trim() : null),
        allocated_fees: Number(r.allocated_fees ?? 0),
        allocated_interest: Number(r.allocated_interest ?? 0),
        allocated_principal: Number(r.allocated_principal ?? 0),
        unallocated_amount: Number(r.unallocated_amount ?? 0),
        loan_closed: !!r.loan_closed,
        idempotent_replay: !!r.idempotent_replay,
      };
      setReceipt(summary);
      qc.invalidateQueries();
      toast.success(
        `Repayment posted${summary.reference ? " · " + summary.reference : ""}${summary.idempotent_replay ? " (replay)" : ""}`,
      );
    },
    onError: (e: Error) => {
      // Preserve every form value — idempotency key too — so the user can
      // correct and retry against the same server-side slot.
      toast.error(e.message || "Failed to post repayment");
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      const first = Object.values(errs)[0];
      if (first) toast.error(first);
      return;
    }
    post.mutate({
      data: {
        loan_id: loanId,
        amount: Number(amount),
        channel,
        received_at: businessDateToInstant(receivedOn),
        idempotency_key: idempotencyKey,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      } as any,
    });
  };

  const startAnother = () => {
    setReceipt(null);
    setAmount("");
    setReference("");
    setNotes("");
    setFieldErrors({});
    setIdempotencyKey(newIdempotencyKey());
  };

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/transactions" className="text-xs text-primary hover:underline">
        ← Back to transactions
      </Link>

      {receipt ? (
        <Card className="p-6">
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
                Repayment posted{receipt.idempotent_replay ? " (idempotent replay)" : ""}
              </div>
              <div className="mt-1 text-lg font-semibold">
                {money(receipt.amount, true)} · {receipt.channel.toUpperCase()}
              </div>
              {receipt.reference && (
                <div className="text-sm font-mono">Ref: {receipt.reference}</div>
              )}
              <div className="text-sm text-muted-foreground">
                Business date: <span className="font-mono">{receipt.business_date}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
              <Stat label="Fees" value={money(receipt.allocated_fees, true)} />
              <Stat label="Interest" value={money(receipt.allocated_interest, true)} />
              <Stat label="Principal" value={money(receipt.allocated_principal, true)} />
              <Stat label="Unallocated" value={money(receipt.unallocated_amount, true)} />
            </div>
            {receipt.notes && (
              <div className="text-[12px] text-muted-foreground">
                Notes: <span className="text-foreground">{receipt.notes}</span>
              </div>
            )}
            {receipt.loan_closed && (
              <div className="text-[12px] rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 px-3 py-2">
                Loan fully settled and closed.
              </div>
            )}
            <FormActions>
              <Link to="/transactions" className={btnSecondaryCls}>
                Back to transactions
              </Link>
              <button type="button" onClick={startAnother} className={btnPrimaryCls}>
                Post another repayment
              </button>
            </FormActions>
          </div>
        </Card>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Card className="p-6">
            <FormGrid>
              <FormField label="Loan" required span={8} error={fieldErrors.loanId}>
                <select
                  value={loanId}
                  onChange={(e) => setLoanId(e.target.value)}
                  className={selectCls}
                >
                  <option value="">Select loan…</option>
                  {(loans ?? []).map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.client?.full_name} — {money(l.principal)}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                label={canBackdate ? "Received on" : "Received on (system business date)"}
                required
                span={2}
                error={fieldErrors.receivedOn}
              >
                <input
                  type="date"
                  value={receivedOn}
                  min={disbursedOn || undefined}
                  max={businessDate || undefined}
                  readOnly={!canBackdate}
                  disabled={!loanId}
                  onChange={canBackdate ? (e) => setReceivedOn(e.target.value) : undefined}
                  className={cn(
                    inputCls,
                    "font-mono",
                    !canBackdate && "opacity-70 cursor-not-allowed",
                  )}
                  title={
                    canBackdate
                      ? `Between ${disbursedOn || "disbursement"} and ${businessDate || "today"}`
                      : "Locked to today's business date — you don't have backdating permission."
                  }
                />
              </FormField>

              <FormField
                label={`Amount (${getActiveCurrency()})`}
                required
                span={2}
                error={fieldErrors.amount}
              >
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="0"
                  className={`${inputCls} font-mono font-semibold`}
                />
              </FormField>

              <FormField label="Method" required span={5}>
                <div className="grid grid-cols-3 gap-2">
                  {(["cash", "mpesa", "bank"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setChannel(c)}
                      className={cn(
                        "text-sm py-1.5 rounded-md border font-medium capitalize",
                        channel === c
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-input text-secondary-foreground hover:border-border-strong",
                      )}
                    >
                      {c === "mpesa" ? "M-Pesa" : c}
                    </button>
                  ))}
                </div>
              </FormField>

              <FormField
                label={referenceLabel}
                span={7}
                required={referenceRequired}
                error={fieldErrors.reference}
              >
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className={`${inputCls} font-mono`}
                  maxLength={80}
                  placeholder={
                    channel === "cash"
                      ? "Optional cash receipt number (per company policy)"
                      : undefined
                  }
                />
              </FormField>

              <FormField label="Notes" span={12} error={fieldErrors.notes}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={300}
                  className={inputCls}
                />
              </FormField>
            </FormGrid>
          </Card>

          <FormActions>
            <Link to="/transactions" className={btnSecondaryCls}>
              Cancel
            </Link>
            <button type="submit" disabled={!valid || post.isPending} className={btnPrimaryCls}>
              {post.isPending ? "Posting…" : "Post repayment"}
            </button>
          </FormActions>
        </form>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className="text-sm font-mono">{value}</div>
    </div>
  );
}
