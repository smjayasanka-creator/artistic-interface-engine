import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiKey, json, logApiCall, generateReference } from "@/lib/api-auth.server";

const Body = z.object({
  terminal_id: z.string().min(3).max(20),
  card_pan_masked: z.string().regex(/^\d{6}\*+\d{4}$/, "Use masked PAN like 411111******1234"),
  transaction_type: z.enum(["withdrawal", "balance_inquiry", "mini_statement"]),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  stan: z.string().min(6).max(12),
  auth_code: z.string().optional(),
});

export const Route = createFileRoute("/api/public/v1/atm/authorize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "atm");
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        let payload: unknown;
        try { payload = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
        const parsed = Body.safeParse(payload);
        if (!parsed.success) return json({ error: "validation_failed", details: parsed.error.flatten() }, 400);
        const reference = generateReference("ATM");
        const response = {
          status: "approved",
          atm_reference: reference,
          stan: parsed.data.stan,
          available_balance: parsed.data.transaction_type === "balance_inquiry" ? 125000.75 : null,
          authorized_at: new Date().toISOString(),
        };
        await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: "atm", direction: "inbound",
          endpoint: "/api/public/v1/atm/authorize", method: "POST", reference, status_code: 200, request: parsed.data, response });
        return json(response, 200);
      },
    },
  },
});
