// GET /api/public/v1/loans — cursor-paginated list scoped to the API key's
// company + env. Safe projection: no PII beyond references already owned by
// the caller.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ENDPOINT = "/api/public/v1/loans";
const CHANNEL = "loans";
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

const SELECT =
  "id, contract_no, application_no, client_id, product_id, branch_id, principal, term_months, annual_rate_pct, frequency, status, disbursed_at, created_at";

export const Route = createFileRoute("/api/public/v1/loans/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request, "loans.read");
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

        const { data: branches } = await supabaseAdmin
          .from("branch")
          .select("id")
          .eq("company_id", auth.key.company_id);
        const branchIds = (branches ?? []).map((b: any) => b.id);
        if (branchIds.length === 0) {
          return Response.json({ data: [], next_cursor: null });
        }

        let q = supabaseAdmin
          .from("loan")
          .select(SELECT)
          .in("branch_id", branchIds)
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
