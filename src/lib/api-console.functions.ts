import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SCOPES = [
  "transactions.inbound",
  "transactions.outbound",
  "ceft",
  "atm",
  "internet_banking",
  "crib",
] as const;

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("api_key")
      .select("id, label, key_prefix, scopes, environment, status, last_used_at, created_at, revoked_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { keys: data ?? [] };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      label: z.string().min(2).max(80),
      scopes: z.array(z.enum(SCOPES)).min(1),
      environment: z.enum(["sandbox", "production"]).default("sandbox"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase
      .from("staff")
      .select("id, branch:branch_id(company_id)")
      .eq("user_id", userId)
      .maybeSingle();
    const company_id = (staff?.branch as any)?.company_id;
    if (!company_id) throw new Error("No company context");

    const prefix = data.environment === "production" ? "mz_live_" : "mz_test_";
    const rawSecret = randomToken(24);
    const fullKey = `${prefix}${rawSecret}`;
    const key_hash = await sha256Hex(fullKey);
    const key_prefix = fullKey.slice(0, prefix.length + 6);

    const { data: row, error } = await supabase
      .from("api_key")
      .insert({
        company_id,
        label: data.label,
        key_prefix,
        key_hash,
        scopes: data.scopes,
        environment: data.environment,
        created_by: userId,
      })
      .select("id, label, key_prefix, scopes, environment, status, created_at")
      .single();
    if (error) throw new Error(error.message);

    // Only returned ONCE
    return { key: row, secret: fullKey };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("api_key")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listApiLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ channel: z.string().optional(), limit: z.number().min(1).max(200).default(50) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("api_transaction_log")
      .select("id, channel, direction, endpoint, method, reference, status_code, error, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.channel) q = q.eq("channel", data.channel);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { logs: rows ?? [] };
  });
