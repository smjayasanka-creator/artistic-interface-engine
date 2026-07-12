import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
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
  errorInputCls,
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

// Reasonable business bounds — a single debit note above KES 5M or under 1 shilling
// is almost certainly a data-entry mistake.
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 5_000_000;

// Charges beyond this % of the facility principal require a description explaining why.
const HIGH_PCT_THRESHOLD = 0.5;

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

function buildSchema(ctx: { principal: number | null }) {
  return z
    .object({
      loan_id: z.string().uuid({ message: "Select a facility" }),
      amount: z
        .number({ invalid_type_error: "Enter an amount" })
        .positive("Amount must be greater than zero")
        .min(MIN_AMOUNT, `Amount must be at least ${money(MIN_AMOUNT)}`)
        .max(MAX_AMOUNT, `Amount cannot exceed ${money(MAX_AMOUNT)} in a single note`)
        .refine((n) => Math.round(n * 100) === n * 100, {
          message: "Use at most two decimal places",
        }),
      charge_type: z.enum(["fee", "penalty", "insurance", "legal", "other"], {
        errorMap: () => ({ message: "Pick a charge type" }),
      }),
      entry_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Entry date is required")
        .refine((d) => !Number.isNaN(new Date(d).getTime()), "Invalid date")
        .refine((d) => daysBetween(d, today()) <= 0, "Entry date cannot be in the future")
        .refine((d) => daysBetween(today(), d) <= 365, "Entry date cannot be more than a year old"),
      reference: z
        .string()
        .trim()
        .max(40, "Reference is too long")
        .regex(/^[A-Za-z0-9\-\/_ ]*$/, "Reference may only contain letters, numbers, - / _")
        .optional(),
      description: z.string().trim().max(300, "Keep the description under 300 characters").optional(),
    })
    .superRefine((v, c) => {
      // "Other" must be justified in the description.
      if (v.charge_type === "other" && (!v.description || v.description.length < 5)) {
        c.addIssue({
          path: ["description"],
          code: z.ZodIssueCode.custom,
          message: "Describe the charge (min 5 chars) when picking Other",
        });
      }
      // Legal / large charges also need a description.
      if (v.charge_type === "legal" && (!v.description || v.description.length < 5)) {
        c.addIssue({
          path: ["description"],
          code: z.ZodIssueCode.custom,
          message: "Add a short note explaining the legal cost",
        });
      }
      if (
        ctx.principal &&
        ctx.principal > 0 &&
        v.amount / ctx.principal > HIGH_PCT_THRESHOLD &&
        (!v.description || v.description.length < 10)
      ) {
        c.addIssue({
          path: ["amount"],
          code: z.ZodIssueCode.custom,
          message: `Charge exceeds ${Math.round(HIGH_PCT_THRESHOLD * 100)}% of the facility — add a description explaining why`,
        });
      }
    });
}

type Errors = Partial<Record<"loan_id" | "amount" | "charge_type" | "entry_date" | "reference" | "description", string>>;

function DebitNotePage() {
  const search = useSearch({ strict: false }) as { loanId?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [loanId, setLoanId] = useState<string>(search.loanId ?? "");
  const [amount, setAmount] = useState<string>("");
  const [chargeType, setChargeType] = useState<Charge>("fee");
  const [reference, setReference] = useState<string>("");
  const [entryDate, setEntryDate] = useState<string>(() => today());
  const [description, setDescription] = useState<string>("");
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false);

  const listFn = useServerFn(getActiveLoansForClient);
  const { data: loans } = useQuery({ queryKey: ["active-loans"], queryFn: () => listFn() });

  const selectedLoan = useMemo(
    () => (loans ?? []).find((l: any) => l.id === loanId) as any | undefined,
    [loans, loanId],
  );
  const principal = selectedLoan ? Number(selectedLoan.principal) : null;

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

  function validate(): { ok: boolean; data?: z.infer<ReturnType<typeof buildSchema>> } {
    const parsed = buildSchema({ principal }).safeParse({
      loan_id: loanId,
      amount: amount === "" ? Number.NaN : Number(amount),
      charge_type: chargeType,
      entry_date: entryDate,
      reference: reference || undefined,
      description: description || undefined,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return { ok: false };
    }
    setErrors({});
    return { ok: true, data: parsed.data };
  }

  // Live re-validate after the first submit attempt so users see errors clear as they fix them.
  function revalidate() {
    if (attempted) validate();
  }

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
          setAttempted(true);
          const r = validate();
          if (!r.ok || !r.data) {
            toast.error("Fix the highlighted fields before posting");
            return;
          }
          post.mutate({
            data: {
              loan_id: r.data.loan_id,
              amount: r.data.amount,
              charge_type: r.data.charge_type,
              entry_date: r.data.entry_date,
              ...(r.data.reference ? { reference: r.data.reference } : {}),
              ...(r.data.description ? { description: r.data.description } : {}),
            } as any,
          });
        }}
        className="flex flex-col gap-4"
      >
        <Card className="p-6">
          <FormGrid>
            <FormField label="Facility" required span={8} error={errors.loan_id}>
              <select
                value={loanId}
                onChange={(e) => {
                  setLoanId(e.target.value);
                  revalidate();
                }}
                className={errors.loan_id ? errorInputCls : selectCls}
              >
                <option value="">Select loan…</option>
                {(loans ?? []).map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.client?.full_name} — {money(l.principal)}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Entry date" required span={2} error={errors.entry_date}>
              <input
                type="date"
                value={entryDate}
                max={today()}
                onChange={(e) => {
                  setEntryDate(e.target.value);
                  revalidate();
                }}
                className={(errors.entry_date ? errorInputCls : inputCls) + " font-mono"}
              />
            </FormField>

            <FormField
              label="Amount (KES)"
              required
              span={2}
              error={errors.amount}
              hint={
                !errors.amount && principal
                  ? `Facility principal ${money(principal)}`
                  : undefined
              }
            >
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  // Allow digits + single decimal + up to 2 fractional digits.
                  const cleaned = e.target.value
                    .replace(/[^\d.]/g, "")
                    .replace(/(\..*)\./g, "$1")
                    .replace(/^(\d*\.\d{0,2}).*$/, "$1");
                  setAmount(cleaned);
                  revalidate();
                }}
                placeholder="0.00"
                className={`${errors.amount ? errorInputCls : inputCls} font-mono font-semibold`}
              />
            </FormField>

            <FormField label="Charge type" required span={7} error={errors.charge_type}>
              <div className="grid grid-cols-5 gap-2">
                {CHARGES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setChargeType(c.id);
                      revalidate();
                    }}
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

            <FormField label="Reference" span={5} error={errors.reference}>
              <input
                value={reference}
                onChange={(e) => {
                  setReference(e.target.value);
                  revalidate();
                }}
                placeholder="Auto DN-####"
                className={`${errors.reference ? errorInputCls : inputCls} font-mono`}
                maxLength={40}
              />
            </FormField>

            <FormField
              label={
                chargeType === "other" || chargeType === "legal"
                  ? "Description (required)"
                  : "Description / notes"
              }
              span={12}
              error={errors.description}
              hint={
                !errors.description
                  ? `${description.length}/300 characters`
                  : undefined
              }
            >
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  revalidate();
                }}
                rows={2}
                maxLength={300}
                placeholder="Reason for the charge (visible on the journal entry)…"
                className={errors.description ? errorInputCls : inputCls}
              />
            </FormField>
          </FormGrid>
        </Card>

        <FormActions>
          <Link to="/loans" className={btnSecondaryCls}>
            Cancel
          </Link>
          <button type="submit" disabled={post.isPending} className={btnPrimaryCls}>
            {post.isPending ? "Posting…" : "Post debit note"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}
