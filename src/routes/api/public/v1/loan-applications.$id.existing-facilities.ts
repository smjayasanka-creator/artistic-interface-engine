// POST /api/public/v1/loan-applications/{id}/existing-facilities
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  LoanApplicationExistingFacilityRequest,
  LoanApplicationChildResponse,
  parseJsonBody,
  validateAndSend,
  logAndReturnAuthError,
  checkIdempotency,
  withIdempotencyEnvelope,
  errJson,
  ERRORS,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedApplication } from "@/lib/api-loan-app.server";

const CHANNEL = "loan_applications";

export const Route = createFileRoute("/api/public/v1/loan-applications/$id/existing-facilities")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const endpoint = `/api/public/v1/loan-applications/${params.id}/existing-facilities`;
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
        const parsed = await parseJsonBody(request, LoanApplicationExistingFacilityRequest);
        if (!parsed.ok) return parsed.response;

        const idem = request.headers.get("Idempotency-Key");
        if (idem) {
          const hit = await checkIdempotency({
            company_id: auth.key.company_id,
            endpoint,
            key: idem,
            body: parsed.data,
          });
          if (hit.kind === "conflict") return errJson(ERRORS.idempotency_conflict);
          if (hit.kind === "replay")
            return validateAndSend(LoanApplicationChildResponse, hit.response as any, hit.status);
        }

        const { data: row, error } = await supabaseAdmin
          .from("loan_application_existing_facility" as any)
          .insert({
            application_id: app.id,
            application_no: app.application_no,
            lender_name: parsed.data.lender_name,
            facility_type: parsed.data.facility_type ?? null,
            original_amount: parsed.data.original_amount ?? null,
            outstanding_balance: parsed.data.outstanding_balance ?? null,
            monthly_instalment: parsed.data.monthly_instalment ?? null,
            maturity_date: parsed.data.maturity_date ?? null,
            status: parsed.data.status ?? null,
            extra: parsed.data.extra ?? {},
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
          request: withIdempotencyEnvelope(parsed.data, idem),
          response: body,
        });
        return validateAndSend(LoanApplicationChildResponse, body, 201);
      },
    },
  },
});
