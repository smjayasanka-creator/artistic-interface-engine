// Daily FD accrual + monthly interest payout worker.
//
// Called by pg_cron once a day (e.g. 00:15). For every active fixed_deposit
// it inserts one fd_accrual row (actual/365) for yesterday, and marks any
// fd_interest_schedule rows whose due_date <= today as paid, creating an
// fd_transaction of type 'interest_payout'. Idempotent: fd_accrual is
// UNIQUE(deposit_id, accrual_date) and schedule paid-flag guards double-pay.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/fd-accrue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
          return Response.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
        }
        const provided = request.headers.get("x-cron-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(cronSecret);
        if (a.length !== b.length) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const { timingSafeEqual } = await import("crypto");
        if (!timingSafeEqual(a, b)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const today = new Date().toISOString().slice(0, 10);

        // --- Daily accrual ------------------------------------------------
        const { data: deposits, error: depErr } = await supabaseAdmin
          .from("fixed_deposit")
          .select("id, principal, rate_at_booking, value_date, maturity_date, status")
          .eq("status", "active");
        if (depErr) return Response.json({ ok: false, error: depErr.message }, { status: 500 });

        let accrued = 0;
        let skipped = 0;
        for (const d of deposits ?? []) {
          if (today < d.value_date || today > d.maturity_date) { skipped++; continue; }
          const daily = Number(((Number(d.principal) * Number(d.rate_at_booking)) / 365).toFixed(2));

          const { data: prev } = await supabaseAdmin
            .from("fd_accrual")
            .select("cumulative_amount")
            .eq("deposit_id", d.id)
            .order("accrual_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          const cumulative = Number(((Number(prev?.cumulative_amount ?? 0)) + daily).toFixed(2));

          const { error: insErr } = await supabaseAdmin
            .from("fd_accrual")
            .insert({ deposit_id: d.id, accrual_date: today, daily_amount: daily, cumulative_amount: cumulative });
          if (insErr) {
            // Duplicate (already accrued today) is fine; anything else is a real error.
            if (!/duplicate|unique/i.test(insErr.message)) skipped++;
          } else {
            accrued++;
          }
        }

        // --- Monthly interest payouts (schedule rows due today or earlier) ---
        const { data: due, error: dueErr } = await supabaseAdmin
          .from("fd_interest_schedule")
          .select("id, deposit_id, gross_interest, wht_amount, net_interest, due_date, seq")
          .eq("paid", false)
          .lte("due_date", today);
        if (dueErr) return Response.json({ ok: false, error: dueErr.message }, { status: 500 });

        let paid = 0;
        for (const row of due ?? []) {
          const { error: txErr } = await supabaseAdmin
            .from("fd_transaction")
            .insert({
              deposit_id: row.deposit_id,
              type: "interest_payout",
              amount: row.net_interest,
              txn_date: row.due_date,
              reference: `FD-INT-${row.seq}`,
            });
          if (txErr) continue;
          await supabaseAdmin
            .from("fd_interest_schedule")
            .update({ paid: true, paid_date: today })
            .eq("id", row.id);
          paid++;
        }

        return Response.json({
          ok: true,
          date: today,
          deposits_scanned: deposits?.length ?? 0,
          accrued,
          skipped,
          interest_paid: paid,
        });
      },
    },
  },
});
