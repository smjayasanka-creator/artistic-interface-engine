import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiKey, json, logApiCall, generateReference } from "@/lib/api-auth.server";

const Body = z.object({
  national_id: z.string().min(6).max(20),
  purpose: z.enum(["loan_application", "credit_review", "monitoring"]),
  consent_reference: z.string().min(4).max(80),
});

export const Route = createFileRoute("/api/public/v1/crib/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "crib");
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        let payload: unknown;
        try { payload = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
        const parsed = Body.safeParse(payload);
        if (!parsed.success) return json({ error: "validation_failed", details: parsed.error.flatten() }, 400);
        const reference = generateReference("CRIB");
        // Simulated CRIB summary (real integration would call CRIB API via a provider certificate)
        const response = {
          status: "issued",
          crib_reference: reference,
          national_id: parsed.data.national_id,
          score: 712,
          grade: "B+",
          summary: {
            total_facilities: 4,
            active_facilities: 2,
            worst_status_last_12m: "current",
            outstanding_lkr: 484500,
            enquiries_last_6m: 1,
          },
          issued_at: new Date().toISOString(),
        };
        await logApiCall({ company_id: auth.key.company_id, api_key_id: auth.key.id, channel: "crib", direction: "outbound",
          endpoint: "/api/public/v1/crib/report", method: "POST", reference, status_code: 200, request: parsed.data, response });
        return json(response, 200);
      },
    },
  },
});
