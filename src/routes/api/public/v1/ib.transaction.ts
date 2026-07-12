import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiKey, json, logApiCall, generateReference } from "@/lib/api-auth.server";

const Body = z.object({
  customer_id: z.string().min(1).max(64),
  channel: z.literal("internet_banking"),
  action: z.enum(["intra_transfer", "bill_payment", "loan_repayment", "deposit_topup"]),
  amount: z.number().positive(),
  currency: z.string().length(3),
  source_account: z.string(),
  destination_account: z.string().optional(),
  biller_code: z.string().optional(),
  reference_note: z.string().max(120).optional(),
  device_fingerprint: z.string().min(6),
  otp_verified: z.boolean(),
});

export const Route = createFileRoute("/api/public/v1/ib/transaction")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "internet_banking");
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        let payload: unknown;
        try { payload = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
        const parsed = Body.safeParse(payload);
        if (!parsed.success) return json({ error: "validation_failed", details: parsed.error.flatten() }, 400);
        if (!parsed.data.otp_verified) return json({ error: "otp_required" }, 401);
        const reference = generateReference("IB");
        const response = { status: "posted", ib_reference: reference, action: parsed.data.action, posted_at: new Date().toISOString() };
        await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: "internet_banking", direction: "inbound",
          endpoint: "/api/public/v1/ib/transaction", method: "POST", reference, status_code: 200, request: parsed.data, response });
        return json(response, 200);
      },
    },
  },
});
