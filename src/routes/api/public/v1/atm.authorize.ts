import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall, generateReference } from "@/lib/api-auth.server";
import {
  AtmRequest, AtmResponse,
  parseJsonBody, validateAndSend, logAndReturnAuthError,
  checkIdempotency, withIdempotencyEnvelope, errJson, ERRORS, requireHeader,
} from "@/lib/api-schemas.server";
import { postApiChannelEntry } from "@/lib/api-ledger.server";


const ENDPOINT = "/api/public/v1/atm/authorize";
const CHANNEL = "atm";

export const Route = createFileRoute("/api/public/v1/atm/authorize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "atm");
        if (!auth.ok) return logAndReturnAuthError({ status: auth.status, error: auth.error, channel: CHANNEL, endpoint: ENDPOINT, direction: "inbound" });

        const term = requireHeader(request, "X-Terminal-Id");
        if (!term.ok) return term.response;
        const idem = requireHeader(request, "Idempotency-Key");
        if (!idem.ok) return idem.response;

        const parsed = await parseJsonBody(request, AtmRequest);
        if (!parsed.ok) {
          await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "inbound",
            endpoint: ENDPOINT, method: "POST", status_code: 400, request: parsed.raw, error: "validation_failed" });
          return parsed.response;
        }
        if (parsed.data.terminal_id !== term.value) {
          return errJson({ code: 400, error: "terminal_mismatch", message: "X-Terminal-Id header must match body terminal_id." });
        }

        const hit = await checkIdempotency({ company_id: auth.key.company_id, endpoint: ENDPOINT, key: idem.value, body: parsed.data });
        if (hit.kind === "conflict") return errJson(ERRORS.idempotency_conflict);
        if (hit.kind === "replay") return validateAndSend(AtmResponse, hit.response as any, hit.status);

        const reference = generateReference("ATM");
        const response = {
          status: "approved" as const,
          authorization_code: reference.split("-").pop()!.slice(0, 6),
          stan: parsed.data.stan,
          balance_after: parsed.data.transaction_type === "withdrawal" ? 87250 : (parsed.data.transaction_type === "balance_inquiry" ? 125000 : null),
          currency: parsed.data.currency,
          processed_at: new Date().toISOString(),
        };
        if (parsed.data.transaction_type === "withdrawal" && parsed.data.amount > 0) {
          await postApiChannelEntry({
            company_id: auth.key.company_id, direction: "outbound",
            amount: parsed.data.amount, reference,
            description: `ATM withdrawal · terminal ${parsed.data.terminal_id} · stan ${parsed.data.stan}`,
            source_module: "atm", idempotency_key: idem.value,
          });
        }
        await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "inbound",
          endpoint: ENDPOINT, method: "POST", reference, status_code: 200,
          request: withIdempotencyEnvelope(parsed.data, idem.value), response });
        return validateAndSend(AtmResponse, response, 200);
      },
    },
  },
});
