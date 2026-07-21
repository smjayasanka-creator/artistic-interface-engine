// Savings interest accrual & capitalization worker.
//
// Body: { action: "accrue"|"capitalize", business_date?: "YYYY-MM-DD",
//         period_end?: "YYYY-MM-DD", company_id?: uuid, force?: boolean }
//
// Called by pg_cron daily (accrue) and month/quarter/year end (capitalize).

import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/hooks/savings-interest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authenticateCronRequest(request))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        let body: {
          action?: "accrue" | "capitalize";
          business_date?: string;
          period_end?: string;
          company_id?: string;
          force?: boolean;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }
        const action = body.action ?? "accrue";
        if (!["accrue", "capitalize"].includes(action)) {
          return Response.json({ ok: false, error: "invalid action" }, { status: 400 });
        }
        const today = new Date().toISOString().slice(0, 10);
        const bizDate =
          body.business_date && /^\d{4}-\d{2}-\d{2}$/.test(body.business_date)
            ? body.business_date
            : today;
        const periodEnd =
          body.period_end && /^\d{4}-\d{2}-\d{2}$/.test(body.period_end) ? body.period_end : today;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let companyIds: string[] = [];
        if (body.company_id) {
          companyIds = [body.company_id];
        } else {
          const { data: cos, error } = await supabaseAdmin.from("company").select("id");
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          companyIds = (cos ?? []).map((c) => c.id as string);
        }

        const results: Array<{
          company_id: string;
          ok: boolean;
          summary?: any;
          error?: string;
        }> = [];
        for (const cid of companyIds) {
          if (action === "accrue") {
            const { data, error } = await supabaseAdmin.rpc(
              "accrue_savings_interest_daily" as any,
              { _company_id: cid, _business_date: bizDate } as any,
            );
            if (error) results.push({ company_id: cid, ok: false, error: error.message });
            else results.push({ company_id: cid, ok: true, summary: data });
          } else {
            const { data, error } = await supabaseAdmin.rpc(
              "capitalize_savings_interest" as any,
              { _company_id: cid, _period_end: periodEnd, _force: !!body.force } as any,
            );
            if (error) results.push({ company_id: cid, ok: false, error: error.message });
            else results.push({ company_id: cid, ok: true, summary: data });
          }
        }
        return Response.json({ ok: true, action, results });
      },
    },
  },
});
