// Server-only helper: posts API-channel money movements through the ledger
// kernel (post_entry_system) so external channels (CEFT, ATM, IB, inbound,
// outbound) feed the exact same balanced-entry pipeline as branch operations.
//
// A "channel suspense" liability account (code 2400) is credited/debited
// alongside cash so unsettled inflight amounts are visible in the trial
// balance. If either the cash (1000) or suspense (2400) account is missing
// for the company we simply skip posting — the API still returns 202 and
// the api_transaction_log row records what happened.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ApiLedgerDirection = "inbound" | "outbound";

/**
 * inbound  = money arriving from an external counterparty → DR Cash / CR Suspense
 * outbound = money leaving the institution → DR Suspense / CR Cash
 */
export async function postApiChannelEntry(opts: {
  company_id: string;
  direction: ApiLedgerDirection;
  amount: number;
  reference: string;
  description: string;
  source_module: "api" | "ceft" | "atm" | "ib" | "transactions";
  source_ref?: string | null;
  idempotency_key?: string | null;
  entry_date?: string; // YYYY-MM-DD
}): Promise<{ posted: boolean; entry_id?: string; skipped_reason?: string }> {
  if (opts.amount <= 0) return { posted: false, skipped_reason: "non_positive_amount" };

  // Resolve chart of accounts for the company
  const { data: accts } = await supabaseAdmin
    .from("gl_account")
    .select("id, code")
    .eq("company_id", opts.company_id)
    .in("code", ["1000", "2400"]);

  const cashId = accts?.find((a) => a.code === "1000")?.id;
  const suspenseId = accts?.find((a) => a.code === "2400")?.id;
  if (!cashId || !suspenseId) {
    return {
      posted: false,
      skipped_reason: !cashId ? "cash_account_missing" : "suspense_account_missing",
    };
  }

  const lines =
    opts.direction === "inbound"
      ? [
          { account_id: cashId, debit: opts.amount, credit: 0 },
          { account_id: suspenseId, debit: 0, credit: opts.amount },
        ]
      : [
          { account_id: suspenseId, debit: opts.amount, credit: 0 },
          { account_id: cashId, debit: 0, credit: opts.amount },
        ];

  const idem = opts.idempotency_key
    ? `${opts.source_module}:${opts.direction}:${opts.idempotency_key}`
    : `${opts.source_module}:${opts.direction}:${opts.reference}`;

  const { data, error } = await supabaseAdmin.rpc("post_entry_system", {
    _company_id: opts.company_id,
    _entry_date: opts.entry_date ?? new Date().toISOString().slice(0, 10),
    _reference: opts.reference,
    _description: opts.description,
    _lines: lines as any,
    _source_module: opts.source_module,
    _source_ref: (opts.source_ref ?? null) as any,
    _idempotency_key: idem,
  });
  if (error) return { posted: false, skipped_reason: error.message };
  return { posted: true, entry_id: data as unknown as string };
}
