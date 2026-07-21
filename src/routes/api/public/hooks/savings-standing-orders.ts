// Savings standing-order runner. Invoked by pg_cron once per business day
// to process all due standing orders per company. Idempotent per (order id,
// business date) via the per-day idempotency key inside the transfer RPC.

import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/hooks/savings-standing-orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authenticateCronRequest(request))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        let body: { business_date?: string; company_id?: string } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const bizDate =
          body.business_date && /^\d{4}-\d{2}-\d{2}$/.test(body.business_date)
            ? body.business_date
            : new Date().toISOString().slice(0, 10);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let companyIds: string[] = [];
        if (body.company_id) companyIds = [body.company_id];
        else {
          const { data: cos, error } = await supabaseAdmin.from("company").select("id");
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          companyIds = (cos ?? []).map((c) => c.id as string);
        }

        const results: Array<{ company_id: string; ok: boolean; summary?: any; error?: string }> =
          [];
        for (const cid of companyIds) {
          const { data, error } = await supabaseAdmin.rpc("run_savings_standing_orders", {
            _company_id: cid,
            _business_date: bizDate,
          } as any);
          if (error) results.push({ company_id: cid, ok: false, error: error.message });
          else results.push({ company_id: cid, ok: true, summary: data });
        }
        return Response.json({
          ok: true,
          business_date: bizDate,
          companies: results.length,
          results,
        });
      },
    },
  },
});
