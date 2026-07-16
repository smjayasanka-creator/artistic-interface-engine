// End-of-day close worker.
//
// Called by pg_cron shortly after midnight (e.g. 00:30). For every branch,
// runs public.eod_close(branch_id, business_date) for the previous business
// day. Idempotent — eod_close short-circuits if the run already exists.
//
// Body (optional): { business_date?: "YYYY-MM-DD", branch_id?: uuid }
// Defaults: business_date = yesterday (UTC), branch_id = all branches.

import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/hooks/eod-close")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authenticateCronRequest(request))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        let body: { business_date?: string; branch_id?: string } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const businessDate = (() => {
          if (body.business_date && /^\d{4}-\d{2}-\d{2}$/.test(body.business_date)) {
            return body.business_date;
          }
          const d = new Date();
          d.setUTCDate(d.getUTCDate() - 1);
          return d.toISOString().slice(0, 10);
        })();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let branchIds: string[] = [];
        if (body.branch_id) {
          branchIds = [body.branch_id];
        } else {
          const { data: branches, error: bErr } = await supabaseAdmin
            .from("branch")
            .select("id");
          if (bErr) return Response.json({ ok: false, error: bErr.message }, { status: 500 });
          branchIds = (branches ?? []).map((b) => b.id as string);
        }

        const results: Array<{ branch_id: string; ok: boolean; run_id?: string; error?: string }> = [];
        for (const bid of branchIds) {
          const { data: runId, error } = await supabaseAdmin.rpc("eod_close", {
            _branch_id: bid,
            _business_date: businessDate,
          });
          if (error) {
            results.push({ branch_id: bid, ok: false, error: error.message });
          } else {
            results.push({ branch_id: bid, ok: true, run_id: runId as string });
          }
        }

        const okCount = results.filter((r) => r.ok).length;
        return Response.json({
          ok: true,
          business_date: businessDate,
          branches_total: branchIds.length,
          branches_closed: okCount,
          branches_failed: branchIds.length - okCount,
          results,
        });
      },
    },
  },
});
