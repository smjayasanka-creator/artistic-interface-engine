// GET /api/public/v1/fixed-deposits/{id}
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ENDPOINT = "/api/public/v1/fixed-deposits/{id}";
const CHANNEL = "fixed_deposits";

export const Route = createFileRoute("/api/public/v1/fixed-deposits/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiKey(request, "fixed_deposits.read");
        if (!auth.ok) {
          return errJson({ code: auth.status, error: "unauthorized", message: auth.error });
        }
        const { data, error } = await supabaseAdmin
          .from("fixed_deposit")
          .select(
            "id, certificate_no, client_id, branch_id, product_id, principal, tenure_months, rate_at_booking, value_date, maturity_date, status, created_at, company_id",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errJson({ code: 500, error: "read_failed", message: error.message });
        if (!data || (data as any).company_id !== auth.key.company_id) {
          return errJson({ code: 404, error: "not_found", message: "Fixed deposit not found." });
        }
        const { company_id: _c, ...fd } = data as any;
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
        return Response.json(fd);
      },
    },
  },
});
