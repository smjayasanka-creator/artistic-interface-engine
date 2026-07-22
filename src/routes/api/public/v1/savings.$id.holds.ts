// GET /api/public/v1/savings/{id}/holds
// List holds on a savings account. Ordered by created_at DESC.
// Filter: active=true|false to narrow to just active holds.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  SavingsHoldListResponse,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedSavingsAccount } from "@/lib/api-savings.server";

const CHANNEL = "savings";

const SELECT =
  "id, account_id, hold_type, amount, active, approval_state, release_status, reason, reason_code, doc_ref, effective_from, expires_at, linked_loan_id, released_at, created_at";

function rowToApi(r: any) {
  return {
    id: r.id,
    account_id: r.account_id,
    hold_type: String(r.hold_type),
    amount: Number(r.amount),
    active: !!r.active,
    approval_state: String(r.approval_state),
    release_status: String(r.release_status),
    reason: String(r.reason),
    reason_code: r.reason_code ?? null,
    doc_ref: r.doc_ref ?? null,
    effective_from: r.effective_from,
    expires_at: r.expires_at ?? null,
    linked_loan_id: r.linked_loan_id ?? null,
    released_at: r.released_at ? new Date(r.released_at).toISOString() : null,
    created_at: new Date(r.created_at).toISOString(),
  };
}

export const Route = createFileRoute("/api/public/v1/savings/$id/holds")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const endpoint = `/api/public/v1/savings/${params.id}/holds`;
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
        const activeParam = url.searchParams.get("active");

        let q = supabaseAdmin
          .from("savings_hold")
          .select(SELECT)
          .eq("account_id", acct.id)
          .order("created_at", { ascending: false });
        if (activeParam === "true") q = q.eq("active", true);
        else if (activeParam === "false") q = q.eq("active", false);

        const { data, error } = await q;
        if (error)
          return errJson({ code: 500, error: "read_failed", message: error.message });

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
        return validateAndSend(
          SavingsHoldListResponse,
          { data: (data ?? []).map(rowToApi) },
          200,
        );
      },
    },
  },
});
