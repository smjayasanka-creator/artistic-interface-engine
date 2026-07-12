import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import {
  getActiveLoansForClient,
  getFacilityTerminationQuote,
  createFacilityTermination,
} from "@/lib/mzizi.functions";
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
import { money, getActiveCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ loanId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/loans/termination")({
  validateSearch: (s) => searchSchema.parse(s),
  component: TerminationPage,
});

const CHANNELS = [
  { id: "cash", label: "Cash" },
  { id: "mpesa", label: "M-Pesa" },
  { id: "bank", label: "Bank" },
  { id: "internal", label: "Internal" },
] as const;

type Channel = (typeof CHANNELS)[number]["id"];

const today = () => new Date().toISOString().slice(0, 10);

type Errors = Partial<Record<"loan_id" | "amount_paid" | "entry_date" | "reference" | "reason", string>>;

function TerminationPage() {
  const search = useSearch({ strict: false }) as { loanId?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [loanId, setLoanId] = useState<string>(search.loanId ?? "");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [channel, setChannel] = useState<Channel>("cash");
  const [entryDate, setEntryDate] = useState<string>(() => today());
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false);

  const listFn = useServerFn(getActiveLoansForClient);
  const { data: loans } = useQuery({ queryKey: ["active-loans"], queryFn: () => listFn() });

  const quoteFn = useServerFn(getFacilityTerminationQuote);
  const { data: quote, isFetching: quoteLoading } = useQuery({
    queryKey: ["termination-quote", loanId],
    queryFn: () => quoteFn({ data: { loan_id: loanId } }),
    enabled: !!loanId,
  });

  // Pre-fill the amount to the full settlement whenever the quote updates.
  useEffect(() => {
    if (quote?.settlement_amount != null && amountPaid === "") {
      setAmountPaid(String(quote.settlement_amount));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.settlement_amount]);

  const postFn = useServerFn(createFacilityTermination);
  const post = useMutation({
    mutationFn: postFn,
    onSuccess: (r: any) => {
      toast.success(`Facility terminated · ${r.reference}`);
      qc.invalidateQueries();
      navigate({ to: "/loans" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const schema = useMemo(
    () =>
      z.object({
        loan_id: z.string().uuid({ message: "Select a facility" }),
        amount_paid: z
          .number({ invalid_type_error: "Enter an amount" })
          .nonnegative("Amount cannot be negative")
          .max(100_000_000, "Amount is too large")
          .refine((n) => Math.round(n * 100) === n * 100, {
            message: "Use at most two decimal places",
          }),
        entry_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Entry date is required")
          .refine((d) => new Date(d).getTime() <= Date.now(), "Cannot be in the future"),
        reference: z
          .string()
          .trim()
          .max(40)
          .regex(/^[A-Za-z0-9\-\/_ ]*$/, "Reference may only contain letters, numbers, - / _")
          .optional(),
        reason: z.string().trim().max(300).optional(),
      }),
    [],
  );

  function validate() {
    const parsed = schema.safeParse({
      loan_id: loanId,
      amount_paid: amountPaid === "" ? Number.NaN : Number(amountPaid),
      entry_date: entryDate,
      reference: reference || undefined,
      reason: reason || undefined,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return { ok: false as const };
    }
    setErrors({});
    return { ok: true as const, data: parsed.data };
  }

  const revalidate = () => {
    if (attempted) validate();
  };

  const shortfall =
    quote && amountPaid !== ""
      ? Math.max(0, Math.round((Number(quote.settlement_amount) - Number(amountPaid)) * 100) / 100)
      : 0;

  return (
    <div className="animate-fadein flex flex-col gap-4 max-w-4xl">
      <Link
        to="/loans"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to Loans
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Facility termination</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Early-close a facility. The termination fee is taken from the product settings and added
          to the outstanding balance to compute the settlement amount.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAttempted(true);
          const r = validate();
          if (!r.ok) {
            toast.error("Fix the highlighted fields before posting");
            return;
          }
          post.mutate({
            data: {
              loan_id: r.data.loan_id,
              amount_paid: r.data.amount_paid,
              channel,
              entry_date: r.data.entry_date,
              ...(r.data.reference ? { reference: r.data.reference } : {}),
              ...(r.data.reason ? { reason: r.data.reason } : {}),
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
                  setAmountPaid("");
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

            <FormField label="Reference" span={2} error={errors.reference}>
              <input
                value={reference}
                onChange={(e) => {
                  setReference(e.target.value);
                  revalidate();
                }}
                placeholder="Auto TERM-####"
                className={`${errors.reference ? errorInputCls : inputCls} font-mono`}
                maxLength={40}
              />
            </FormField>

            <FormField label="Channel" span={6}>
              <div className="grid grid-cols-4 gap-2">
                {CHANNELS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChannel(c.id)}
                    className={cn(
                      "text-xs py-1.5 rounded-md border font-medium",
                      channel === c.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-input text-secondary-foreground hover:border-border-strong",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField
              label={`Amount paid (${getActiveCurrency()})`}
              required
              span={6}
              error={errors.amount_paid}
              hint={
                !errors.amount_paid && quote
                  ? `Full settlement ${money(quote.settlement_amount)}${
                      shortfall > 0 ? ` · shortfall ${money(shortfall)}` : ""
                    }`
                  : undefined
              }
            >
              <input
                inputMode="decimal"
                value={amountPaid}
                onChange={(e) => {
                  const cleaned = e.target.value
                    .replace(/[^\d.]/g, "")
                    .replace(/(\..*)\./g, "$1")
                    .replace(/^(\d*\.\d{0,2}).*$/, "$1");
                  setAmountPaid(cleaned);
                  revalidate();
                }}
                placeholder="0.00"
                className={`${errors.amount_paid ? errorInputCls : inputCls} font-mono font-semibold`}
              />
            </FormField>

            <FormField label="Reason / notes" span={12} error={errors.reason}>
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  revalidate();
                }}
                rows={2}
                maxLength={300}
                placeholder="Reason for early termination…"
                className={errors.reason ? errorInputCls : inputCls}
              />
            </FormField>
          </FormGrid>
        </Card>

        {loanId && (
          <Card className="p-6">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-3">
              Settlement quote
            </div>
            {quoteLoading && !quote ? (
              <div className="text-sm text-muted-foreground">Calculating…</div>
            ) : quote ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-6 text-[13px]">
                <Row label="Borrower" value={quote.client?.full_name ?? "—"} />
                <Row label="Product" value={quote.product?.name ?? "—"} />
                <Row label="Status" value={String(quote.status)} />
                <Row label="Outstanding principal" value={money(quote.outstanding_principal)} mono />
                <Row label="Unpaid interest" value={money(quote.interest_unpaid)} mono />
                <Row label="Unpaid fees" value={money(quote.fees_unpaid)} mono />
                <Row
                  label={`Termination fee${
                    quote.termination_fee_pct
                      ? ` (${quote.termination_fee_flat ? money(quote.termination_fee_flat) + " + " : ""}${quote.termination_fee_pct}%)`
                      : ""
                  }`}
                  value={money(quote.termination_fee)}
                  mono
                />
                <div className="col-span-2 md:col-span-3 border-t border-border mt-1 pt-2 flex items-center justify-between">
                  <div className="text-sm font-semibold">Settlement amount</div>
                  <div className="text-base font-mono font-bold">
                    {money(quote.settlement_amount)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Select a facility to see the quote.</div>
            )}
          </Card>
        )}

        <FormActions>
          <Link to="/loans" className={btnSecondaryCls}>
            Cancel
          </Link>
          <button type="submit" disabled={post.isPending || !quote} className={btnPrimaryCls}>
            {post.isPending ? "Posting…" : "Terminate facility"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-muted-foreground text-[12px]">{label}</div>
      <div className={cn("text-secondary-foreground", mono && "font-mono")}>{value}</div>
    </div>
  );
}
