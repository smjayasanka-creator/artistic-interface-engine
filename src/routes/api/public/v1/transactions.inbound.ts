import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall, generateReference } from "@/lib/api-auth.server";
import {
  TransactionsInboundRequest, TransactionsInboundResponse,
  parseJsonBody, validateAndSend, logAndReturnAuthError,
  checkIdempotency, withIdempotencyEnvelope, errJson, ERRORS,
} from "@/lib/api-schemas.server";
import { postApiChannelEntry } from "@/lib/api-ledger.server";


const ENDPOINT = "/api/public/v1/transactions/inbound";
const CHANNEL = "transactions";

export const Route = createFileRoute("/api/public/v1/transactions/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "transactions.inbound");
        if (!auth.ok) return logAndReturnAuthError({ status: auth.status, error: auth.error, channel: CHANNEL, endpoint: ENDPOINT, direction: "inbound" });

        const parsed = await parseJsonBody(request, TransactionsInboundRequest);
        if (!parsed.ok) {
          await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "inbound",
            endpoint: ENDPOINT, method: "POST", status_code: 400, request: parsed.raw, error: "validation_failed" });
          return parsed.response;
        }

        const idem = request.headers.get("Idempotency-Key");
        if (idem) {
          const hit = await checkIdempotency({ company_id: auth.key.company_id, endpoint: ENDPOINT, key: idem, body: parsed.data });
          if (hit.kind === "conflict") return errJson(ERRORS.idempotency_conflict);
          if (hit.kind === "replay") return validateAndSend(TransactionsInboundResponse, hit.response as any, hit.status);
        }

        const reference = generateReference("INB");
        const response = {
          status: "accepted" as const,
          reference,
          received_at: new Date().toISOString(),
          counterparty: { name: parsed.data.counterparty.name, account: parsed.data.counterparty.account },
          amount: parsed.data.amount,
          currency: parsed.data.currency,
        };
        await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "inbound",
          endpoint: ENDPOINT, method: "POST", reference, status_code: 202,
          request: withIdempotencyEnvelope(parsed.data, idem), response });
        return validateAndSend(TransactionsInboundResponse, response, 202);
      },
    },
  },
});
