// Server-only helper that resolves the current API environment
// (sandbox|production) and applies it as a Postgres session GUC so
// every RLS-scoped query filters by env automatically.
//
// This is the single seam between "logical" env isolation (today, same
// database) and a future physical sandbox database — everything else in
// the codebase reads env through this helper, so swapping the seam later
// does not require touching every query.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ApiEnv = "sandbox" | "production";

export function normalizeEnv(input: unknown, fallback: ApiEnv = "production"): ApiEnv {
  return input === "sandbox" || input === "production" ? input : fallback;
}

// Derive env from a raw API key prefix (mz_test_… → sandbox, mz_live_… → production).
export function envFromKeyPrefix(prefix: string | null | undefined): ApiEnv {
  if (!prefix) return "production";
  if (prefix.startsWith("mz_test_")) return "sandbox";
  return "production";
}

// Apply the env to the current Postgres session so RLS policies scoped by
// current_api_env() see it. Safe to call multiple times per request.
export async function applyApiEnv(supabase: SupabaseClient, env: ApiEnv): Promise<void> {
  await supabase.rpc("set_config", {
    parameter: "app.current_env",
    value: env,
    is_local: true,
  } as never);
}
