// Isomorphic clock helper. On the server, reads the x-dev-now header attached
// by clock-middleware (dev-only). On the client, falls back to real time.
//
// Only READ-side "today" checks should use this. Audit timestamps
// (approved_at, closed_at, created_at) should stay on real wall-clock time.

import { createIsomorphicFn } from "@tanstack/react-start";

const readOverrideHeader = createIsomorphicFn()
  .client(() => null as string | null)
  .server(() => {
    // Dynamic require so the server-only module never enters the client graph.
    try {
      const mod = require("./clock-header.server") as typeof import("./clock-header.server");
      return mod.readDevNowHeader();
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
