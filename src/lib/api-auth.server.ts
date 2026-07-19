// Server-only helpers for API key authentication used by public HTTP routes.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ApiKeyRecord = {
  id: string;
  company_id: string;
  scopes: string[];
  environment: "sandbox" | "production";
  status: "active" | "revoked";
};

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time string compare (both inputs hashed first so length differences
// don't leak via early-exit timing on the raw secret).
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  return ha === hb;
}

// Authenticates internal pg_cron / scheduler workers (EOD close, accrual jobs,
// domain-event dispatch). These are NOT customer-facing API-key routes, so they
// use a dedicated secret rather than a Supabase key — the anon/publishable key
// is public by design (shipped to every browser) and must never gate a
// service-role-privileged operation.
export function authenticateCronRequest(request: Request): Promise<boolean> {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!expected || !provided) return Promise.resolve(false);
  return timingSafeEqual(provided, expected);
}

export function extractApiKey(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const xkey = request.headers.get("x-api-key");
  return xkey ? xkey.trim() : null;
}

export async function authenticateApiKey(
  request: Request,
  requiredScope: string,
): Promise<{ ok: true; key: ApiKeyRecord } | { ok: false; status: number; error: string }> {
  const raw = extractApiKey(request);
  if (!raw)
    return {
      ok: false,
      status: 401,
      error: "Missing API key (Authorization: Bearer <key> or X-API-Key)",
    };
  const hash = await sha256Hex(raw);
  const { data, error } = await supabaseAdmin
    .from("api_key")
    .select("id, company_id, scopes, environment, status")
    .eq("key_hash", hash)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 401, error: "Invalid API key" };
  if (data.status !== "active") return { ok: false, status: 403, error: "API key revoked" };
  if (!(data.scopes ?? []).includes(requiredScope)) {
    return { ok: false, status: 403, error: `API key missing required scope: ${requiredScope}` };
  }
  // best-effort last-used update (fire and forget)
  supabaseAdmin
    .from("api_key")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});
  return { ok: true, key: data as ApiKeyRecord };
}

export async function logApiCall(entry: {
  company_id: string | null;
  api_key_id: string | null;
  channel: string;
  direction: "inbound" | "outbound";
  endpoint: string;
  method: string;
  reference?: string | null;
  status_code: number;
  request?: unknown;
  response?: unknown;
  error?: string | null;
}) {
  try {
    await supabaseAdmin.from("api_transaction_log").insert({
      company_id: entry.company_id,
      api_key_id: entry.api_key_id,
      channel: entry.channel,
      direction: entry.direction,
      endpoint: entry.endpoint,
      method: entry.method,
      reference: entry.reference ?? null,
      status_code: entry.status_code,
      request: (entry.request ?? null) as any,
      response: (entry.response ?? null) as any,
      error: entry.error ?? null,
    });
  } catch {
    // swallow — logging must not break the API contract
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function generateReference(prefix: string): string {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  const rand = Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand.toUpperCase()}`;
}
