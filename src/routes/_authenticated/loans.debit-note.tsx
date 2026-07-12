import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { getActiveLoansForClient, createDebitNote } from "@/lib/mzizi.functions";
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
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ loanId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/loans/debit-note")({
  validateSearch: (s) => searchSchema.parse(s),
  component: DebitNotePage,
});

const CHARGES = [
  { id: "fee", label: "Fee" },
  { id: "penalty", label: "Penalty" },
  { id: "insurance", label: "Insurance" },
  { id: "legal", label: "Legal cost" },
  { id: "other", label: "Other" },
] as const;

type Charge = (typeof CHARGES)[number]["id"];

function DebitNotePage() {
  const search = useSearch({ strict: false }) as { loanId?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [loanId, setLoanId] = useState<string>(search.loanId ?? "");
  const [amount, setAmount] = useState<string>("");
  const [chargeType, setChargeType] = useState<Charge>("fee");
  const [reference, setReference] = useState<string>("");
  const [entryDate, setEntryDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [description, setDescription] = useState<string>("");

  const listFn = useServerFn(getActiveLoansForClient);
  const { data: loans } = useQuery({ queryKey: ["active-loans"], queryFn: () => listFn() });

  const postFn = useServerFn(createDebitNote);
  const post = useMutation({
    mutationFn: postFn,
    onSuccess: (r: any) => {
      toast.success(`Debit note posted · ${r.reference ?? "ok"}`);
      qc.invalidateQueries();
      navigate({ to: "/loans" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = loanId && amount && Number(amount) > 0;

  return (
    <div className="animate-fadein flex flex-col gap-4 max-w-4xl">
      <Link
        to="/loans"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to Loans
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Debit note</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add a charge to a disbursed facility. The amount is debited to the loan receivable and
          credited to fee income, increasing the customer's outstanding balance.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          post.mutate({
            data: {
              loan_id: loanId,
              amount: Number(amount),
              charge_type: chargeType,
              entry_date: entryDate,
              ...(reference ? { reference } : {}),
              ...(description ? { description } : {}),
            } as any,
          });
        }}
        className="flex flex-col gap-4"
      >
        <Card className="p-6">
          <FormGrid>
            <FormField label="Facility" required span={8}>
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

            <FormField label="Entry date" required span={2}>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className={inputCls + " font-mono"}
              />
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

            <FormField label="Charge type" required span={7}>
              <div className="grid grid-cols-5 gap-2">
                {CHARGES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChargeType(c.id)}
                    className={cn(
                      "text-xs py-1.5 rounded-md border font-medium",
                      chargeType === c.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-input text-secondary-foreground hover:border-border-strong",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="Reference" span={5}>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Auto DN-####"
                className={`${inputCls} font-mono`}
                maxLength={40}
              />
            </FormField>

            <FormField label="Description / notes" span={12}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="Reason for the charge (visible on the journal entry)…"
                className={inputCls}
              />
            </FormField>
          </FormGrid>
        </Card>

        <FormActions>
          <Link to="/loans" className={btnSecondaryCls}>
            Cancel
          </Link>
          <button type="submit" disabled={!valid || post.isPending} className={btnPrimaryCls}>
            {post.isPending ? "Posting…" : "Post debit note"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}
