// POST /api/public/v1/loan-applications/{id}/disburse
// Books the loan atomically from an approved application via
// disburse_loan_from_application. Supports Idempotency-Key.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  LoanApplicationDisburseRequest,
  LoanApplicationDisburseResponse,
  parseJsonBody,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
  checkIdempotency,
  withIdempotencyEnvelope,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedApplication } from "@/lib/api-loan-app.server";
import { enqueueWebhookForCompany } from "@/lib/webhooks.server";

const CHANNEL = "loan_applications";

export const Route = createFileRoute("/api/public/v1/loan-applications/$id/disburse")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const endpoint = `/api/public/v1/loan-applications/${params.id}/disburse`;
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
        const parsed = await parseJsonBody(request, LoanApplicationDisburseRequest);
        if (!parsed.ok) return parsed.response;

        const idem = request.headers.get("Idempotency-Key");
        if (idem) {
          const prior = await checkIdempotency({
            company_id: auth.key.company_id,
            endpoint,
            key: idem,
            body: parsed.data,
          });
          if (prior.kind === "conflict")
            return errJson({
              code: 409,
              error: "idempotency_conflict",
              message: "Idempotency-Key reused with different body.",
            });
          if (prior.kind === "replay")
            return validateAndSend(
              LoanApplicationDisburseResponse,
              { ...(prior.response as any), idempotent_replay: true },
              prior.status,
            );
        }

        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc(
          "disburse_loan_from_application" as any,
          {
            _application_id: app.id,
            _payment_channel: parsed.data.payment_channel ?? "fund_transfer",
            _payment_reference: parsed.data.payment_reference ?? null,
            _idempotency_key: idem ?? null,
          } as any,
        );
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
          return errJson({ code: 409, error: "disburse_failed", message: rpcErr.message });
        }
        const rpc = (rpcData as any) ?? {};
        const loanId: string | null = rpc.loan_id ?? null;
        if (!loanId)
          return errJson({
            code: 500,
            error: "disburse_failed",
            message: "RPC did not return a loan_id.",
          });

        const { data: loanRow } = await supabaseAdmin
          .from("loan" as any)
          .select("id, contract_no, status, disbursed_at")
          .eq("id", loanId)
          .single();
        const l = loanRow as any;
        const { data: appFresh } = await supabaseAdmin
          .from("loan_application" as any)
          .select("status")
          .eq("id", app.id)
          .single();

        const body = {
          status: "disbursed" as const,
          application_id: app.id,
          application_no: app.application_no,
          loan_id: loanId,
          contract_no: l?.contract_no ?? null,
          status_code: (appFresh as any)?.status ?? "disbursed",
          disbursed_at: new Date(l?.disbursed_at ?? new Date().toISOString()).toISOString(),
          idempotent_replay: false,
        };

        try {
          await enqueueWebhookForCompany(supabaseAdmin as any, {
            company_id: auth.key.company_id,
            env: auth.key.environment,
            event_type: "loan.disbursed",
            event_id: loanId,
            payload: body,
          });
        } catch (e) {
          console.warn("[webhook] loan.disbursed enqueue failed", e);
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
          request: idem ? withIdempotencyEnvelope(parsed.data, idem) : parsed.data,
          response: body,
        });
        return validateAndSend(LoanApplicationDisburseResponse, body, 200);
      },
    },
  },
});
