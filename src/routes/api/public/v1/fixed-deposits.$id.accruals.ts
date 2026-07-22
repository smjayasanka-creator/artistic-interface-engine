// GET /api/public/v1/fixed-deposits/{id}/accruals
// Daily interest accruals for a fixed deposit, newest first.
// Optional filters: since (accrual_date lower bound, inclusive), until (upper bound, inclusive).
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  FdAccrualListResponse,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedFixedDeposit } from "@/lib/api-fd.server";

const CHANNEL = "fixed_deposits";
const MAX_LIMIT = 400;
const DEFAULT_LIMIT = 100;

const SELECT =
  "id, deposit_id, accrual_date, daily_amount, cumulative_amount, released_at, released_ref";

function rowToApi(r: any) {
  return {
    id: r.id,
    deposit_id: r.deposit_id,
    accrual_date: r.accrual_date,
    daily_amount: Number(r.daily_amount),
    cumulative_amount: Number(r.cumulative_amount),
    released_at: r.released_at ? new Date(r.released_at).toISOString() : null,
    released_ref: r.released_ref ?? null,
  };
}

export const Route = createFileRoute("/api/public/v1/fixed-deposits/$id/accruals")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const endpoint = `/api/public/v1/fixed-deposits/${params.id}/accruals`;
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
        const limit = Math.min(
          MAX_LIMIT,
          Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)),
        );
        const since = url.searchParams.get("since");
        const until = url.searchParams.get("until");

        let q = supabaseAdmin
          .from("fd_accrual")
          .select(SELECT)
          .eq("deposit_id", fd.id)
          .order("accrual_date", { ascending: false })
          .limit(limit);
        if (since) q = q.gte("accrual_date", since);
        if (until) q = q.lte("accrual_date", until);

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
          FdAccrualListResponse,
          { data: (data ?? []).map(rowToApi) },
          200,
        );
      },
    },
  },
});
