import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall, generateReference } from "@/lib/api-auth.server";
import {
  CribRequest,
  CribResponse,
  parseJsonBody,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
  requireHeader,
} from "@/lib/api-schemas.server";

const ENDPOINT = "/api/public/v1/crib/report";
const CHANNEL = "crib";

export const Route = createFileRoute("/api/public/v1/crib/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "crib");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint: ENDPOINT,
            direction: "outbound",
          });

        const consent = requireHeader(request, "X-Consent-Reference");
        if (!consent.ok) return consent.response;

        const parsed = await parseJsonBody(request, CribRequest);
        if (!parsed.ok) {
          await logApiCall({
            company_id: auth.key.company_id,
            api_key_id: auth.key.id,
            channel: CHANNEL,
            direction: "outbound",
            endpoint: ENDPOINT,
            method: "POST",
            status_code: 400,
            request: parsed.raw,
            error: "validation_failed",
          });
          return parsed.response;
        }
        if (parsed.data.consent_reference !== consent.value) {
          return errJson({
            code: 451,
            error: "consent_invalid",
            message: "X-Consent-Reference header must match body consent_reference.",
          });
        }

        const reference = generateReference("CRIB");
        const response = {
          status: "ok" as const,
          national_id: parsed.data.national_id,
          score: 742,
          band: "A",
          active_facilities: 3,
          delinquencies_12m: 0,
          report_generated_at: new Date().toISOString(),
          report_url: `https://crib.example/reports/${reference.toLowerCase()}.pdf`,
        };
        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "outbound",
          endpoint: ENDPOINT,
          method: "POST",
          reference,
          status_code: 200,
          request: parsed.data,
          response,
        });
        return validateAndSend(CribResponse, response, 200);
      },
    },
  },
});
