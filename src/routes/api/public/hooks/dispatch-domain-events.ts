import { createFileRoute } from "@tanstack/react-router";

/**
 * Domain-event dispatcher worker.
 *
 * Called by pg_cron (or any scheduler) at high frequency (e.g. every minute).
 * Claims a batch of pending events with FOR UPDATE SKIP LOCKED, dispatches
 * each one, and marks it as delivered or records the failure so it can be
 * retried with exponential backoff.
 *
 * Dispatch strategy: if a company has a `webhook_url` in api_key metadata
 * (channel='webhooks'), POST the event there. Otherwise log-only (still
 * marked dispatched — safe because domain_event is the audit source of
 * truth and downstream consumers can replay from it).
 */
export const Route = createFileRoute("/api/public/hooks/dispatch-domain-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey") ?? "";
        if (!expected || provided !== expected) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: events, error } = await supabaseAdmin.rpc(
          "claim_pending_domain_events",
          { _limit: 100 },
        );

        if (error) {
          return Response.json(
            { ok: false, error: error.message },
            { status: 500 },
          );
        }

        const claimed = events ?? [];
        let delivered = 0;
        let failed = 0;

        const envWebhook = process.env.DOMAIN_EVENT_WEBHOOK_URL;

        for (const ev of claimed) {
          try {
            if (envWebhook && /^https?:\/\//i.test(envWebhook)) {
              const res = await fetch(envWebhook, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Event-Id": ev.id,
                  "X-Event-Type": ev.event_type,
                  "X-Event-Domain": ev.domain,
                },
                body: JSON.stringify({
                  id: ev.id,
                  company_id: ev.company_id,
                  domain: ev.domain,
                  event_type: ev.event_type,
                  aggregate_type: ev.aggregate_type,
                  aggregate_id: ev.aggregate_id,
                  payload: ev.payload,
                  metadata: ev.metadata,
                  occurred_at: ev.created_at,
                }),
                signal: AbortSignal.timeout(10_000),
              });
              if (!res.ok) {
                throw new Error(`webhook ${res.status}: ${(await res.text()).slice(0, 500)}`);
              }
            } else {
              // No subscriber configured — event stays in ledger as source of truth.
              console.log(
                `[domain-event] no subscriber; marking dispatched company=${ev.company_id} ev=${ev.domain}.${ev.event_type} id=${ev.id}`,
              );
            }

            await supabaseAdmin.rpc("mark_domain_event_dispatched", { _id: ev.id });
            delivered++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await supabaseAdmin.rpc("mark_domain_event_failed", {
              _id: ev.id,
              _error: msg.slice(0, 1000),
            });
            failed++;
          }
        }

        return Response.json({
          ok: true,
          claimed: claimed.length,
          delivered,
          failed,
        });
      },
    },
  },
});
