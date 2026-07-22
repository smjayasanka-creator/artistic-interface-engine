// POST /api/public/v1/loan-applications/{id}/decide
// Approve or reject a submitted loan application via decide_loan_application RPC.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  LoanApplicationDecideRequest,
  LoanApplicationDecideResponse,
  parseJsonBody,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedApplication } from "@/lib/api-loan-app.server";
import { enqueueWebhookForCompany } from "@/lib/webhooks.server";

const CHANNEL = "loan_applications";

export const Route = createFileRoute("/api/public/v1/loan-applications/$id/decide")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const endpoint = `/api/public/v1/loan-applications/${params.id}/decide`;
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
        const parsed = await parseJsonBody(request, LoanApplicationDecideRequest);
        if (!parsed.ok) return parsed.response;

        const { error: rpcErr } = await supabaseAdmin.rpc("decide_loan_application" as any, {
          _application_id: app.id,
          _decision: parsed.data.decision,
          _comment: parsed.data.comment ?? null,
          _step_key: parsed.data.step_key ?? null,
          _workflow_instance_id: parsed.data.workflow_instance_id ?? null,
          _transition_key: parsed.data.transition_key ?? null,
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
            request: parsed.data,
            error: rpcErr.message,
          });
          return errJson({ code: 409, error: "decision_failed", message: rpcErr.message });
        }

        const { data: fresh } = await supabaseAdmin
          .from("loan_application" as any)
          .select("id, application_no, status, decided_at")
          .eq("id", app.id)
          .single();
        const r = fresh as any;
        const body = {
          status: "decided" as const,
          application_id: r.id,
          application_no: r.application_no,
          decision: parsed.data.decision,
          status_code: r.status,
          decided_at: new Date(r.decided_at ?? new Date().toISOString()).toISOString(),
        };

        try {
          await enqueueWebhookForCompany(supabaseAdmin as any, {
            company_id: auth.key.company_id,
            env: auth.key.environment,
            event_type:
              parsed.data.decision === "approve"
                ? "loan_application.approved"
                : "loan_application.rejected",
            event_id: app.id,
            payload: body,
          });
        } catch (e) {
          console.warn("[webhook] loan_application.decided enqueue failed", e);
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
          request: parsed.data,
          response: body,
        });
        return validateAndSend(LoanApplicationDecideResponse, body, 200);
      },
    },
  },
});
