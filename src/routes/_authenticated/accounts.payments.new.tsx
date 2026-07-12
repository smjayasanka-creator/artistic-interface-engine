import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createPayment,
  getActiveLoansForClient,
  getSession,
  listCompanyBranches,
} from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import {
  FormActions,
  FormField,
  FormGrid,
  btnPrimaryCls,
  btnSecondaryCls,
  inputCls,
  selectCls,
} from "@/components/mzizi/FormGrid";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accounts/payments/new")({
  component: NewPaymentPage,
});

export function NewPaymentPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const sessionFn = useServerFn(getSession);
  const branchesFn = useServerFn(listCompanyBranches);
  const loansFn = useServerFn(getActiveLoansForClient);

  const { data: session } = useQuery({ queryKey: ["session"], queryFn: () => sessionFn() });
  const { data: branches } = useQuery({ queryKey: ["company-branches"], queryFn: () => branchesFn() });
  const { data: loans } = useQuery({ queryKey: ["active-loans"], queryFn: () => loansFn() });

  const [branchId, setBranchId] = useState("");
  const [loanId, setLoanId] = useState("");
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState<"cash" | "mpesa" | "bank">("mpesa");
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  // Default branch = staff's branch
  useEffect(() => {
    if (!branchId && session?.staff?.branch_id) setBranchId(session.staff.branch_id);
  }, [session, branchId]);

  const createFn = useServerFn(createPayment);
  const post = useMutation({
    mutationFn: createFn,
    onSuccess: (r: any) => {
      toast.success(`Payment posted · ${r.reference}`);
      qc.invalidateQueries();
      navigate({ to: "/accounts/payments" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = branchId && loanId && amount && Number(amount) > 0 && receivedAt;

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/accounts/payments" className="text-xs text-primary hover:underline">
        ← Back to payments
      </Link>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          post.mutate({
            data: {
              loan_id: loanId,
              branch_id: branchId,
              amount: Number(amount),
              channel,
              received_at: receivedAt,
              reference: reference || undefined,
              notes: notes || undefined,
            },
          });
        }}
        className="flex flex-col gap-4"
      >
        <Card className="p-6">
          <FormGrid>
            <FormField label="Branch" required span={6}>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls}>
                <option value="">Select branch…</option>
                {(branches ?? []).map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.code ? `${b.code} · ` : ""}
                    {b.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Received on" required span={3}>
              <input
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                className={inputCls + " font-mono"}
              />
            </FormField>
            <FormField label="Amount" required span={3}>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0"
                className={`${inputCls} font-mono font-semibold`}
              />
            </FormField>

            <FormField label="Loan" required span={12}>
              <select value={loanId} onChange={(e) => setLoanId(e.target.value)} className={selectCls}>
                <option value="">Select loan…</option>
                {(loans ?? []).map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.client?.full_name} — {money(l.principal)}
                  </option>
                ))}
              </select>
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
              label={
                channel === "mpesa" ? "M-Pesa reference" : channel === "bank" ? "Bank reference" : "Receipt no."
              }
              span={7}
            >
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className={`${inputCls} font-mono`}
                maxLength={40}
              />
            </FormField>

            <FormField label="Notes" span={12}>
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
          <Link to="/accounts/payments" className={btnSecondaryCls}>
            Cancel
          </Link>
          <button type="submit" disabled={!valid || post.isPending} className={btnPrimaryCls}>
            {post.isPending ? "Posting…" : "Post payment"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}
