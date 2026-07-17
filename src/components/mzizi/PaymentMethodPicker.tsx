import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClientBankAccounts, listClientSavingsAccounts } from "@/lib/fd.functions";
import { FormField, inputCls, selectCls } from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";

export type PaymentMethod = "cash" | "fund_transfer" | "cheque" | "sdf_savings";
type Span = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type PaymentMethodValue = {
  method: PaymentMethod;
  reference?: string;
  bank_account_id?: string;
  savings_account_id?: string;
};

const LABELS: Record<PaymentMethod, string> = {
  cash: "Cash Payment",
  fund_transfer: "Fund Transfer",
  cheque: "Cheque Payment",
  sdf_savings: "SDF Savings",
};

export function PaymentMethodPicker({
  allowed,
  clientId,
  value,
  onChange,
  span = 12,
}: {
  allowed: PaymentMethod[];
  clientId?: string;
  value: PaymentMethodValue;
  onChange: (v: PaymentMethodValue) => void;
  span?: Span;
}) {
  const banksFn = useServerFn(listClientBankAccounts);
  const savingsFn = useServerFn(listClientSavingsAccounts);

  const enableBanks = !!clientId && value.method === "fund_transfer";
  const enableSavings = !!clientId && value.method === "sdf_savings";

  const { data: banks } = useQuery({
    queryKey: ["client-bank-accounts", clientId],
    queryFn: () => banksFn({ data: { client_id: clientId! } }),
    enabled: enableBanks,
  });
  const { data: savings } = useQuery({
    queryKey: ["client-savings-accounts", clientId],
    queryFn: () => savingsFn({ data: { client_id: clientId! } }),
    enabled: enableSavings,
  });

  // Auto-select primary bank / first savings when method changes
  useEffect(() => {
    if (enableBanks && banks && !value.bank_account_id) {
      const primary = banks.find((b: any) => b.is_primary) ?? banks[0];
      if (primary) onChange({ ...value, bank_account_id: primary.id });
    }
    if (enableSavings && savings && !value.savings_account_id) {
      const first = savings[0];
      if (first) onChange({ ...value, savings_account_id: first.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableBanks, enableSavings, banks, savings]);

  const cols = useMemo(() => Math.min(4, allowed.length), [allowed]);

  return (
    <>
      <FormField label="Payment method" required span={span}>
        <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {allowed.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() =>
                onChange({
                  method: m,
                  reference: "",
                  bank_account_id: undefined,
                  savings_account_id: undefined,
                })
              }
              className={cn(
                "text-sm py-1.5 rounded-md border font-medium",
                value.method === m
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-input text-secondary-foreground hover:border-border-strong",
              )}
            >
              {LABELS[m]}
            </button>
          ))}
        </div>
      </FormField>

      {value.method === "fund_transfer" && (
        <>
          <FormField
            label="Client bank account"
            required
            span={span}
            hint={
              !clientId
                ? "Select client first"
                : banks && banks.length === 0
                ? "No bank accounts on file for this client"
                : undefined
            }
          >
            <select
              className={selectCls}
              value={value.bank_account_id ?? ""}
              onChange={(e) => onChange({ ...value, bank_account_id: e.target.value })}
              disabled={!clientId || !banks || banks.length === 0}
            >
              <option value="">Select account…</option>
              {(banks ?? []).map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.bank_name}
                  {b.branch_name ? ` · ${b.branch_name}` : ""} — {b.account_no}
                  {b.is_primary ? " (primary)" : ""}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Transfer reference" span={span}>
            <input
              className={`${inputCls} font-mono`}
              value={value.reference ?? ""}
              onChange={(e) => onChange({ ...value, reference: e.target.value })}
              maxLength={80}
              placeholder="e.g. RTGS/2026/00123"
            />
          </FormField>
        </>
      )}

      {value.method === "cheque" && (
        <FormField label="Cheque number" required span={span}>
          <input
            className={`${inputCls} font-mono`}
            value={value.reference ?? ""}
            onChange={(e) => onChange({ ...value, reference: e.target.value })}
            maxLength={40}
            placeholder="e.g. 000123"
          />
        </FormField>
      )}

      {value.method === "sdf_savings" && (
        <FormField
          label="SDF savings account"
          required
          span={span}
          hint={
            !clientId
              ? "Select client first"
              : savings && savings.length === 0
              ? "No active SDF savings account for this client"
              : undefined
          }
        >
          <select
            className={selectCls}
            value={value.savings_account_id ?? ""}
            onChange={(e) => onChange({ ...value, savings_account_id: e.target.value })}
            disabled={!clientId || !savings || savings.length === 0}
          >
            <option value="">Select account…</option>
            {(savings ?? []).map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.account_no}
                {s.product?.name ? ` — ${s.product.name}` : ""}
              </option>
            ))}
          </select>
        </FormField>
      )}

      {value.method === "cash" && null}
    </>
  );
}

export function paymentMethodValid(v: PaymentMethodValue): boolean {
  if (v.method === "cash") return true;
  if (v.method === "fund_transfer") return !!v.bank_account_id;
  if (v.method === "cheque") return !!v.reference && v.reference.trim().length > 0;
  if (v.method === "sdf_savings") return !!v.savings_account_id;
  return false;
}

/** Map UI method → savings/fd backend channel token. */
export function methodToChannel(m: PaymentMethod): "branch" | "ceft" | "other" {
  if (m === "cash") return "branch";
  if (m === "fund_transfer") return "ceft";
  return "other"; // cheque, sdf_savings
}
