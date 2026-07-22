// POST /api/public/v1/webhook-deliveries/{id}/replay — enqueue a fresh pending
// delivery cloned from a prior one so the background dispatcher retries it.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson, WebhookReplayResponse, validateAndSend } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHANNEL = "webhooks";

export const Route = createFileRoute("/api/public/v1/webhook-deliveries/$id/replay")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const endpoint = `/api/public/v1/webhook-deliveries/${params.id}/replay`;
        const auth = await authenticateApiKey(request, "webhooks.replay");
        if (!auth.ok) {
          await logApiCall({
            company_id: null,
            api_key_id: null,
            channel: CHANNEL,
            direction: "outbound",
            endpoint,
            method: "POST",
            status_code: auth.status,
            error: auth.error,
          });
          return errJson({ code: auth.status, error: "unauthorized", message: auth.error });
        }

        const { data: original, error: readErr } = await supabaseAdmin
          .from("webhook_delivery")
          .select("id, company_id, env, endpoint_id, event_id, event_type, payload")
          .eq("id", params.id)
          .maybeSingle();
        if (readErr)
          return errJson({ code: 500, error: "read_failed", message: readErr.message });
        if (!original)
          return errJson({ code: 404, error: "not_found", message: "Delivery not found." });
        const o = original as any;
        if (o.company_id !== auth.key.company_id || o.env !== auth.key.environment)
          return errJson({ code: 404, error: "not_found", message: "Delivery not found." });

        // Confirm the endpoint is still active before we re-queue.
        const { data: ep } = await supabaseAdmin
          .from("webhook_endpoint")
          .select("id, status")
          .eq("id", o.endpoint_id)
          .maybeSingle();
        if (!ep || (ep as any).status !== "active")
          return errJson({
            code: 409,
            error: "endpoint_inactive",
            message: "Webhook endpoint is not active; cannot replay.",
          });

        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("webhook_delivery")
          .insert({
            company_id: o.company_id,
            env: o.env,
            endpoint_id: o.endpoint_id,
            event_id: o.event_id,
            event_type: o.event_type,
            status: "pending",
            payload: o.payload,
          } as any)
          .select("id")
          .single();
        if (insErr || !inserted)
          return errJson({
            code: 500,
            error: "replay_failed",
            message: insErr?.message ?? "Insert failed.",
          });

        const body = {
          status: "requeued" as const,
          original_id: o.id,
          new_delivery_id: (inserted as any).id,
          event_type: o.event_type,
          endpoint_id: o.endpoint_id,
        };

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "outbound",
          endpoint,
          method: "POST",
          reference: o.id,
          status_code: 201,
          response: body,
        });

        return validateAndSend(WebhookReplayResponse, body, 201);
      },
    },
  },
});
