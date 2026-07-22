// PATCH /api/public/v1/clients/{id}
// Partial-update mutable client fields. Company-scoped: returns 404 for
// clients that belong to another company (no cross-tenant leak).
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall, json } from "@/lib/api-auth.server";
import {
  ClientUpdateRequest,
  ClientUpdateResponse,
  parseJsonBody,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueWebhookForCompany } from "@/lib/webhooks.server";

const CHANNEL = "clients";

async function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  };
}

export const Route = createFileRoute("/api/public/v1/clients/$id/update")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: await corsHeaders() }),
      PATCH: async ({ request, params }) => {
        const endpoint = `/api/public/v1/clients/${params.id}`;
        const auth = await authenticateApiKey(request, "clients.write");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint,
            direction: "inbound",
          });

        const { data: existing } = await supabaseAdmin
          .from("client")
          .select("id, branch:branch_id(company_id)")
          .eq("id", params.id)
          .maybeSingle();
        if (!existing || (existing as any).branch?.company_id !== auth.key.company_id)
          return errJson({ code: 404, error: "not_found", message: "Client not found." });

        const parsed = await parseJsonBody(request, ClientUpdateRequest);
        if (!parsed.ok) return parsed.response;

        const patch: Record<string, unknown> = { ...parsed.data };
        // Rebuild full phone if either component changed
        if (parsed.data.phone_country_code || parsed.data.phone) {
          const { data: cur } = await supabaseAdmin
            .from("client")
            .select("phone_country_code, phone")
            .eq("id", params.id)
            .single();
          const cc = parsed.data.phone_country_code ?? (cur as any)?.phone_country_code ?? "";
          const raw = parsed.data.phone ?? String((cur as any)?.phone ?? "").replace(cc, "");
          patch.phone = `${cc}${raw}`;
        }
        // Recompute full_name when either name changes
        if (parsed.data.first_name || parsed.data.last_name) {
          const { data: cur } = await supabaseAdmin
            .from("client")
            .select("first_name, last_name")
            .eq("id", params.id)
            .single();
          const fn = parsed.data.first_name ?? (cur as any)?.first_name ?? "";
          const ln = parsed.data.last_name ?? (cur as any)?.last_name ?? "";
          patch.full_name = `${fn} ${ln}`.trim();
        }

        const { data: updated, error } = await supabaseAdmin
          .from("client")
          .update(patch as any)
          .eq("id", params.id)
          .select("id, full_name, phone")
          .single();
        if (error || !updated) {
          await logApiCall({
            company_id: auth.key.company_id,
            api_key_id: auth.key.id,
            channel: CHANNEL,
            direction: "inbound",
            endpoint,
            method: "PATCH",
            reference: params.id,
            status_code: 500,
            request: parsed.data,
            error: error?.message ?? "update_failed",
          });
          return errJson({
            code: 500,
            error: "update_failed",
            message: error?.message ?? "Failed to update client.",
          });
        }

        const body = {
          status: "updated" as const,
          client_id: updated.id,
          full_name: updated.full_name,
          phone: (updated as any).phone ?? null,
          updated_fields: Object.keys(parsed.data),
          updated_at: new Date().toISOString(),
        };

        try {
          await enqueueWebhookForCompany(supabaseAdmin as any, {
            company_id: auth.key.company_id,
            env: auth.key.environment,
            event_type: "client.updated",
            event_id: updated.id,
            payload: body,
          });
        } catch (e) {
          console.warn("[webhook] client.updated enqueue failed", e);
        }

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "inbound",
          endpoint,
          method: "PATCH",
          reference: params.id,
          status_code: 200,
          request: parsed.data,
          response: body,
        });
        return validateAndSend(ClientUpdateResponse, body, 200);
      },
    },
  },
});

// Silence unused warning for json helper (kept for parity with other routes).
void json;
