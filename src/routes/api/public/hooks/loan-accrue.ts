// Daily loan interest accrual + due-date reclassification worker.
//
// Called by pg_cron once a day. For every active loan it inserts one
// loan_accrual row for yesterday (actual/365 on outstanding principal) and
// posts DR Accrued Interest Receivable / CR Interest Income to the ledger.
// Then, for every installment whose due_date <= today and which hasn't been
// reclassified yet, it posts DR Interest Receivable / CR Accrued Interest
// Receivable for that installment's interest_due, moving the amount from
// the accrued bucket to a customer-collectable receivable.
// Idempotent: loan_accrual UNIQUE(loan, date) and loan_installment_reclass
// UNIQUE(installment) guard against double-posting.

import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/hooks/loan-accrue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authenticateCronRequest(request))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const today = new Date().toISOString().slice(0, 10);

        // Fetch active loans plus product accounts and branch->company mapping.
        const { data: loans, error: loanErr } = await supabaseAdmin
          .from("loan")
          .select(
            "id, principal, annual_rate_pct, disbursed_at, product_id, branch_id, " +
              "product:product_id(accrued_interest_account_id, interest_income_account_id, interest_receivable_account_id), " +
              "branch:branch_id(company_id)",
          )
          .eq("status", "active");
        if (loanErr) return Response.json({ ok: false, error: loanErr.message }, { status: 500 });

        let accrued = 0;
        let accrual_skipped = 0;
        let reclassed = 0;

        for (const l of (loans ?? []) as any[]) {
          const companyId = l.branch?.company_id as string | undefined;
          const accruedAcc = l.product?.accrued_interest_account_id as string | null;
          const incomeAcc = l.product?.interest_income_account_id as string | null;
          const recvAcc = l.product?.interest_receivable_account_id as string | null;
          if (!companyId || !accruedAcc || !incomeAcc) {
            accrual_skipped++;
            continue;
          }
          const disbursed = l.disbursed_at
            ? new Date(l.disbursed_at).toISOString().slice(0, 10)
            : null;
          if (!disbursed || today <= disbursed) {
            accrual_skipped++;
            continue;
          }

          // Outstanding principal = principal - sum(principal_paid on installments)
          const { data: insts } = await supabaseAdmin
            .from("loan_installment")
            .select("principal_paid")
            .eq("loan_id", l.id);
          const paid = (insts ?? []).reduce(
            (s: number, r: any) => s + Number(r.principal_paid ?? 0),
            0,
          );
          const outstanding = Math.max(0, Number(l.principal) - paid);
          if (outstanding <= 0) {
            accrual_skipped++;
          } else {
            const daily = Number(
              ((outstanding * Number(l.annual_rate_pct)) / 100 / 365).toFixed(2),
            );
            if (daily > 0) {
              // Check idempotency (already accrued today).
              const { data: existing } = await supabaseAdmin
                .from("loan_accrual")
                .select("id")
                .eq("loan_id", l.id)
                .eq("accrual_date", today)
                .maybeSingle();
              if (existing) {
                accrual_skipped++;
              } else {
                const { data: prev } = await supabaseAdmin
                  .from("loan_accrual")
                  .select("cumulative_amount")
                  .eq("loan_id", l.id)
                  .order("accrual_date", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                const cumulative = Number(
                  (Number(prev?.cumulative_amount ?? 0) + daily).toFixed(2),
                );

                const idem = `loan-accrue:${l.id}:${today}`;
                const { data: entryId, error: postErr } = await supabaseAdmin.rpc(
                  "post_entry_system",
                  {
                    _company_id: companyId,
                    _entry_date: today,
                    _reference: `ACR-${today}`,
                    _description: `Daily interest accrual`,
                    _lines: [
                      { account_id: accruedAcc, debit: daily, credit: 0 },
                      { account_id: incomeAcc, debit: 0, credit: daily },
                    ] as any,
                    _branch_id: l.branch_id,
                    _source_module: "loans",
                    _source_ref: l.id,
                    _idempotency_key: idem,
                    _loan_id: l.id,
                  },
                );
                if (postErr) {
                  accrual_skipped++;
                } else {
                  const { error: insErr } = await supabaseAdmin.from("loan_accrual").insert({
                    loan_id: l.id,
                    company_id: companyId,
                    accrual_date: today,
                    outstanding_principal: outstanding,
                    daily_amount: daily,
                    cumulative_amount: cumulative,
                    entry_id: entryId as unknown as string,
                  });
                  if (insErr) accrual_skipped++;
                  else accrued++;
                }
              }
            } else {
              accrual_skipped++;
            }
          }

          // ---- Reclassify due installments: DR interest_receivable / CR accrued ----
          if (!recvAcc) continue;
          const { data: due } = await supabaseAdmin
            .from("loan_installment")
            .select("id, seq, due_date, interest_due")
            .eq("loan_id", l.id)
            .lte("due_date", today);
          for (const inst of (due ?? []) as any[]) {
            const amt = Number(inst.interest_due ?? 0);
            if (amt <= 0) continue;
            const { data: alreadyReclassed } = await supabaseAdmin
              .from("loan_installment_reclass")
              .select("id")
              .eq("installment_id", inst.id)
              .maybeSingle();
            if (alreadyReclassed) continue;

            const idem = `loan-reclass:${inst.id}`;
            const { data: entryId, error: postErr } = await supabaseAdmin.rpc("post_entry_system", {
              _company_id: companyId,
              _entry_date: today,
              _reference: `RCL-${inst.seq}`,
              _description: `Interest reclass installment ${inst.seq}`,
              _lines: [
                { account_id: recvAcc, debit: amt, credit: 0 },
                { account_id: accruedAcc, debit: 0, credit: amt },
              ] as any,
              _branch_id: l.branch_id,
              _source_module: "loans",
              _source_ref: l.id,
              _idempotency_key: idem,
              _loan_id: l.id,
            });
            if (postErr) continue;
            await supabaseAdmin.from("loan_installment_reclass").insert({
              installment_id: inst.id,
              loan_id: l.id,
              company_id: companyId,
              amount: amt,
              reclass_date: today,
              entry_id: entryId as unknown as string,
            });
            reclassed++;
          }
        }

        return Response.json({
          ok: true,
          date: today,
          loans_scanned: loans?.length ?? 0,
          accrued,
          accrual_skipped,
          reclassed,
        });
      },
    },
  },
});
