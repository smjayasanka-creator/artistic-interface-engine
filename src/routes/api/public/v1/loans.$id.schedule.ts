// GET /api/public/v1/loans/{id}/schedule
// Amortisation schedule (installments) for a loan, ordered by seq ASC.
// Optional filter: state=scheduled|due|paid|overdue|written_off (matches the
// installment_state enum). Company-scoped via the loan's branch.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  LoanScheduleListResponse,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedLoan } from "@/lib/api-loan.server";

const CHANNEL = "loans";

const SELECT =
  "id, loan_id, seq, due_date, principal_due, principal_paid, interest_due, interest_paid, fee_due, fee_paid, state, is_manual";

function rowToApi(r: any) {
  return {
    id: r.id,
    loan_id: r.loan_id,
    seq: Number(r.seq),
    due_date: r.due_date,
    principal_due: Number(r.principal_due),
    principal_paid: Number(r.principal_paid),
    interest_due: Number(r.interest_due),
    interest_paid: Number(r.interest_paid),
    fee_due: Number(r.fee_due),
    fee_paid: Number(r.fee_paid),
    state: r.state,
    is_manual: !!r.is_manual,
  };
}

export const Route = createFileRoute("/api/public/v1/loans/$id/schedule")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const endpoint = `/api/public/v1/loans/${params.id}/schedule`;
        const auth = await authenticateApiKey(request, "loans.read");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint,
            direction: "outbound",
          });

        const loan = await loadOwnedLoan(params.id, auth.key.company_id);
        if (!loan)
          return errJson({ code: 404, error: "not_found", message: "Loan not found." });

        const url = new URL(request.url);
        const stateParam = url.searchParams.get("state");

        let q = supabaseAdmin
          .from("loan_installment")
          .select(SELECT)
          .eq("loan_id", loan.id)
          .order("seq", { ascending: true });
        if (stateParam) q = q.eq("state", stateParam as any);

        const { data, error } = await q;
        if (error) return errJson({ code: 500, error: "read_failed", message: error.message });

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "outbound",
          endpoint,
          method: "GET",
          reference: loan.id,
          status_code: 200,
        });
        return validateAndSend(
          LoanScheduleListResponse,
          { data: (data ?? []).map(rowToApi) },
          200,
        );
      },
    },
  },
});
