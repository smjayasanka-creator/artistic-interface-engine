// Server-only helper to enqueue an outbound webhook from public API routes
// (which run with the service role and have no user session for
// requireSupabaseAuth). Mirrors emitWebhookEvent from webhooks.functions.ts
// but takes an explicit company_id + env instead of deriving them from a
// staff record.
//
// The dispatcher (routes/api/public/webhooks/dispatch) picks up the rows,
// signs and delivers them — this helper only queues.

import type { SupabaseClient } from "@supabase/supabase-js";

export type WebhookEnv = "sandbox" | "production";

export async function enqueueWebhookForCompany(
  supabaseAdmin: SupabaseClient,
  args: {
    company_id: string;
    env: WebhookEnv;
    event_type: string;
    event_id?: string | null;
    payload: Record<string, unknown>;
  },
): Promise<{ queued: number }> {
  const { data: eps, error } = await supabaseAdmin
    .from("webhook_endpoint")
    .select("id, env, events")
    .eq("company_id", args.company_id)
    .eq("env", args.env)
    .eq("status", "active");
  if (error) throw new Error(error.message);
  const matches = (eps ?? []).filter((e: any) =>
    (e.events as string[]).includes(args.event_type),
  );
  if (matches.length === 0) return { queued: 0 };
  const rows = matches.map((e: any) => ({
    company_id: args.company_id,
    env: args.env,
    endpoint_id: e.id as string,
    event_id: args.event_id ?? null,
    event_type: args.event_type,
    status: "pending" as const,
    payload: args.payload as any,
  }));
  const { error: insErr } = await supabaseAdmin
    .from("webhook_delivery")
    .insert(rows as any);
  if (insErr) throw new Error(insErr.message);
  return { queued: rows.length };
}
