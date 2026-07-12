import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiKey, json, logApiCall, generateReference } from "@/lib/api-auth.server";

const Body = z.object({
  source_account: z.string().min(1).max(64),
  destination: z.object({
    name: z.string().min(1).max(120),
    account: z.string().min(1).max(64),
    bank_code: z.string().max(20).optional(),
    swift: z.string().max(20).optional(),
  }),
  amount: z.number().positive(),
  currency: z.string().length(3),
  narrative: z.string().max(160).optional(),
  idempotency_key: z.string().min(6).max(80),
});

export const Route = createFileRoute("/api/public/v1/transactions/outbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "transactions.outbound");
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        let payload: unknown;
        try { payload = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
        const parsed = Body.safeParse(payload);
        if (!parsed.success) return json({ error: "validation_failed", details: parsed.error.flatten() }, 400);
        const reference = generateReference("OUT");
        const response = { status: "queued", reference, idempotency_key: parsed.data.idempotency_key, submitted_at: new Date().toISOString() };
        await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: "transactions", direction: "outbound",
          endpoint: "/api/public/v1/transactions/outbound", method: "POST", reference, status_code: 202, request: parsed.data, response });
        return json(response, 202);
      },
    },
  },
});
