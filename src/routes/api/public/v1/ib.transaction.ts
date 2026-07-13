import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall, generateReference } from "@/lib/api-auth.server";
import {
  IbRequest, IbResponse,
  parseJsonBody, validateAndSend, logAndReturnAuthError,
  checkIdempotency, withIdempotencyEnvelope, errJson, ERRORS, requireHeader,
} from "@/lib/api-schemas.server";
import { postApiChannelEntry } from "@/lib/api-ledger.server";


const ENDPOINT = "/api/public/v1/ib/transaction";
const CHANNEL = "internet_banking";

export const Route = createFileRoute("/api/public/v1/ib/transaction")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "internet_banking");
        if (!auth.ok) return logAndReturnAuthError({ status: auth.status, error: auth.error, channel: CHANNEL, endpoint: ENDPOINT, direction: "inbound" });

        const fp = requireHeader(request, "X-Device-Fingerprint");
        if (!fp.ok) return fp.response;
        const idem = requireHeader(request, "Idempotency-Key");
        if (!idem.ok) return idem.response;

        const parsed = await parseJsonBody(request, IbRequest);
        if (!parsed.ok) {
          await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "inbound",
            endpoint: ENDPOINT, method: "POST", status_code: 400, request: parsed.raw, error: "validation_failed" });
          return parsed.response;
        }
        if (parsed.data.device_fingerprint !== fp.value) {
          return errJson({ code: 400, error: "fingerprint_mismatch", message: "X-Device-Fingerprint header must match body device_fingerprint." });
        }
        if (!parsed.data.otp_verified) {
          return errJson({ code: 401, error: "otp_required", message: "OTP has not been verified for this session." });
        }

        const hit = await checkIdempotency({ company_id: auth.key.company_id, endpoint: ENDPOINT, key: idem.value, body: parsed.data });
        if (hit.kind === "conflict") return errJson(ERRORS.idempotency_conflict);
        if (hit.kind === "replay") return validateAndSend(IbResponse, hit.response as any, hit.status);

        const reference = generateReference("IB");
        const response = {
          status: "posted" as const,
          reference,
          posted_at: new Date().toISOString(),
          new_balance: 122400,
          currency: parsed.data.currency,
        };
        await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "inbound",
          endpoint: ENDPOINT, method: "POST", reference, status_code: 200,
          request: withIdempotencyEnvelope(parsed.data, idem.value), response });
        return validateAndSend(IbResponse, response, 200);
      },
    },
  },
});
