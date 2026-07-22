// GET /api/public/v1/fixed-deposits/{id}/schedule
// Interest payout schedule for a fixed deposit, ordered by seq ASC.
// Optional filter: paid=true|false.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  FdInterestScheduleListResponse,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedFixedDeposit } from "@/lib/api-fd.server";

const CHANNEL = "fixed_deposits";

const SELECT =
  "id, deposit_id, seq, due_date, gross_interest, wht_amount, net_interest, paid, paid_date";

function rowToApi(r: any) {
  return {
    id: r.id,
    deposit_id: r.deposit_id,
    seq: Number(r.seq),
    due_date: r.due_date,
    gross_interest: Number(r.gross_interest),
    wht_amount: Number(r.wht_amount),
    net_interest: Number(r.net_interest),
    paid: !!r.paid,
    paid_date: r.paid_date ?? null,
  };
}

export const Route = createFileRoute("/api/public/v1/fixed-deposits/$id/schedule")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const endpoint = `/api/public/v1/fixed-deposits/${params.id}/schedule`;
        const auth = await authenticateApiKey(request, "fixed_deposits.read");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint,
            direction: "outbound",
          });
        const fd = await loadOwnedFixedDeposit(params.id, auth.key.company_id);
        if (!fd)
          return errJson({ code: 404, error: "not_found", message: "Fixed deposit not found." });

        const url = new URL(request.url);
        const paidParam = url.searchParams.get("paid");

        let q = supabaseAdmin
          .from("fd_interest_schedule")
          .select(SELECT)
          .eq("deposit_id", fd.id)
          .order("seq", { ascending: true });
        if (paidParam === "true") q = q.eq("paid", true);
        else if (paidParam === "false") q = q.eq("paid", false);

        const { data, error } = await q;
        if (error) return errJson({ code: 500, error: "read_failed", message: error.message });

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "outbound",
          endpoint,
          method: "GET",
          reference: fd.id,
          status_code: 200,
        });
        return validateAndSend(
          FdInterestScheduleListResponse,
          { data: (data ?? []).map(rowToApi) },
          200,
        );
      },
    },
  },
});
