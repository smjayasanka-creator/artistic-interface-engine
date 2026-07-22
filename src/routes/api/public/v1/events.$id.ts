// GET /api/public/v1/events/{id} — fetch a single domain event with payload.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson, logAndReturnAuthError } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHANNEL = "events";

export const Route = createFileRoute("/api/public/v1/events/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const endpoint = `/api/public/v1/events/${params.id}`;
        const auth = await authenticateApiKey(request, "events.read");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint,
            direction: "outbound",
          });

        const { data, error } = await supabaseAdmin
          .from("domain_event")
          .select(
            "id, event_type, domain, aggregate_type, aggregate_id, occurred_at, created_at, idempotency_key, payload, metadata, company_id",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (error)
          return errJson({ code: 500, error: "read_failed", message: error.message });
        if (!data || (data as any).company_id !== auth.key.company_id)
          return errJson({ code: 404, error: "not_found", message: "Event not found." });

        const r = data as any;
        const body = {
          id: r.id,
          event_type: r.event_type,
          domain: r.domain ?? null,
          aggregate_type: r.aggregate_type ?? null,
          aggregate_id: r.aggregate_id ?? null,
          occurred_at: new Date(r.occurred_at).toISOString(),
          created_at: new Date(r.created_at).toISOString(),
          idempotency_key: r.idempotency_key ?? null,
          payload: r.payload ?? null,
          metadata: r.metadata ?? null,
        };
        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "outbound",
          endpoint,
          method: "GET",
          reference: params.id,
          status_code: 200,
        });
        return Response.json(body);
      },
    },
  },
});
