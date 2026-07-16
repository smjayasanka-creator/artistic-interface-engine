// Daily FD maturity processor.
//
// Called by pg_cron at ~00:30. For every deposit where maturity_date <= today
// AND status='active', it executes the customer's maturity_instruction:
//   - payout:                    fd_transaction(maturity_payout) + status='matured'
//   - renew_principal:           new fixed_deposit(principal), status→renewed
//   - renew_principal_interest:  new fixed_deposit(principal + net accrued), status→renewed
//
// The interest amount used at maturity is the sum of net_interest from the
// deposit's fd_interest_schedule (schedule was generated on approval).
// Renewals reuse the same product/tenure at today's published rate tier.

import { createFileRoute } from "@tanstack/react-router";
import { buildSchedule } from "@/lib/fd-schedule";
import { authenticateCronRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/hooks/fd-mature")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authenticateCronRequest(request))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const today = new Date().toISOString().slice(0, 10);

        const { data: deposits, error } = await supabaseAdmin
          .from("fixed_deposit")
          .select(
            "id, company_id, branch_id, client_id, product_id, principal, rate_at_booking, tenure_months, payout_option, settlement_account, maturity_instruction, wht_rate_at_booking",
          )
          .eq("status", "active")
          .lte("maturity_date", today);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        let paid_out = 0;
        let renewed = 0;
        let failed = 0;

        for (const d of deposits ?? []) {
          try {
            // Total net interest = sum of scheduled net_interest rows.
            const { data: sched } = await supabaseAdmin
              .from("fd_interest_schedule")
              .select("net_interest")
              .eq("deposit_id", d.id);
            const netInterest = (sched ?? []).reduce(
              (a, r) => a + Number(r.net_interest ?? 0),
              0,
            );

            if (d.maturity_instruction === "payout") {
              const payout = Number(d.principal) + netInterest;
              await supabaseAdmin.from("fd_transaction").insert({
                deposit_id: d.id,
                type: "maturity_payout",
                amount: payout,
                txn_date: today,
                reference: `FD-MAT-${d.id.slice(0, 8)}`,
              });
              await supabaseAdmin
                .from("fixed_deposit")
                .update({ status: "matured", closed_at: new Date().toISOString(), close_reason: "matured" })
                .eq("id", d.id);
              paid_out++;
              continue;
            }

            // Renewal — look up today's rate for the same product/tenure.
            const { data: tier } = await supabaseAdmin
              .from("fd_rate_tier")
              .select("annual_rate, effective_from, effective_to")
              .eq("product_id", d.product_id)
              .eq("tenure_months", d.tenure_months)
              .lte("effective_from", today)
              .or(`effective_to.is.null,effective_to.gte.${today}`)
              .order("effective_from", { ascending: false })
              .limit(1)
              .maybeSingle();
            const rate = Number(tier?.annual_rate ?? d.rate_at_booking);

            const newPrincipal =
              d.maturity_instruction === "renew_principal_interest"
                ? Number(d.principal) + netInterest
                : Number(d.principal);

            // Any residual interest not being rolled in gets paid out.
            const residual =
              d.maturity_instruction === "renew_principal" ? netInterest : 0;
            if (residual > 0) {
              await supabaseAdmin.from("fd_transaction").insert({
                deposit_id: d.id,
                type: "interest_payout",
                amount: residual,
                txn_date: today,
                reference: `FD-RES-${d.id.slice(0, 8)}`,
              });
            }

            const { data: certRes, error: certErr } = await supabaseAdmin.rpc(
              "next_fd_certificate_no",
              { _company_id: d.company_id },
            );
            if (certErr || !certRes) throw certErr ?? new Error("no_certificate");

            const newMaturity = new Date(today);
            newMaturity.setMonth(newMaturity.getMonth() + d.tenure_months);

            const { data: newFd, error: newErr } = await supabaseAdmin
              .from("fixed_deposit")
              .insert({
                certificate_no: certRes as unknown as string,
                company_id: d.company_id,
                branch_id: d.branch_id,
                client_id: d.client_id,
                product_id: d.product_id,
                principal: newPrincipal,
                rate_at_booking: rate,
                tenure_months: d.tenure_months,
                payout_option: d.payout_option,
                settlement_account: d.settlement_account,
                maturity_instruction: d.maturity_instruction,
                value_date: today,
                maturity_date: newMaturity.toISOString().slice(0, 10),
                status: "active",
                parent_fd_id: d.id,
                wht_rate_at_booking: d.wht_rate_at_booking,
              })
              .select("id")
              .single();
            if (newErr) throw newErr;

            // Generate the interest schedule so the daily payout cron pays this renewal too.
            const schedRows = buildSchedule({
              principal: newPrincipal,
              annualRatePct: rate,
              tenureMonths: d.tenure_months,
              valueDate: today,
              payoutOption: d.payout_option,
              whtRatePct: Number(d.wht_rate_at_booking),
            });
            if (schedRows.length > 0) {
              await supabaseAdmin
                .from("fd_interest_schedule")
                .insert(schedRows.map((r) => ({ ...r, deposit_id: newFd.id })));
            }

            await supabaseAdmin.from("fd_transaction").insert({
              deposit_id: newFd.id,
              type: "renewal",
              amount: newPrincipal,
              txn_date: today,
              reference: `FD-REN-${d.id.slice(0, 8)}`,
            });

            await supabaseAdmin
              .from("fixed_deposit")
              .update({ status: "renewed", closed_at: new Date().toISOString(), close_reason: "renewed" })
              .eq("id", d.id);

            renewed++;
          } catch (e) {
            console.error("[fd-mature] failed for", d.id, e);
            failed++;
          }
        }

        return Response.json({
          ok: true,
          date: today,
          scanned: deposits?.length ?? 0,
          paid_out,
          renewed,
          failed,
        });
      },
    },
  },
});
