// Public webhook dispatcher — called every minute by pg_cron.
//
// Auth: caller must present the project anon key in the `apikey` header.
// This is not a user-facing route; it just drains the delivery queue.
//
// For each pending row and each failed row whose next_retry_at is due:
//   1. Sign the JSON body with HMAC-SHA256 over `${timestamp}.${body}`.
//   2. POST to the endpoint URL with signature + delivery-id headers.
//   3. On 2xx  -> status=success.
//      On !2xx / timeout / network -> status=failed with exponential retry;
//        after max_attempts, status=dead_letter.

import { createFileRoute } from "@tanstack/react-router";
import { createHmac } from "crypto";

const BACKOFF_MINUTES = [1, 5, 30, 120, 720]; // 1m, 5m, 30m, 2h, 12h

function nextRetryAt(attempt: number): string {
  const idx = Math.min(attempt - 1, BACKOFF_MINUTES.length - 1);
  const mins = BACKOFF_MINUTES[Math.max(0, idx)];
  return new Date(Date.now() + mins * 60_000).toISOString();
}

function sign(secret: string, timestamp: number, body: string): string {
  const mac = createHmac("sha256", secret);
  mac.update(`${timestamp}.${body}`);
  return mac.digest("hex");
}

async function deliverOne(
  supabaseAdmin: any,
  d: any,
  endpoint: any,
): Promise<void> {
  const body = JSON.stringify({
    id: d.id,
    event: d.event_type,
    event_id: d.event_id,
    created_at: d.created_at,
    attempt: d.attempt,
    data: d.payload ?? {},
  });
  const ts = Math.floor(Date.now() / 1000);
  const signature = sign(endpoint.secret ?? "", ts, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), endpoint.timeout_ms ?? 10000);
  const started = Date.now();
  let status_code: number | null = null;
  let snippet: string | null = null;
  let ok = false;

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `t=${ts},v1=${signature}`,
        "X-Webhook-Delivery": d.id,
        "X-Webhook-Event": d.event_type,
      },
      body,
      signal: controller.signal,
    });
    status_code = res.status;
    const text = await res.text().catch(() => "");
    snippet = text.slice(0, 500);
    ok = res.ok;
  } catch (e: any) {
    snippet = String(e?.message ?? e).slice(0, 500);
  } finally {
    clearTimeout(timer);
  }

  const response_ms = Date.now() - started;
  const isFinal = ok || d.attempt >= (endpoint.max_attempts ?? 5);
  const status = ok
    ? "success"
    : d.attempt >= (endpoint.max_attempts ?? 5)
      ? "dead_letter"
      : "failed";

  await supabaseAdmin
    .from("webhook_delivery")
    .update({
      status,
      status_code,
      response_ms,
      response_snippet: snippet,
      next_retry_at: isFinal ? null : nextRetryAt(d.attempt),
    })
    .eq("id", d.id);

  if (ok) {
    await supabaseAdmin
      .from("webhook_endpoint")
      .update({ last_delivery_at: new Date().toISOString() })
      .eq("id", endpoint.id);
  }
}

export const Route = createFileRoute("/api/public/webhooks/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedKey =
          request.headers.get("apikey") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!providedKey || providedKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Pull a small batch (cron runs every minute — keep short).
        const nowIso = new Date().toISOString();
        const { data: pending, error } = await supabaseAdmin
          .from("webhook_delivery")
          .select("*")
          .or(
            `status.eq.pending,and(status.eq.failed,next_retry_at.lte.${nowIso})`,
          )
          .order("created_at", { ascending: true })
          .limit(50);
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        let processed = 0;
        let succeeded = 0;
        let failed = 0;

        for (const raw of pending ?? []) {
          const d: any = raw;
          const attempt = d.attempt + (d.status === "failed" ? 1 : 0);
          // Bump attempt now so concurrent runs don't double-send.
          const { error: claimErr } = await supabaseAdmin
            .from("webhook_delivery")
            .update({ attempt, status: "pending", next_retry_at: null })
            .eq("id", d.id)
            .eq("attempt", d.attempt);
          if (claimErr) continue;

          const { data: ep } = await supabaseAdmin
            .from("webhook_endpoint")
            .select("id, url, secret, timeout_ms, max_attempts, status")
            .eq("id", d.endpoint_id)
            .maybeSingle();
          if (!ep || ep.status !== "active") {
            await supabaseAdmin
              .from("webhook_delivery")
              .update({
                status: "dead_letter",
                response_snippet: "endpoint disabled or removed",
              })
              .eq("id", d.id);
            continue;
          }

          await deliverOne(supabaseAdmin, { ...d, attempt }, ep);
          processed += 1;

          const { data: after } = await supabaseAdmin
            .from("webhook_delivery")
            .select("status")
            .eq("id", d.id)
            .maybeSingle();
          if (after?.status === "success") succeeded += 1;
          else if (after?.status === "failed" || after?.status === "dead_letter") failed += 1;
        }

        return Response.json({ processed, succeeded, failed });
      },
    },
  },
});
