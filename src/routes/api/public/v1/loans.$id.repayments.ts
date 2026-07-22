// POST /api/public/v1/loans/{id}/repayments — record a repayment against a loan.
//
// - Requires scope `loans.repayments.write`.
// - Cross-tenant safe: the loan's branch.company_id must match the API key's
//   company_id, otherwise a 404 is returned (no enumeration).
// - Idempotent when the caller sends an `Idempotency-Key` header — the same
//   key + body replays the stored response; a different body returns 409.
// - Best-effort webhook fan-out for `repayment.recorded` and, when the loan
//   is closed by the allocation, `loan.closed`.

import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  RepaymentCreateRequest,
  RepaymentCreateResponse,
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

const ENDPOINT = "/api/public/v1/loans/{id}/repayments";
const CHANNEL = "loans";

export const Route = createFileRoute("/api/public/v1/loans/$id/repayments")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await authenticateApiKey(request, "loans.repayments.write");
        if (!auth.ok) {
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint: ENDPOINT,
            direction: "inbound",
          });
        }

        const parsed = await parseJsonBody(request, RepaymentCreateRequest);
        if (!parsed.ok) {
          await logApiCall({
            company_id: auth.key.company_id,
            api_key_id: auth.key.id,
            channel: CHANNEL,
            direction: "inbound",
            endpoint: ENDPOINT,
            method: "POST",
            reference: params.id,
            status_code: 400,
            request: parsed.raw,
            error: "validation_failed",
          });
          return parsed.response;
        }

        // Cross-tenant check: loan must belong to this company.
        const { data: loan, error: loanErr } = await supabaseAdmin
          .from("loan")
          .select("id, status, branch:branch_id(company_id)")
          .eq("id", params.id)
          .maybeSingle();
        if (loanErr) {
          return errJson({ code: 500, error: "read_failed", message: loanErr.message });
        }
        if (!loan || (loan as any).branch?.company_id !== auth.key.company_id) {
          return errJson({ code: 404, error: "not_found", message: "Loan not found." });
        }

        const idem = request.headers.get("Idempotency-Key");
        if (idem) {
          const hit = await checkIdempotency({
            company_id: auth.key.company_id,
            endpoint: ENDPOINT,
            key: idem,
            body: { loan_id: params.id, ...parsed.data },
          });
          if (hit.kind === "conflict") return errJson(ERRORS.idempotency_conflict);
          if (hit.kind === "replay")
            return validateAndSend(RepaymentCreateResponse, hit.response as any, hit.status);
        }

        const receivedAt = parsed.data.received_at ?? new Date().toISOString();
        // The RPC requires an idempotency key; synthesise one when the caller
        // did not provide the header so retries at the RPC layer still dedupe
        // within a single API call.
        const rpcIdemKey =
          idem ??
          `api:${auth.key.id}:${params.id}:${receivedAt}:${parsed.data.amount}:${parsed.data.reference ?? ""}`;

        const { data: result, error: rpcErr } = await supabaseAdmin.rpc(
          "record_repayment" as any,
          {
            _loan_id: params.id,
            _amount: parsed.data.amount,
            _channel: parsed.data.channel,
            _reference: parsed.data.reference ?? null,
            _idempotency_key: rpcIdemKey,
            _received_at: receivedAt,
            _notes: parsed.data.notes ?? null,
          } as any,
        );

        if (rpcErr) {
          const msg = rpcErr.message ?? "record_repayment failed";
          const status = /not\s+active|status/i.test(msg) ? 409 : 500;
          await logApiCall({
            company_id: auth.key.company_id,
            api_key_id: auth.key.id,
            channel: CHANNEL,
            direction: "inbound",
            endpoint: ENDPOINT,
            method: "POST",
            reference: params.id,
            status_code: status,
            request: withIdempotencyEnvelope({ loan_id: params.id, ...parsed.data }, idem),
            error: msg,
          });
          return errJson({
            code: status,
            error: status === 409 ? "loan_not_active" : "rpc_failed",
            message: msg,
          });
        }

        const r = (result ?? {}) as any;
        const body = {
          status: "recorded" as const,
          repayment_id: r.repayment_id ?? null,
          loan_id: params.id,
          reference: r.reference ?? parsed.data.reference ?? null,
          received_at: receivedAt,
          business_date: receivedAt.slice(0, 10),
          amount: parsed.data.amount,
          channel: parsed.data.channel,
          allocated_fees: Number(r.allocated_fees ?? 0),
          allocated_interest: Number(r.allocated_interest ?? 0),
          allocated_principal: Number(r.allocated_principal ?? 0),
          unallocated_amount: Number(r.unallocated_amount ?? 0),
          loan_closed: !!r.loan_closed,
          idempotent_replay: !!r.idempotent_replay,
        };

        // Fan out webhooks (best-effort; failures do not fail the API call).
        if (!body.idempotent_replay) {
          try {
            await enqueueWebhookForCompany(supabaseAdmin as any, {
              company_id: auth.key.company_id,
              env: auth.key.environment,
              event_type: "repayment.recorded",
              event_id: body.repayment_id ?? undefined,
              payload: body,
            });
            if (body.loan_closed) {
              await enqueueWebhookForCompany(supabaseAdmin as any, {
                company_id: auth.key.company_id,
                env: auth.key.environment,
                event_type: "loan.closed",
                event_id: params.id,
                payload: { loan_id: params.id, closed_at: receivedAt },
              });
            }
          } catch {
            // swallow — dispatcher will not have a row to send, but the API
            // contract already succeeded.
          }
        }

        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "inbound",
          endpoint: ENDPOINT,
          method: "POST",
          reference: body.repayment_id ?? params.id,
          status_code: 200,
          request: withIdempotencyEnvelope({ loan_id: params.id, ...parsed.data }, idem),
          response: body,
        });

        return validateAndSend(RepaymentCreateResponse, body, 200);
      },
    },
  },
});
