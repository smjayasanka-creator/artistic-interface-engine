// GET /api/public/v1/clients/{id} — single-client fetch, scoped to the API
// key's company. Returns 404 if the id belongs to another company so we
// don't leak existence across tenants.

import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ENDPOINT = "/api/public/v1/clients/{id}";
const CHANNEL = "clients";

export const Route = createFileRoute("/api/public/v1/clients/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiKey(request, "clients.read");
        if (!auth.ok) {
          return errJson({ code: auth.status, error: "unauthorized", message: auth.error });
        }

        const { data, error } = await supabaseAdmin
          .from("client")
          .select(
            "id, full_name, phone, national_id, branch_id, status, created_at, branch:branch_id(company_id)",
          )
          .eq("id", params.id)
          .maybeSingle();

        if (error) return errJson({ code: 500, error: "read_failed", message: error.message });
        if (!data || (data as any).branch?.company_id !== auth.key.company_id) {
          return errJson({ code: 404, error: "not_found", message: "Client not found." });
        }

        const { branch: _b, ...client } = data as any;

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "outbound",
          endpoint: ENDPOINT,
          method: "GET",
          reference: params.id,
          status_code: 200,
        });

        return Response.json(client);
      },
    },
  },
});
