import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiKey, json, logApiCall, generateReference } from "@/lib/api-auth.server";

const Body = z.object({
  transaction_type: z.enum(["credit", "debit"]),
  originator: z.object({ name: z.string(), account: z.string(), bank_code: z.string() }),
  beneficiary: z.object({ name: z.string(), account: z.string(), bank_code: z.string() }),
  amount: z.number().positive(),
  currency: z.literal("LKR"),
  session_id: z.string().min(1).max(40),
  narrative: z.string().max(140).optional(),
});

export const Route = createFileRoute("/api/public/v1/ceft/transfer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "ceft");
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        let payload: unknown;
        try { payload = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
        const parsed = Body.safeParse(payload);
        if (!parsed.success) return json({ error: "validation_failed", details: parsed.error.flatten() }, 400);
        const reference = generateReference("CEFT");
        const response = { status: "accepted", ceft_reference: reference, session_id: parsed.data.session_id, cleared_at: null };
        await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: "ceft", direction: parsed.data.transaction_type === "credit" ? "outbound" : "inbound",
          endpoint: "/api/public/v1/ceft/transfer", method: "POST", reference, status_code: 202, request: parsed.data, response });
        return json(response, 202);
      },
    },
  },
});
