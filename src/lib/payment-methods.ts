import { z } from "zod";

export const PAYMENT_METHODS = ["cash", "fund_transfer", "cheque", "sdf_savings"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ALLOWED_BY_TXN: Record<
  "savings_withdrawal" | "loan_disbursement" | "fd_withdrawal",
  readonly PaymentMethod[]
> = {
  savings_withdrawal: ["cash", "fund_transfer", "cheque", "sdf_savings"],
  loan_disbursement: ["fund_transfer", "cheque", "sdf_savings"],
  fd_withdrawal: ["fund_transfer", "cheque", "sdf_savings"],
};

export const paymentMethodPayload = z.object({
  payment_method: z.enum(PAYMENT_METHODS),
  bank_account_id: z.string().uuid().optional().nullable(),
  savings_account_id: z.string().uuid().optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
});
export type PaymentMethodPayload = z.infer<typeof paymentMethodPayload>;

/**
 * Server-side guard: throws if the method is not allowed for the given
 * transaction type, or if required companion fields are missing.
 */
export function assertPaymentMethod(
  kind: keyof typeof ALLOWED_BY_TXN,
  p: PaymentMethodPayload,
): void {
  const allowed = ALLOWED_BY_TXN[kind];
  if (!allowed.includes(p.payment_method)) {
    throw new Error(
      `Payment method '${p.payment_method}' is not allowed for ${kind.replace(/_/g, " ")}`,
    );
  }
  if (p.payment_method === "fund_transfer" && !p.bank_account_id) {
    throw new Error("Fund transfer requires a client bank account");
  }
  if (p.payment_method === "cheque" && !(p.reference && p.reference.trim().length > 0)) {
    throw new Error("Cheque payment requires a cheque number");
  }
  if (p.payment_method === "sdf_savings" && !p.savings_account_id) {
    throw new Error("SDF savings payout requires the linked SDF savings account");
  }
}
