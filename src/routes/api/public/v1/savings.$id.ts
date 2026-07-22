// GET /api/public/v1/savings/{id}
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ENDPOINT = "/api/public/v1/savings/{id}";
const CHANNEL = "savings";

export const Route = createFileRoute("/api/public/v1/savings/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiKey(request, "savings.read");
        if (!auth.ok) {
          return errJson({ code: auth.status, error: "unauthorized", message: auth.error });
        }
        const { data, error } = await supabaseAdmin
          .from("savings_account")
          .select(
            "id, account_no, client_id, branch_id, product_id, currency, balance, available_balance, status, opened_on, created_at, company_id",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errJson({ code: 500, error: "read_failed", message: error.message });
        if (!data || (data as any).company_id !== auth.key.company_id) {
          return errJson({ code: 404, error: "not_found", message: "Savings account not found." });
        }
        const { company_id: _c, ...acct } = data as any;
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
        return Response.json(acct);
      },
    },
  },
});
