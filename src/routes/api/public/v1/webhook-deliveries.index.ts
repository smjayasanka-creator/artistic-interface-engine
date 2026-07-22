// GET /api/public/v1/webhook-deliveries — list outbound webhook deliveries
// for the caller's company + env. Cursor-paginated by created_at.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ENDPOINT = "/api/public/v1/webhook-deliveries";
const CHANNEL = "webhooks";
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

const SELECT =
  "id, endpoint_id, env, event_id, event_type, attempt, status, status_code, response_ms, response_snippet, next_retry_at, created_at";

export const Route = createFileRoute("/api/public/v1/webhook-deliveries/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request, "webhooks.read");
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
        const eventType = url.searchParams.get("event_type");
        const endpointId = url.searchParams.get("endpoint_id");

        let q = supabaseAdmin
          .from("webhook_delivery")
          .select(SELECT)
          .eq("company_id", auth.key.company_id)
          .eq("env", auth.key.environment)
          .order("created_at", { ascending: false })
          .limit(limit + 1);
        if (cursor) q = q.lt("created_at", cursor);
        if (status) q = q.eq("status", status);
        if (eventType) q = q.eq("event_type", eventType);
        if (endpointId) q = q.eq("endpoint_id", endpointId);

        const { data, error } = await q;
        if (error) return errJson({ code: 500, error: "read_failed", message: error.message });
        const rows = (data ?? []).map((r: any) => ({
          ...r,
          next_retry_at: r.next_retry_at ? new Date(r.next_retry_at).toISOString() : null,
          created_at: new Date(r.created_at).toISOString(),
        }));
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
