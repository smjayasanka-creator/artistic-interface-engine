import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { getActiveLoansForClient, createDebitNote, getClients } from "@/lib/mzizi.functions";
import { listLoanCharges } from "@/lib/loan-charges.functions";
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

export const Route = createFileRoute("/_authenticated/loans/debit-note")({
  validateSearch: (s) => searchSchema.parse(s),
  component: DebitNotePage,
});

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 5_000_000;
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

type Errors = Partial<
  Record<"loan_id" | "charge_id" | "amount" | "supplier_client_id" | "entry_date" | "reference" | "description", string>
>;

function DebitNotePage() {
  const search = useSearch({ strict: false }) as { loanId?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [loanId, setLoanId] = useState<string>(search.loanId ?? "");
  const [chargeId, setChargeId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [entryDate, setEntryDate] = useState<string>(() => today());
  const [description, setDescription] = useState<string>("");
  const [errors, setErrors] = useState<Errors>({});

  const listFn = useServerFn(getActiveLoansForClient);
  const chargesFn = useServerFn(listLoanCharges);
  const clientsFn = useServerFn(getClients);
  const { data: loans } = useQuery({ queryKey: ["active-loans"], queryFn: () => listFn() });
  const { data: allCharges } = useQuery({ queryKey: ["loan-charges"], queryFn: () => chargesFn() });
  const { data: clients } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => clientsFn({ data: { filter: "all" } }),
  });

  const selectedLoan = useMemo(
    () => (loans ?? []).find((l: any) => l.id === loanId) as any | undefined,
    [loans, loanId],
  );
  const principal = selectedLoan ? Number(selectedLoan.principal) : null;

  // Only non-capitalized, active charges linked to this loan's product.
  const availableCharges = useMemo(() => {
    if (!selectedLoan || !allCharges) return [];
    return (allCharges as any[]).filter(
      (c) =>
        c.active &&
        !c.capitalize &&
        Array.isArray(c.product_ids) &&
        c.product_ids.includes(selectedLoan.product_id),
    );
  }, [allCharges, selectedLoan]);

  const selectedCharge = useMemo(
    () => availableCharges.find((c: any) => c.id === chargeId),
    [availableCharges, chargeId],
  );

  // Auto-compute amount when charge is fixed/variable, and default supplier.
  useEffect(() => {
    if (!selectedCharge) return;
    if (selectedCharge.charge_type === "fixed") {
      setAmount(String(Number(selectedCharge.amount)));
    } else if (selectedCharge.charge_type === "variable" && principal) {
      const v = Math.round(((principal * Number(selectedCharge.amount)) / 100) * 100) / 100;
      setAmount(String(v));
    } else if (selectedCharge.charge_type === "manual") {
      setAmount("");
    }
    if (selectedCharge.origin === "outside") {
      setSupplierId((prev) => prev || selectedCharge.supplier_client_id || "");
    } else {
      setSupplierId("");
    }
  }, [selectedCharge, principal]);

  // Reset charge when loan changes.
  useEffect(() => {
    setChargeId("");
    setAmount("");
    setSupplierId("");
  }, [loanId]);

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

  function validate(): boolean {
    const e: Errors = {};
    if (!loanId) e.loan_id = "Select a facility";
    if (!chargeId) e.charge_id = "Select a charge";
    const amt = Number(amount);
    if (!amount || Number.isNaN(amt) || amt <= 0) e.amount = "Enter an amount";
    else if (amt < MIN_AMOUNT) e.amount = `Minimum ${money(MIN_AMOUNT)}`;
    else if (amt > MAX_AMOUNT) e.amount = `Maximum ${money(MAX_AMOUNT)}`;
    if (!entryDate) e.entry_date = "Entry date required";
    else if (daysBetween(entryDate, today()) > 0) e.entry_date = "Cannot be in the future";
    else if (daysBetween(today(), entryDate) > 365) e.entry_date = "Too far in the past";
    if (reference && !/^[A-Za-z0-9\-\/_ ]*$/.test(reference)) e.reference = "Invalid characters";
    if (selectedCharge?.origin === "outside" && !supplierId) e.supplier_client_id = "Select a supplier";
    if (description && description.length > 300) e.description = "Keep under 300 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  return (
    <div className="animate-fadein flex flex-col gap-4 max-w-4xl">
      <Link
        to="/loans"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to Loans
      </Link>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!validate()) {
            toast.error("Fix the highlighted fields before posting");
            return;
          }
          post.mutate({
            data: {
              loan_id: loanId,
              charge_id: chargeId,
              amount: Number(amount),
              entry_date: entryDate,
              ...(supplierId ? { supplier_client_id: supplierId } : {}),
              ...(reference ? { reference } : {}),
              ...(description ? { description } : {}),
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
                onChange={(e) => setLoanId(e.target.value)}
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
                onChange={(e) => setEntryDate(e.target.value)}
                className={(errors.entry_date ? errorInputCls : inputCls) + " font-mono"}
              />
            </FormField>

            <FormField
              label={`Amount (${getActiveCurrency()})`}
              required
              span={2}
              error={errors.amount}
              hint={
                !errors.amount && selectedCharge?.charge_type === "variable" && principal
                  ? `${Number(selectedCharge.amount)}% of ${money(principal)}`
                  : !errors.amount && selectedCharge?.charge_type === "manual"
                    ? "Enter amount"
                    : !errors.amount && principal
                      ? `Facility ${money(principal)}`
                      : undefined
              }
            >
              <input
                inputMode="decimal"
                value={amount}
                readOnly={selectedCharge?.charge_type !== "manual" && !!selectedCharge}
                onChange={(e) => {
                  const cleaned = e.target.value
                    .replace(/[^\d.]/g, "")
                    .replace(/(\..*)\./g, "$1")
                    .replace(/^(\d*\.\d{0,2}).*$/, "$1");
                  setAmount(cleaned);
                }}
                placeholder="0.00"
                className={`${errors.amount ? errorInputCls : inputCls} font-mono font-semibold`}
              />
            </FormField>

            <FormField label="Charge" required span={12} error={errors.charge_id}>
              {!loanId ? (
                <div className="text-[12px] text-muted-foreground italic px-1">
                  Select a facility to see available charges.
                </div>
              ) : availableCharges.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic px-1">
                  No non-capitalized charges configured for this facility's product.
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {availableCharges.map((c: any) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setChargeId(c.id)}
                      className={cn(
                        "text-left text-xs py-2 px-3 rounded-md border font-medium flex flex-col gap-0.5",
                        chargeId === c.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-input text-secondary-foreground hover:border-border-strong",
                      )}
                    >
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-[10.5px] opacity-80">
                        {c.origin === "inhouse" ? "In-house" : "Outside"} ·{" "}
                        {c.charge_type === "variable"
                          ? `${Number(c.amount)}%`
                          : c.charge_type === "manual"
                            ? "Manual"
                            : money(Number(c.amount))}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </FormField>

            {selectedCharge?.origin === "outside" && (
              <FormField label="Supplier" required span={7} error={errors.supplier_client_id}>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className={errors.supplier_client_id ? errorInputCls : selectCls}
                >
                  <option value="">— Select supplier —</option>
                  {((clients as any[]) ?? []).map((cl: any) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.full_name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <FormField
              label="Reference"
              span={selectedCharge?.origin === "outside" ? 5 : 12}
              error={errors.reference}
            >
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Auto DN-####"
                className={`${errors.reference ? errorInputCls : inputCls} font-mono`}
                maxLength={40}
              />
            </FormField>

            <FormField
              label="Description / notes"
              span={12}
              error={errors.description}
              hint={!errors.description ? `${description.length}/300 characters` : undefined}
            >
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
