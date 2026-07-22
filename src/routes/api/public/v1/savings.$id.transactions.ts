// GET /api/public/v1/savings/{id}/transactions
// Cursor-paginated ledger for a savings account. Ordered by created_at DESC.
// Filters: txn_type, since (ISO datetime, inclusive lower bound on created_at).
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  SavingsTransactionListResponse,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedSavingsAccount } from "@/lib/api-savings.server";

const CHANNEL = "savings";
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

const SELECT =
  "id, account_id, txn_type, amount, channel, running_balance, reference, external_ref, narration, payment_method, clearing_status, cleared_on, txn_date, created_at, reverses_txn_id, reversed_by_txn_id";

function rowToApi(r: any) {
  return {
    id: r.id,
    account_id: r.account_id,
    txn_type: String(r.txn_type),
    amount: Number(r.amount),
    channel: String(r.channel),
    running_balance: Number(r.running_balance),
    reference: r.reference ?? null,
    external_ref: r.external_ref ?? null,
    narration: r.narration ?? null,
    payment_method: r.payment_method ?? null,
    clearing_status: String(r.clearing_status),
    cleared_on: r.cleared_on ?? null,
    txn_date: r.txn_date,
    created_at: new Date(r.created_at).toISOString(),
    reverses_txn_id: r.reverses_txn_id ?? null,
    reversed_by_txn_id: r.reversed_by_txn_id ?? null,
  };
}

export const Route = createFileRoute("/api/public/v1/savings/$id/transactions")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const endpoint = `/api/public/v1/savings/${params.id}/transactions`;
        const auth = await authenticateApiKey(request, "savings.read");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint,
            direction: "outbound",
          });
        const acct = await loadOwnedSavingsAccount(params.id, auth.key.company_id);
        if (!acct)
          return errJson({ code: 404, error: "not_found", message: "Savings account not found." });

        const url = new URL(request.url);
        const limit = Math.min(
          MAX_LIMIT,
          Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)),
        );
        const cursor = url.searchParams.get("cursor");
        const txnType = url.searchParams.get("txn_type");
        const since = url.searchParams.get("since");

        let q = supabaseAdmin
          .from("savings_transaction")
          .select(SELECT)
          .eq("account_id", acct.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(limit + 1);
        if (cursor) q = q.lt("created_at", cursor);
        if (txnType) q = q.eq("txn_type", txnType as any);
        if (since) q = q.gte("created_at", since);

        const { data, error } = await q;
        if (error)
          return errJson({ code: 500, error: "read_failed", message: error.message });

        const rows = (data ?? []).map(rowToApi);
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const next_cursor = hasMore ? page[page.length - 1].created_at : null;

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "outbound",
          endpoint,
          method: "GET",
          reference: acct.id,
          status_code: 200,
        });
        return validateAndSend(SavingsTransactionListResponse, { data: page, next_cursor }, 200);
      },
    },
  },
});
