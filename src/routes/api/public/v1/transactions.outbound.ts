import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall, generateReference } from "@/lib/api-auth.server";
import {
  TransactionsOutboundRequest, TransactionsOutboundResponse,
  parseJsonBody, validateAndSend, logAndReturnAuthError,
  checkIdempotency, withIdempotencyEnvelope, errJson, ERRORS, requireHeader,
} from "@/lib/api-schemas.server";

const ENDPOINT = "/api/public/v1/transactions/outbound";
const CHANNEL = "transactions";

export const Route = createFileRoute("/api/public/v1/transactions/outbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "transactions.outbound");
        if (!auth.ok) return logAndReturnAuthError({ status: auth.status, error: auth.error, channel: CHANNEL, endpoint: ENDPOINT, direction: "outbound" });

        const idemHeader = requireHeader(request, "Idempotency-Key");
        if (!idemHeader.ok) return idemHeader.response;

        const parsed = await parseJsonBody(request, TransactionsOutboundRequest);
        if (!parsed.ok) {
          await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "outbound",
            endpoint: ENDPOINT, method: "POST", status_code: 400, request: parsed.raw, error: "validation_failed" });
          return parsed.response;
        }

        const hit = await checkIdempotency({ company_id: auth.key.company_id, endpoint: ENDPOINT, key: idemHeader.value, body: parsed.data });
        if (hit.kind === "conflict") return errJson(ERRORS.idempotency_conflict);
        if (hit.kind === "replay") return validateAndSend(TransactionsOutboundResponse, hit.response as any, hit.status);

        const reference = generateReference("OUT");
        const response = {
          status: "queued" as const,
          reference,
          idempotency_key: parsed.data.idempotency_key,
          submitted_at: new Date().toISOString(),
        };
        await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "outbound",
          endpoint: ENDPOINT, method: "POST", reference, status_code: 202,
          request: withIdempotencyEnvelope(parsed.data, idemHeader.value), response });
        return validateAndSend(TransactionsOutboundResponse, response, 202);
      },
    },
  },
});
