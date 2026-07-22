// GET /api/public/v1/webhook-deliveries/{id} — detail incl. payload
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHANNEL = "webhooks";

export const Route = createFileRoute("/api/public/v1/webhook-deliveries/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const endpoint = `/api/public/v1/webhook-deliveries/${params.id}`;
        const auth = await authenticateApiKey(request, "webhooks.read");
        if (!auth.ok) {
          await logApiCall({
            company_id: null,
            api_key_id: null,
            channel: CHANNEL,
            direction: "outbound",
            endpoint,
            method: "GET",
            status_code: auth.status,
            error: auth.error,
          });
          return errJson({ code: auth.status, error: "unauthorized", message: auth.error });
        }

        const { data, error } = await supabaseAdmin
          .from("webhook_delivery")
          .select(
            "id, company_id, endpoint_id, env, event_id, event_type, attempt, status, status_code, response_ms, response_snippet, next_retry_at, payload, created_at",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errJson({ code: 500, error: "read_failed", message: error.message });
        if (!data)
          return errJson({ code: 404, error: "not_found", message: "Delivery not found." });
        const r = data as any;
        if (r.company_id !== auth.key.company_id || r.env !== auth.key.environment)
          return errJson({ code: 404, error: "not_found", message: "Delivery not found." });

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "outbound",
          endpoint,
          method: "GET",
          reference: r.id,
          status_code: 200,
        });

        return Response.json({
          id: r.id,
          endpoint_id: r.endpoint_id,
          env: r.env,
          event_id: r.event_id,
          event_type: r.event_type,
          attempt: r.attempt,
          status: r.status,
          status_code: r.status_code,
          response_ms: r.response_ms,
          response_snippet: r.response_snippet,
          next_retry_at: r.next_retry_at ? new Date(r.next_retry_at).toISOString() : null,
          created_at: new Date(r.created_at).toISOString(),
          payload: r.payload ?? null,
        });
      },
    },
  },
});
