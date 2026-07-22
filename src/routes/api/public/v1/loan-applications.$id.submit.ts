// POST /api/public/v1/loan-applications/{id}/submit
// Moves an application from draft → submitted via the atomic
// submit_loan_application RPC. Fires a best-effort
// loan_application.submitted webhook.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  LoanApplicationSubmitRequest,
  LoanApplicationSubmitResponse,
  parseJsonBody,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedApplication } from "@/lib/api-loan-app.server";
import { enqueueWebhookForCompany } from "@/lib/webhooks.server";

const CHANNEL = "loan_applications";

export const Route = createFileRoute("/api/public/v1/loan-applications/$id/submit")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const endpoint = `/api/public/v1/loan-applications/${params.id}/submit`;
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

        // Body is optional; parse empty as {}.
        let body: any = {};
        try {
          const text = await request.text();
          if (text.trim()) body = JSON.parse(text);
        } catch {
          return errJson({ code: 400, error: "invalid_json", message: "Body must be valid JSON." });
        }
        const parsedBody = LoanApplicationSubmitRequest.safeParse(body);
        if (!parsedBody.success)
          return errJson(
            { code: 400, error: "validation_failed", message: "Body failed schema validation." },
            parsedBody.error.flatten(),
          );

        const { error: rpcErr } = await supabaseAdmin.rpc("submit_loan_application" as any, {
          _application_id: app.id,
          _transition_key: parsedBody.data.transition_key ?? null,
        } as any);
        if (rpcErr) {
          await logApiCall({
            company_id: auth.key.company_id,
            api_key_id: auth.key.id,
            channel: CHANNEL,
            direction: "inbound",
            endpoint,
            method: "POST",
            reference: app.id,
            status_code: 409,
            request: parsedBody.data,
            error: rpcErr.message,
          });
          return errJson({
            code: 409,
            error: "submit_failed",
            message: rpcErr.message,
          });
        }

        // Re-read to pick up updated status/submitted_at.
        const { data: fresh } = await supabaseAdmin
          .from("loan_application" as any)
          .select("id, application_no, status, submitted_at")
          .eq("id", app.id)
          .single();
        const r = fresh as any;

        const respBody = {
          status: "submitted" as const,
          application_id: r.id,
          application_no: r.application_no,
          status_code: r.status,
          submitted_at: new Date(r.submitted_at ?? new Date().toISOString()).toISOString(),
        };

        try {
          await enqueueWebhookForCompany(supabaseAdmin as any, {
            company_id: auth.key.company_id,
            env: auth.key.environment,
            event_type: "loan_application.submitted",
            event_id: app.id,
            payload: respBody,
          });
        } catch (e) {
          console.warn("[webhook] loan_application.submitted enqueue failed", e);
        }

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "inbound",
          endpoint,
          method: "POST",
          reference: app.id,
          status_code: 200,
          request: parsedBody.data,
          response: respBody,
        });
        return validateAndSend(LoanApplicationSubmitResponse, respBody, 200);
      },
    },
  },
});
