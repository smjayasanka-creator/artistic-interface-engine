import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { getActiveLoansForClient, recordRepayment } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { FormGrid, FormField, FormActions, inputCls, selectCls } from "@/components/mzizi/FormGrid";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ loanId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/collections/new")({
  validateSearch: (s) => searchSchema.parse(s),
  component: RecordRepaymentPage,
});

function RecordRepaymentPage() {
  const { loanId: presetLoanId } = useSearch({ from: "/_authenticated/collections/new" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [loanId, setLoanId] = useState<string>(presetLoanId ?? "");
  const [amount, setAmount] = useState<string>("");
  const [channel, setChannel] = useState<"cash" | "mpesa" | "bank">("mpesa");
  const [reference, setReference] = useState<string>("");
  const [receivedAt, setReceivedAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>("");

  const listFn = useServerFn(getActiveLoansForClient);
  const { data: loans } = useQuery({ queryKey: ["active-loans"], queryFn: () => listFn() });

  const recordFn = useServerFn(recordRepayment);
  const post = useMutation({
    mutationFn: recordFn,
    onSuccess: (r: any) => {
      toast.success(`Repayment posted · ${r.reference ?? "ok"}`);
      qc.invalidateQueries();
      navigate({ to: "/collections" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = loanId && amount && Number(amount) > 0;

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/collections" className="text-xs text-primary hover:underline">← Back to collections</Link>
      <div>
        <h1 className="text-xl font-semibold">Record repayment</h1>
        <p className="text-sm text-muted-foreground mt-1">All fields marked with <span className="text-destructive">*</span> are required.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          post.mutate({
            data: {
              loan_id: loanId,
              amount: Number(amount),
              channel,
              ...(reference ? { reference } : {}),
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
              <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className={inputCls + " font-mono"} />
            </FormField>
            <FormField label="Amount (KES)" required span={2}>
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
            <FormField label={channel === "mpesa" ? "M-Pesa reference" : channel === "bank" ? "Bank reference" : "Receipt no."} span={7}>
              <input value={reference} onChange={(e) => setReference(e.target.value)} className={`${inputCls} font-mono`} maxLength={40} />
            </FormField>
            <FormField label="Notes" span={12}>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={300} className={inputCls} />
            </FormField>
          </FormGrid>
        </Card>

        <FormActions className="border-t-0 pt-0 mt-0">
          <Link to="/collections" className="text-sm px-4 py-2 border border-input rounded-md hover:bg-muted">Cancel</Link>
          <button
            type="submit"
            disabled={!valid || post.isPending}
            className="text-sm px-5 py-2 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary-hover disabled:opacity-50"
          >
            {post.isPending ? "Posting…" : "Post repayment"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}

