// Client-side clock with a dev "time travel" override stored in localStorage.
// Server code uses src/lib/clock.server.ts which reads the x-dev-now header
// attached by the clock-middleware.

const KEY = "dev:now";

export function getClientOverride(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setClientOverride(iso: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (iso) window.localStorage.setItem(KEY, iso);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  // notify listeners
  window.dispatchEvent(new CustomEvent("dev-now-change"));
}

/** Isomorphic-ish "now" — respects the override on the client. On the server,
 *  falls back to real time (server code should use serverNow() to read header). */
export function now(): Date {
  const o = getClientOverride();
  return o ? new Date(o) : new Date();
}

export function today(): string {
  return now().toISOString().slice(0, 10);
}
