// Outbound webhook management + delivery queue.
//
// - Endpoints are per-company, per-env, and gated by the same RLS as api_key.
// - Each endpoint gets an HMAC-SHA256 signing secret that is shown to the
//   developer once at creation / rotation time. The platform also stores the
//   secret so it can sign outbound requests server-side.
// - Deliveries live in webhook_delivery. The public dispatcher route picks up
//   pending rows and failed rows with next_retry_at <= now, POSTs the payload
//   with the signature header, and updates status.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { API_CONTRACTS } from "@/lib/api-contract";

// ------------------------------------------------------------------ helpers

function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getCompanyId(supabase: any, userId: string): Promise<string> {
  const { data: staff } = await supabase
    .from("staff")
    .select("branch:branch_id(company_id)")
    .eq("user_id", userId)
    .maybeSingle();
  const company_id = (staff?.branch as any)?.company_id;
  if (!company_id) throw new Error("No company context");
  return company_id as string;
}

// Catalogue of every event any endpoint may subscribe to. Derived from the
// contract registry so it cannot drift from the docs.
export function allWebhookEvents(): string[] {
  const set = new Set<string>();
  for (const c of API_CONTRACTS) {
    for (const e of c.webhookEvents ?? []) set.add(e);
  }
  // Reserved lifecycle events that the platform emits directly.
  set.add("ping");
  return Array.from(set).sort();
}

// ------------------------------------------------------------------ endpoints

export const listWebhookEndpoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ env: z.enum(["sandbox", "production"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("webhook_endpoint")
      .select(
        "id, label, url, events, secret_prefix, status, timeout_ms, max_attempts, last_delivery_at, created_at",
      )
      .eq("env", data.env)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { endpoints: rows ?? [], events: allWebhookEvents() };
  });

export const createWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        env: z.enum(["sandbox", "production"]),
        label: z.string().min(2).max(80),
        url: z.string().url().refine((u) => u.startsWith("https://"), "URL must be https"),
        events: z.array(z.string()).min(1),
        timeout_ms: z.number().int().min(1000).max(30000).default(10000),
        max_attempts: z.number().int().min(1).max(20).default(5),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const company_id = await getCompanyId(supabase, userId);

    const secret = `whsec_${randomToken(24)}`;
    const secret_prefix = secret.slice(0, 12);
    // Store a hash for display/audit AND the plaintext for signing.
    const enc = new TextEncoder().encode(secret);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const secret_hash = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { data: row, error } = await supabase
      .from("webhook_endpoint")
      .insert({
        company_id,
        env: data.env,
        label: data.label,
        url: data.url,
        events: data.events,
        secret,
        secret_prefix,
        secret_hash,
        timeout_ms: data.timeout_ms,
        max_attempts: data.max_attempts,
        created_by: userId,
      })
      .select(
        "id, label, url, events, secret_prefix, status, timeout_ms, max_attempts, created_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return { endpoint: row, secret };
  });

export const updateWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        label: z.string().min(2).max(80).optional(),
        url: z.string().url().optional(),
        events: z.array(z.string()).min(1).optional(),
        status: z.enum(["active", "disabled"]).optional(),
        timeout_ms: z.number().int().min(1000).max(30000).optional(),
        max_attempts: z.number().int().min(1).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { error } = await supabase
      .from("webhook_endpoint")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const secret = `whsec_${randomToken(24)}`;
    const secret_prefix = secret.slice(0, 12);
    const enc = new TextEncoder().encode(secret);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const secret_hash = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { error } = await supabase
      .from("webhook_endpoint")
      .update({ secret, secret_prefix, secret_hash })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { secret };
  });

export const deleteWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("webhook_endpoint")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------------------------------------------------------ deliveries

export const listWebhookDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        env: z.enum(["sandbox", "production"]),
        endpoint_id: z.string().uuid().optional(),
        status: z
          .enum(["pending", "success", "failed", "dead_letter"])
          .optional(),
        limit: z.number().min(1).max(200).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("webhook_delivery")
      .select(
        "id, endpoint_id, event_type, attempt, status, status_code, response_ms, response_snippet, next_retry_at, created_at",
      )
      .eq("env", data.env)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.endpoint_id) q = q.eq("endpoint_id", data.endpoint_id);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { deliveries: rows ?? [] };
  });

// Queue a synthetic ping so the developer can verify the endpoint end-to-end.
export const sendTestWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const company_id = await getCompanyId(supabase, userId);
    const { data: ep, error: epErr } = await supabase
      .from("webhook_endpoint")
      .select("id, env, status")
      .eq("id", data.id)
      .maybeSingle();
    if (epErr) throw new Error(epErr.message);
    if (!ep) throw new Error("Endpoint not found");
    if (ep.status !== "active") throw new Error("Endpoint is disabled");
    const { error } = await supabase.from("webhook_delivery").insert({
      company_id,
      env: ep.env,
      endpoint_id: ep.id,
      event_type: "ping",
      status: "pending",
      payload: { hello: "world", queued_by: userId, queued_at: new Date().toISOString() },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Enqueue a real business event. Call from any server function that mutates
// state the API contract advertises via webhookEvents. No-op if no endpoint
// subscribes.
export const emitWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        event_type: z.string().min(3),
        event_id: z.string().uuid().optional(),
        payload: z.record(z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const company_id = await getCompanyId(supabase, userId);
    const { data: eps, error } = await supabase
      .from("webhook_endpoint")
      .select("id, env, events")
      .eq("company_id", company_id)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    const matches = (eps ?? []).filter((e: any) => e.events.includes(data.event_type));
    if (matches.length === 0) return { queued: 0 };
    const rows = matches.map((e: any) => ({
      company_id,
      env: e.env as string,
      endpoint_id: e.id as string,
      event_id: data.event_id ?? null,
      event_type: data.event_type,
      status: "pending" as const,
      payload: data.payload as any,
    }));
    const { error: insErr } = await supabase.from("webhook_delivery").insert(rows as any);

    if (insErr) throw new Error(insErr.message);
    return { queued: rows.length };
  });
