import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { getActiveLoansForClient, recordRepayment } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { FormGrid, FormField, FormActions, inputCls, selectCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { money, getActiveCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ loanId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/transactions/repayment")({
  validateSearch: (s) => searchSchema.parse(s),
  component: RecordRepaymentPage,
});

function RecordRepaymentPage() {
  const search = useSearch({ strict: false }) as { loanId?: string };
  const presetLoanId = search.loanId;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [loanId, setLoanId] = useState<string>(presetLoanId ?? "");
  const [amount, setAmount] = useState<string>("");
  const [channel, setChannel] = useState<"cash" | "mpesa" | "bank">("mpesa");
  const [reference, setReference] = useState<string>("");
  const [receivedAt, setReceivedAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>("");
  // One idempotency key per form session — a retried submit hits the same key
  // and the server RPC returns the original allocation instead of double-posting.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    (globalThis.crypto?.randomUUID?.() ?? `rep-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
  );

  const listFn = useServerFn(getActiveLoansForClient);
  const { data: loans } = useQuery({ queryKey: ["active-loans"], queryFn: () => listFn() });

  const recordFn = useServerFn(recordRepayment);
  const post = useMutation({
    mutationFn: recordFn,
    onSuccess: (r: any) => {
      const parts = [
        r.allocated_fees > 0 ? `Fees ${money(r.allocated_fees)}` : null,
        r.allocated_interest > 0 ? `Interest ${money(r.allocated_interest)}` : null,
        r.allocated_principal > 0 ? `Principal ${money(r.allocated_principal)}` : null,
        r.unallocated_amount > 0 ? `Unallocated ${money(r.unallocated_amount)}` : null,
      ].filter(Boolean).join(" · ");
      toast.success(
        `Repayment posted${r.reference ? " · " + r.reference : ""}${r.idempotent_replay ? " (replay)" : ""}`,
        { description: [parts || null, r.loan_closed ? "Loan closed" : null].filter(Boolean).join(" — ") || undefined },
      );
      qc.invalidateQueries();
      navigate({ to: "/transactions" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const referenceRequired = channel === "bank" || channel === "mpesa";
  const valid =
    loanId &&
    amount &&
    Number(amount) > 0 &&
    (!referenceRequired || reference.trim().length > 0);

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/transactions" className="text-xs text-primary hover:underline">← Back to transactions</Link>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          post.mutate({
            data: {
              loan_id: loanId,
              amount: Number(amount),
              channel,
              received_at: new Date(receivedAt).toISOString(),
              idempotency_key: idempotencyKey,
              ...(reference.trim() ? { reference: reference.trim() } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            } as any,
          });
        }}
        className="flex flex-col gap-4"
      >

        <Card className="p-6">
          <FormGrid>
            <FormField label="Loan" required span={8}>
              <select value={loanId} onChange={(e) => setLoanId(e.target.value)} className={selectCls}>
                <option value="">Select loan…</option>
                {(loans ?? []).map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.client?.full_name} — {money(l.principal)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Received on" required span={2}>
              <input type="date" readOnly value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className={inputCls + " font-mono"} />
            </FormField>
            <FormField label={`Amount (${getActiveCurrency()})`} required span={2}>
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
              label={channel === "mpesa" ? "M-Pesa reference" : channel === "bank" ? "Bank reference" : "Receipt no."}
              span={7}
              required={referenceRequired}
            >
              <input value={reference} onChange={(e) => setReference(e.target.value)} className={`${inputCls} font-mono`} maxLength={40} />
            </FormField>
            <FormField label="Notes" span={12}>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={300} className={inputCls} />
            </FormField>
          </FormGrid>
        </Card>

        <FormActions>
          <Link to="/transactions" className={btnSecondaryCls}>Cancel</Link>
          <button
            type="submit"
            disabled={!valid || post.isPending}
            className={btnPrimaryCls}
          >
            {post.isPending ? "Posting…" : "Post repayment"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}
