// Server-side clock helper. Reads the x-dev-now header attached by
// clock-middleware on the client. Falls back to real time.
//
// Only READ-side "today" checks should use this. Audit timestamps
// (approved_at, closed_at, created_at) should stay on real wall-clock time.
//
// Uses createIsomorphicFn so this module is safe to import from
// `.functions.ts` files whose top-level imports ship to the client bundle.

import { createIsomorphicFn } from "@tanstack/react-start";

const readOverrideHeader = createIsomorphicFn()
  .client(() => null as string | null)
  .server(() => {
    try {
      // Dynamic require keeps the server-only module out of the client graph.
      const { getRequestHeader } =
        require("@tanstack/react-start/server") as typeof import("@tanstack/react-start/server");
      return getRequestHeader("x-dev-now") ?? null;
    } catch {
      return null;
    }
  });

export function serverNow(): Date {
  const override = readOverrideHeader();
  if (override) {
    const d = new Date(override);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function serverToday(): string {
  return serverNow().toISOString().slice(0, 10);
}
