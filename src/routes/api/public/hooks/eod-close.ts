// Canonical scheduled day-end worker.
//
// Runs the SAME orchestrator as manual day-end (canonical) instead of the
// legacy eod_close RPC. Iterates every branch of every company whose
// auto_eod is enabled and whose local time-of-day matches the configured
// auto_eod_time. Timezone-aware: business_date is derived per company from
// company.timezone, never UTC "yesterday".
//
// Body (optional): { business_date?: "YYYY-MM-DD", branch_id?: uuid,
//                    company_id?: uuid, force?: boolean }
//   force=true bypasses the schedule window check (used for ad-hoc retry).
//
// Authenticated by CRON_SECRET (x-cron-secret header) per api-auth.server.

import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/lib/api-auth.server";

const STEPS = [
  "loan_accrual",
  "fd_accrual",
  "penalty_charges",
  "par_npa",
  "fd_maturity",
  "savings_interest",
  "gl_post",
  "trial_balance",
  "snapshots",
  "reports",
  "rollover",
] as const;

// Return "HH:MM" and "YYYY-MM-DD" in the given IANA timezone.
function nowInTz(tz: string): { hhmm: string; today: string; yesterday: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const hhmm = `${parts.hour}:${parts.minute}`;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);
  return { hhmm, today, yesterday };
}

export const Route = createFileRoute("/api/public/hooks/eod-close")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authenticateCronRequest(request))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        let body: {
          business_date?: string;
          branch_id?: string;
          company_id?: string;
          force?: boolean;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Pick companies in scope
        const companyQ = supabaseAdmin
          .from("company")
          .select("id, timezone, auto_eod_enabled, auto_eod_time");
        if (body.company_id) companyQ.eq("id", body.company_id);
        const { data: companies, error: cErr } = await companyQ;
        if (cErr) return Response.json({ ok: false, error: cErr.message }, { status: 500 });

        const results: Array<{
          company_id: string;
          branch_id: string;
          business_date: string;
          ok: boolean;
          run_id?: string;
          error?: string;
          steps?: Record<string, { status: string; error?: string }>;
        }> = [];

        for (const co of companies ?? []) {
          const tz = (co as any).timezone || "UTC";
          const enabled = !!(co as any).auto_eod_enabled;
          const scheduled = ((co as any).auto_eod_time ?? "00:30:00").toString().slice(0, 5);
          const { hhmm, yesterday } = nowInTz(tz);

          if (!body.force && !body.business_date) {
            if (!enabled) continue;
            // Only fire within ±5min window of the scheduled local time.
            const [sh, sm] = scheduled.split(":").map(Number);
            const [nh, nm] = hhmm.split(":").map(Number);
            const diff = Math.abs(sh * 60 + sm - (nh * 60 + nm));
            if (diff > 5) continue;
          }

          const businessDate =
            body.business_date && /^\d{4}-\d{2}-\d{2}$/.test(body.business_date)
              ? body.business_date
              : yesterday;

          // branches to close for this company
          const bq = supabaseAdmin.from("branch").select("id, auto_eod").eq("company_id", co.id);
          if (body.branch_id) bq.eq("id", body.branch_id);
          const { data: branches, error: bErr } = await bq;
          if (bErr) {
            results.push({
              company_id: co.id,
              branch_id: "*",
              business_date: businessDate,
              ok: false,
              error: bErr.message,
            });
            continue;
          }

          for (const b of branches ?? []) {
            if (!body.force && !body.branch_id && (b as any).auto_eod === false) continue;

            try {
              // system-initiate (service role only). Idempotent: returns existing run
              // if already completed; resumes failed runs.
              const { data: runId, error: iErr } = await supabaseAdmin.rpc(
                "eod_system_initiate" as any,
                { _branch_id: b.id, _business_date: businessDate } as any,
              );
              if (iErr) throw new Error(iErr.message);

              // Run each not-yet-completed step in order.
              const { data: run } = await supabaseAdmin
                .from("eod_run")
                .select("steps, company_id, status")
                .eq("id", runId as string)
                .single();
              if (!run) throw new Error("run vanished");
              if ((run as any).status === "completed") {
                results.push({
                  company_id: co.id,
                  branch_id: b.id,
                  business_date: businessDate,
                  ok: true,
                  run_id: runId as string,
                });
                continue;
              }

              const stepMap: Record<string, string> = {};
              for (const s of (run as any).steps ?? []) stepMap[s.key] = s.status;

              const stepResults: Record<string, { status: string; error?: string }> = {};
              let failed = false;

              // Delegate the actual step execution to the orchestrator by
              // calling the same code path used by manual runs. We invoke it
              // via a server function import so both paths share logic.
              const { runOrchestratorStep } = await import("@/lib/eod.functions");

              for (const key of STEPS) {
                if (stepMap[key] === "completed") {
                  stepResults[key] = { status: "completed" };
                  continue;
                }
                try {
                  await runOrchestratorStep({
                    supabaseAdmin,
                    run_id: runId as string,
                    company_id: (run as any).company_id,
                    branch_id: b.id,
                    business_date: businessDate,
                    step_key: key,
                  });
                  stepResults[key] = { status: "completed" };
                } catch (e) {
                  stepResults[key] = {
                    status: "failed",
                    error: (e as Error).message,
                  };
                  await supabaseAdmin.rpc("eod_record_step" as any, {
                    _run_id: runId,
                    _step_key: key,
                    _status: "failed",
                    _metrics: {} as any,
                    _error: (e as Error).message,
                  } as any);
                  failed = true;
                  break;
                }
              }

              await supabaseAdmin.rpc("eod_finalize" as any, {
                _run_id: runId,
                _status: failed ? "failed" : "completed",
              } as any);

              results.push({
                company_id: co.id,
                branch_id: b.id,
                business_date: businessDate,
                ok: !failed,
                run_id: runId as string,
                steps: stepResults,
              });
            } catch (e) {
              results.push({
                company_id: co.id,
                branch_id: b.id,
                business_date: businessDate,
                ok: false,
                error: (e as Error).message,
              });
            }
          }
        }

        return Response.json({
          ok: results.every((r) => r.ok),
          count: results.length,
          results,
        });
      },
    },
  },
});
