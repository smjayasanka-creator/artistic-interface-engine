// POST /api/public/v1/clients/{id}/bank-accounts
// Attach a bank account to a client. If is_primary=true, previous primaries
// on the client are demoted so exactly one remains.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  ClientBankAccountCreateRequest,
  ClientBankAccountResponse,
  parseJsonBody,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHANNEL = "clients";

export const Route = createFileRoute("/api/public/v1/clients/$id/bank-accounts")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const endpoint = `/api/public/v1/clients/${params.id}/bank-accounts`;
        const auth = await authenticateApiKey(request, "clients.write");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint,
            direction: "inbound",
          });

        const { data: client } = await supabaseAdmin
          .from("client")
          .select("id, branch:branch_id(company_id)")
          .eq("id", params.id)
          .maybeSingle();
        if (!client || (client as any).branch?.company_id !== auth.key.company_id)
          return errJson({ code: 404, error: "not_found", message: "Client not found." });

        const parsed = await parseJsonBody(request, ClientBankAccountCreateRequest);
        if (!parsed.ok) return parsed.response;

        if (parsed.data.is_primary) {
          await supabaseAdmin
            .from("client_bank_account")
            .update({ is_primary: false } as any)
            .eq("client_id", params.id);
        }

        const { data: created, error } = await supabaseAdmin
          .from("client_bank_account")
          .insert({
            client_id: params.id,
            bank_name: parsed.data.bank_name,
            branch_name: parsed.data.branch_name ?? null,
            account_no: parsed.data.account_no,
            account_name: parsed.data.account_name,
            swift_code: parsed.data.swift_code ?? null,
            is_primary: parsed.data.is_primary ?? false,
          } as any)
          .select("id, client_id, bank_name, account_no, is_primary, created_at")
          .single();
        if (error || !created)
          return errJson({
            code: 500,
            error: "insert_failed",
            message: error?.message ?? "Failed to add bank account.",
          });

        const body = {
          status: "created" as const,
          bank_account_id: created.id,
          client_id: created.client_id,
          bank_name: created.bank_name,
          account_no: created.account_no,
          is_primary: created.is_primary,
          created_at: new Date(created.created_at as any).toISOString(),
        };

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "inbound",
          endpoint,
          method: "POST",
          reference: created.id,
          status_code: 201,
          request: parsed.data,
          response: body,
        });
        return validateAndSend(ClientBankAccountResponse, body, 201);
      },
    },
  },
});
