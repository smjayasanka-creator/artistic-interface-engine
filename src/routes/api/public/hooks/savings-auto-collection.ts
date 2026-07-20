// Savings-to-loan mandate auto-collection worker.
//
// Called by pg_cron twice per business day (morning + afternoon) to sweep
// active loan mandates and collect eligible amounts from linked savings
// accounts. Idempotent per (company_id, business_date, window).
//
// Body (optional): { window?: "morning"|"afternoon"|"manual",
//                    business_date?: "YYYY-MM-DD",
//                    company_id?: uuid }

import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/hooks/savings-auto-collection")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authenticateCronRequest(request))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        let body: {
          window?: "morning" | "afternoon" | "manual";
          business_date?: string;
          company_id?: string;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const win = body.window ?? "morning";
        if (!["morning", "afternoon", "manual"].includes(win)) {
          return Response.json({ ok: false, error: "invalid window" }, { status: 400 });
        }

        const bizDate =
          body.business_date && /^\d{4}-\d{2}-\d{2}$/.test(body.business_date)
            ? body.business_date
            : new Date().toISOString().slice(0, 10);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let companyIds: string[] = [];
        if (body.company_id) {
          companyIds = [body.company_id];
        } else {
          const { data: cos, error } = await supabaseAdmin.from("company").select("id");
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          companyIds = (cos ?? []).map((c) => c.id as string);
        }

        const results: Array<{ company_id: string; ok: boolean; summary?: any; error?: string }> =
          [];
        for (const cid of companyIds) {
          const { data, error } = await supabaseAdmin.rpc("run_savings_auto_collection", {
            _company_id: cid,
            _window: win,
            _business_date: bizDate,
            _triggered_by: null,
          } as any);
          if (error) results.push({ company_id: cid, ok: false, error: error.message });
          else results.push({ company_id: cid, ok: true, summary: data });
        }

        return Response.json({
          ok: true,
          window: win,
          business_date: bizDate,
          companies: results.length,
          results,
        });
      },
    },
  },
});
