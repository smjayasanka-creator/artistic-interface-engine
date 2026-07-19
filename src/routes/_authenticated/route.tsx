import { createFileRoute, redirect } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/mzizi/AppShell";

/**
 * Try supabase.auth.getUser() a few times so a single transient
 * "Failed to fetch" on the very first navigation doesn't blow the user
 * out to /auth. Real auth errors (bad token, expired session) are
 * returned by Supabase as `{ error, data: { user: null } }` without
 * throwing — those we still treat as signed-out.
 */
async function loadUserWithRetry(): Promise<{ user: User | null; networkFailed: boolean }> {
  const delays = [0, 250, 600];
  let lastThrown: unknown;
  for (const delay of delays) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error && !data?.user) {
        // Supabase resolved with an auth error — not a network glitch.
        return { user: null, networkFailed: false };
      }
      return { user: data.user ?? null, networkFailed: false };
    } catch (err) {
      lastThrown = err;
    }
  }
  console.error("[auth-gate] getUser failed after retries", lastThrown);
  return { user: null, networkFailed: true };
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { user, networkFailed } = await loadUserWithRetry();
    if (user) return { user };
    if (networkFailed) {
      // Don't sign the user out on a transient network failure — surface
      // it to the errorComponent so they can retry.
      throw new Error(
        "Can't reach the authentication service. Check your connection and try again.",
      );
    }
    // Real signed-out state — clear any stale token and bounce to /auth.
    await supabase.auth.signOut().catch(() => {});
    throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  component: AppShell,
  errorComponent: AuthGateError,
});

function AuthGateError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-7 text-center">
        <div className="w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center bg-destructive/10 text-destructive font-semibold">
          !
        </div>
        <h1 className="text-base font-semibold text-foreground">Connection problem</h1>
        <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        <button
          onClick={() => reset()}
          className="mt-5 bg-primary text-primary-foreground font-semibold text-sm px-4 py-2 rounded-md hover:bg-primary-hover"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
