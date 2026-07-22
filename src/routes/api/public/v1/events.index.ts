// GET /api/public/v1/events — cursor-paginated domain event feed for the
// caller's company. Lets integrators reconcile without polling each resource.
// Ordered by occurred_at DESC. Filters: event_type, aggregate_type,
// aggregate_id, since (ISO datetime, inclusive lower bound).
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson, logAndReturnAuthError } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ENDPOINT = "/api/public/v1/events";
const CHANNEL = "events";
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

const SELECT =
  "id, event_type, domain, aggregate_type, aggregate_id, occurred_at, created_at, idempotency_key";

export const Route = createFileRoute("/api/public/v1/events/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request, "events.read");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint: ENDPOINT,
            direction: "outbound",
          });

        const url = new URL(request.url);
        const limit = Math.min(
          MAX_LIMIT,
          Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)),
        );
        const cursor = url.searchParams.get("cursor");
        const eventType = url.searchParams.get("event_type");
        const aggregateType = url.searchParams.get("aggregate_type");
        const aggregateId = url.searchParams.get("aggregate_id");
        const since = url.searchParams.get("since");

        let q = supabaseAdmin
          .from("domain_event")
          .select(SELECT)
          .eq("company_id", auth.key.company_id)
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(limit + 1);
        if (cursor) q = q.lt("occurred_at", cursor);
        if (eventType) q = q.eq("event_type", eventType);
        if (aggregateType) q = q.eq("aggregate_type", aggregateType);
        if (aggregateId) q = q.eq("aggregate_id", aggregateId);
        if (since) q = q.gte("occurred_at", since);

        const { data, error } = await q;
        if (error)
          return errJson({ code: 500, error: "read_failed", message: error.message });
        const rows = (data ?? []).map((r: any) => ({
          ...r,
          occurred_at: new Date(r.occurred_at).toISOString(),
          created_at: new Date(r.created_at).toISOString(),
        }));
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const next_cursor = hasMore ? page[page.length - 1].occurred_at : null;

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
