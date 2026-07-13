import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall, generateReference } from "@/lib/api-auth.server";
import {
  CeftRequest, CeftResponse,
  parseJsonBody, validateAndSend, logAndReturnAuthError,
  checkIdempotency, withIdempotencyEnvelope, errJson, ERRORS,
} from "@/lib/api-schemas.server";
import { postApiChannelEntry } from "@/lib/api-ledger.server";


const ENDPOINT = "/api/public/v1/ceft/transfer";
const CHANNEL = "ceft";

export const Route = createFileRoute("/api/public/v1/ceft/transfer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "ceft");
        if (!auth.ok) return logAndReturnAuthError({ status: auth.status, error: auth.error, channel: CHANNEL, endpoint: ENDPOINT, direction: "outbound" });

        const parsed = await parseJsonBody(request, CeftRequest);
        if (!parsed.ok) {
          await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "outbound",
            endpoint: ENDPOINT, method: "POST", status_code: 400, request: parsed.raw, error: "validation_failed" });
          return parsed.response;
        }

        const idem = request.headers.get("Idempotency-Key");
        if (idem) {
          const hit = await checkIdempotency({ company_id: auth.key.company_id, endpoint: ENDPOINT, key: idem, body: parsed.data });
          if (hit.kind === "conflict") return errJson(ERRORS.idempotency_conflict);
          if (hit.kind === "replay") return validateAndSend(CeftResponse, hit.response as any, hit.status);
        }

        const reference = generateReference("CEFT");
        const response = {
          status: "accepted" as const,
          ceft_reference: reference,
          session_id: parsed.data.session_id,
          cleared_at: null,
        };
        await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL,
          direction: parsed.data.transaction_type === "credit" ? "outbound" : "inbound",
          endpoint: ENDPOINT, method: "POST", reference, status_code: 202,
          request: withIdempotencyEnvelope(parsed.data, idem), response });
        return validateAndSend(CeftResponse, response, 202);
      },
    },
  },
});
