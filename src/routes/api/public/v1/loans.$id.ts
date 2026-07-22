// GET /api/public/v1/loans/{id} — single-loan fetch, cross-tenant-safe.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ENDPOINT = "/api/public/v1/loans/{id}";
const CHANNEL = "loans";

export const Route = createFileRoute("/api/public/v1/loans/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiKey(request, "loans.read");
        if (!auth.ok) {
          return errJson({ code: auth.status, error: "unauthorized", message: auth.error });
        }

        const { data, error } = await supabaseAdmin
          .from("loan")
          .select(
            "id, contract_no, application_no, client_id, product_id, branch_id, principal, term_months, annual_rate_pct, frequency, status, disbursed_at, created_at, branch:branch_id(company_id)",
          )
          .eq("id", params.id)
          .maybeSingle();

        if (error) return errJson({ code: 500, error: "read_failed", message: error.message });
        if (!data || (data as any).branch?.company_id !== auth.key.company_id) {
          return errJson({ code: 404, error: "not_found", message: "Loan not found." });
        }

        const { branch: _b, ...loan } = data as any;

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

        return Response.json(loan);
      },
    },
  },
});
