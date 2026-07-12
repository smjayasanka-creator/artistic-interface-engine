import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiKey, json, logApiCall, generateReference } from "@/lib/api-auth.server";

const Body = z.object({
  external_reference: z.string().min(1).max(80),
  counterparty: z.object({
    name: z.string().min(1).max(120),
    account: z.string().min(1).max(64),
    bank_code: z.string().max(20).optional(),
    swift: z.string().max(20).optional(),
  }),
  amount: z.number().positive(),
  currency: z.string().length(3),
  narrative: z.string().max(160).optional(),
  posted_at: z.string().datetime().optional(),
});

export const Route = createFileRoute("/api/public/v1/transactions/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "transactions.inbound");
        if (!auth.ok) {
          await logApiCall({ company_id: null, api_key_id: null, channel: "transactions", direction: "inbound",
            endpoint: "/api/public/v1/transactions/inbound", method: "POST", status_code: auth.status, error: auth.error });
          return json({ error: auth.error }, auth.status);
        }
        let payload: unknown;
        try { payload = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
        const parsed = Body.safeParse(payload);
        if (!parsed.success) {
          await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: "transactions", direction: "inbound",
            endpoint: "/api/public/v1/transactions/inbound", method: "POST", status_code: 400, request: payload, error: "validation_failed" });
          return json({ error: "validation_failed", details: parsed.error.flatten() }, 400);
        }
        const reference = generateReference("IN");
        const response = { status: "accepted", reference, external_reference: parsed.data.external_reference, received_at: new Date().toISOString() };
        await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: "transactions", direction: "inbound",
          endpoint: "/api/public/v1/transactions/inbound", method: "POST", reference, status_code: 202, request: parsed.data, response });
        return json(response, 202);
      },
    },
  },
});
