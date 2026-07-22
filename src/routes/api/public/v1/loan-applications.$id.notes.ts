// POST /api/public/v1/loan-applications/{id}/notes
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  LoanApplicationNoteRequest,
  LoanApplicationChildResponse,
  parseJsonBody,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedApplication } from "@/lib/api-loan-app.server";

const CHANNEL = "loan_applications";

export const Route = createFileRoute("/api/public/v1/loan-applications/$id/notes")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const endpoint = `/api/public/v1/loan-applications/${params.id}/notes`;
        const auth = await authenticateApiKey(request, "loan_applications.write");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint,
            direction: "inbound",
          });
        const app = await loadOwnedApplication(params.id, auth.key.company_id);
        if (!app)
          return errJson({ code: 404, error: "not_found", message: "Loan application not found." });
        const parsed = await parseJsonBody(request, LoanApplicationNoteRequest);
        if (!parsed.ok) return parsed.response;

        const { data: row, error } = await supabaseAdmin
          .from("loan_application_note" as any)
          .insert({
            application_id: app.id,
            application_no: app.application_no,
            note: parsed.data.note,
          } as any)
          .select("id, application_id, application_no, created_at")
          .single();
        if (error || !row)
          return errJson({ code: 500, error: "insert_failed", message: error?.message ?? "Insert failed." });
        const r = row as any;
        const body = {
          status: "created" as const,
          id: r.id,
          application_id: r.application_id,
          application_no: r.application_no,
          created_at: new Date(r.created_at).toISOString(),
        };
        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "inbound",
          endpoint,
          method: "POST",
          reference: app.id,
          status_code: 201,
          request: parsed.data,
          response: body,
        });
        return validateAndSend(LoanApplicationChildResponse, body, 201);
      },
    },
  },
});
