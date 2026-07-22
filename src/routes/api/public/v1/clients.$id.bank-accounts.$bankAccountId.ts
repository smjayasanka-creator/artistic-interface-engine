// DELETE /api/public/v1/clients/{id}/bank-accounts/{bankAccountId}
// Remove a bank account. Enforces the {id,bankAccountId} pair belongs to the
// caller's company (via the parent client's branch).
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  ClientBankAccountDeleteResponse,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHANNEL = "clients";

export const Route = createFileRoute(
  "/api/public/v1/clients/$id/bank-accounts/$bankAccountId",
)({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const endpoint = `/api/public/v1/clients/${params.id}/bank-accounts/${params.bankAccountId}`;
        const auth = await authenticateApiKey(request, "clients.write");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint,
            direction: "inbound",
          });

        const { data: row } = await supabaseAdmin
          .from("client_bank_account")
          .select("id, client_id, client:client_id(branch:branch_id(company_id))")
          .eq("id", params.bankAccountId)
          .eq("client_id", params.id)
          .maybeSingle();
        const companyId = (row as any)?.client?.branch?.company_id;
        if (!row || companyId !== auth.key.company_id)
          return errJson({ code: 404, error: "not_found", message: "Bank account not found." });

        const { error } = await supabaseAdmin
          .from("client_bank_account")
          .delete()
          .eq("id", params.bankAccountId);
        if (error)
          return errJson({ code: 500, error: "delete_failed", message: error.message });

        const body = {
          status: "deleted" as const,
          bank_account_id: params.bankAccountId,
          client_id: params.id,
        };

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "inbound",
          endpoint,
          method: "DELETE",
          reference: params.bankAccountId,
          status_code: 200,
          response: body,
        });
        return validateAndSend(ClientBankAccountDeleteResponse, body, 200);
      },
    },
  },
});
