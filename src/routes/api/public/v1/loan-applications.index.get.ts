// GET /api/public/v1/loan-applications — cursor-paginated list scoped to the
// API key's company. Newest first. Safe projection (no client PII beyond the
// linked client_id the caller already owns).
//
// Note: the POST handler for the same path lives in
// `loan-applications.index.ts`. TanStack Router allows multiple files to
// contribute handlers to the same route path as long as the file route id
// differs, so this file declares a GET-only handler on the trailing-slash id.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ENDPOINT = "/api/public/v1/loan-applications";
const CHANNEL = "loan_applications";
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

const SELECT =
  "id, application_no, company_id, branch_id, client_id, product_id, officer_id, requested_principal, requested_tenor_months, requested_rate_pct, frequency, currency, purpose, channel, status, submitted_at, decided_at, disbursed_at, loan_id, created_at";

export const Route = createFileRoute("/api/public/v1/loan-applications/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request, "loan_applications.read");
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
        const status = url.searchParams.get("status");

        let q = supabaseAdmin
          .from("loan_application" as any)
          .select(SELECT)
          .eq("company_id", auth.key.company_id)
          .order("created_at", { ascending: false })
          .limit(limit + 1);
        if (cursor) q = q.lt("created_at", cursor);
        if (status) q = q.eq("status", status);

        const { data, error } = await q;
        if (error) return errJson({ code: 500, error: "read_failed", message: error.message });
        const rows = (data ?? []) as any[];
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const next_cursor = hasMore ? page[page.length - 1].created_at : null;

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
