// GET /api/public/v1/loan-applications/{id} — fetch a single loan application
// with its child rows (applicants, business, employment, collateral,
// guarantors, existing facilities, notes). Cross-tenant safe: any id that
// does not belong to the caller's company returns 404 without leaking
// existence.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import { errJson } from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedApplication } from "@/lib/api-loan-app.server";

const CHANNEL = "loan_applications";

const APP_SELECT =
  "id, application_no, company_id, branch_id, client_id, product_id, officer_id, requested_principal, requested_tenor_months, requested_rate_pct, frequency, currency, purpose, channel, status, submitted_at, decided_at, disbursed_at, loan_id, metadata, created_at, updated_at";

export const Route = createFileRoute("/api/public/v1/loan-applications/$id/get")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const endpoint = `/api/public/v1/loan-applications/${params.id}`;
        const auth = await authenticateApiKey(request, "loan_applications.read");
        if (!auth.ok) {
          await logApiCall({
            company_id: null,
            api_key_id: null,
            channel: CHANNEL,
            direction: "outbound",
            endpoint,
            method: "GET",
            status_code: auth.status,
            error: auth.error,
          });
          return errJson({ code: auth.status, error: "unauthorized", message: auth.error });
        }

        const owned = await loadOwnedApplication(params.id, auth.key.company_id);
        if (!owned)
          return errJson({ code: 404, error: "not_found", message: "Loan application not found." });

        const { data: app, error } = await supabaseAdmin
          .from("loan_application" as any)
          .select(APP_SELECT)
          .eq("id", params.id)
          .maybeSingle();
        if (error || !app)
          return errJson({ code: 500, error: "read_failed", message: error?.message ?? "Read failed." });

        const child = async (table: string) => {
          const { data } = await supabaseAdmin
            .from(table as any)
            .select("*")
            .eq("application_id", params.id)
            .order("created_at", { ascending: true });
          return data ?? [];
        };

        const [applicants, business, employment, collateral, guarantors, existing_facilities, notes] =
          await Promise.all([
            child("loan_application_applicant"),
            child("loan_application_business"),
            child("loan_application_employment"),
            child("loan_application_collateral"),
            child("loan_application_guarantor"),
            child("loan_application_existing_facility"),
            child("loan_application_note"),
          ]);

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "outbound",
          endpoint,
          method: "GET",
          reference: params.id,
          status_code: 200,
        });

        return Response.json({
          ...(app as any),
          applicants,
          business,
          employment,
          collateral,
          guarantors,
          existing_facilities,
          notes,
        });
      },
    },
  },
});
