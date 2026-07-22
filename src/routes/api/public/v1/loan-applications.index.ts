// POST /api/public/v1/loan-applications — create a loan application (master row).
//
// - Requires scope `loan_applications.write`.
// - Cross-tenant safe: branch (and client, if given) must belong to the API
//   key's company; otherwise 404 is returned (no enumeration).
// - Idempotent via the `Idempotency-Key` header (same key + body replays).
// - Emits `loan_application.created` webhook (best-effort).

import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  LoanApplicationCreateRequest,
  LoanApplicationCreateResponse,
  parseJsonBody,
  validateAndSend,
  logAndReturnAuthError,
  checkIdempotency,
  withIdempotencyEnvelope,
  errJson,
  ERRORS,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueWebhookForCompany } from "@/lib/webhooks.server";

const ENDPOINT = "/api/public/v1/loan-applications";
const CHANNEL = "loan_applications";

export const Route = createFileRoute("/api/public/v1/loan-applications/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "loan_applications.write");
        if (!auth.ok) {
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint: ENDPOINT,
            direction: "inbound",
          });
        }

        const parsed = await parseJsonBody(request, LoanApplicationCreateRequest);
        if (!parsed.ok) {
          await logApiCall({
            company_id: auth.key.company_id,
            api_key_id: auth.key.id,
            channel: CHANNEL,
            direction: "inbound",
            endpoint: ENDPOINT,
            method: "POST",
            status_code: 400,
            request: parsed.raw,
            error: "validation_failed",
          });
          return parsed.response;
        }

        // Cross-tenant: branch must belong to caller's company.
        const { data: br, error: brErr } = await supabaseAdmin
          .from("branch")
          .select("id, company_id")
          .eq("id", parsed.data.branch_id)
          .maybeSingle();
        if (brErr) return errJson({ code: 500, error: "read_failed", message: brErr.message });
        if (!br || (br as any).company_id !== auth.key.company_id) {
          return errJson({ code: 404, error: "branch_not_found", message: "Branch not found." });
        }

        // Cross-tenant: client (if supplied) must belong to caller's company.
        if (parsed.data.client_id) {
          const { data: cl } = await supabaseAdmin
            .from("client")
            .select("id, branch:branch_id(company_id)")
            .eq("id", parsed.data.client_id)
            .maybeSingle();
          if (!cl || (cl as any).branch?.company_id !== auth.key.company_id) {
            return errJson({ code: 404, error: "client_not_found", message: "Client not found." });
          }
        }

        const idem = request.headers.get("Idempotency-Key");
        if (idem) {
          const hit = await checkIdempotency({
            company_id: auth.key.company_id,
            endpoint: ENDPOINT,
            key: idem,
            body: parsed.data,
          });
          if (hit.kind === "conflict") return errJson(ERRORS.idempotency_conflict);
          if (hit.kind === "replay")
            return validateAndSend(LoanApplicationCreateResponse, hit.response as any, hit.status);
        }

        const { data: row, error } = await supabaseAdmin
          .from("loan_application" as any)
          .insert({
            company_id: auth.key.company_id,
            branch_id: parsed.data.branch_id,
            client_id: parsed.data.client_id ?? null,
            product_id: parsed.data.product_id ?? null,
            officer_id: parsed.data.officer_id ?? null,
            requested_principal: parsed.data.requested_principal,
            requested_tenor_months: parsed.data.requested_tenor_months,
            requested_rate_pct: parsed.data.requested_rate_pct ?? null,
            frequency: (parsed.data.frequency ?? null) as any,
            currency: parsed.data.currency ?? "KES",
            purpose: parsed.data.purpose ?? null,
            channel: parsed.data.channel ?? "api",
            metadata: parsed.data.metadata ?? {},
            status: "draft",
          } as any)
          .select(
            "id, application_no, branch_id, client_id, product_id, requested_principal, requested_tenor_months, currency, status, created_at",
          )
          .single();

        if (error || !row) {
          await logApiCall({
            company_id: auth.key.company_id,
            api_key_id: auth.key.id,
            channel: CHANNEL,
            direction: "inbound",
            endpoint: ENDPOINT,
            method: "POST",
            status_code: 500,
            request: withIdempotencyEnvelope(parsed.data, idem),
            error: error?.message ?? "insert_failed",
          });
          return errJson({
            code: 500,
            error: "insert_failed",
            message: error?.message ?? "Failed to create loan application.",
          });
        }

        const r = row as any;
        const body = {
          status: "created" as const,
          application_id: r.id,
          application_no: r.application_no,
          branch_id: r.branch_id,
          client_id: r.client_id ?? null,
          product_id: r.product_id ?? null,
          requested_principal: Number(r.requested_principal ?? 0),
          requested_tenor_months: Number(r.requested_tenor_months ?? 0),
          currency: r.currency,
          status_code: r.status,
          created_at: new Date(r.created_at).toISOString(),
        };

        try {
          await enqueueWebhookForCompany(supabaseAdmin as any, {
            company_id: auth.key.company_id,
            env: auth.key.environment,
            event_type: "loan_application.created",
            event_id: body.application_id,
            payload: body,
          });
        } catch (e) {
          console.warn("[webhook] loan_application.created enqueue failed", e);
        }

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "inbound",
          endpoint: ENDPOINT,
          method: "POST",
          reference: body.application_id,
          status_code: 201,
          request: withIdempotencyEnvelope(parsed.data, idem),
          response: body,
        });

        return validateAndSend(LoanApplicationCreateResponse, body, 201);
      },
    },
  },
});
