// GET /api/public/v1/savings — cursor-paginated list scoped to the API key's
// company (via savings_account.company_id).
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ENDPOINT = "/api/public/v1/savings";
const CHANNEL = "savings";
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const SELECT =
  "id, account_no, client_id, branch_id, product_id, currency, balance, available_balance, status, opened_on, created_at";

export const Route = createFileRoute("/api/public/v1/savings/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request, "savings.read");
        if (!auth.ok) {
          await logApiCall({
            company_id: null,
            api_key_id: null,
            channel: CHANNEL,
            direction: "outbound",
            endpoint: ENDPOINT,
            method: "GET",
            status_code: auth.status,
            error: auth.error,
          });
          return errJson({ code: auth.status, error: "unauthorized", message: auth.error });
        }

        const url = new URL(request.url);
        const limit = Math.min(
          MAX_LIMIT,
          Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)),
        );
        const cursor = url.searchParams.get("cursor");

        let q = supabaseAdmin
          .from("savings_account")
          .select(SELECT)
          .eq("company_id", auth.key.company_id)
          .order("created_at", { ascending: false })
          .limit(limit + 1);
        if (cursor) q = q.lt("created_at", cursor);

        const { data, error } = await q;
        if (error) return errJson({ code: 500, error: "read_failed", message: error.message });
        const rows = data ?? [];
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const next_cursor = hasMore ? (page[page.length - 1] as any).created_at : null;

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "outbound",
          endpoint: ENDPOINT,
          method: "GET",
          status_code: 200,
        });

        return Response.json({ data: page, next_cursor });
      },
    },
  },
});
