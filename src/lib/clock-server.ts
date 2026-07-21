// Isomorphic clock helper. On the server, reads the x-dev-now header attached
// by clock-middleware (dev-only). On the client, falls back to real time.
//
// Only READ-side "today" checks should use this. Audit timestamps
// (approved_at, closed_at, created_at) should stay on real wall-clock time.

import { createIsomorphicFn } from "@tanstack/react-start";

const readOverrideHeader = createIsomorphicFn()
  .client((): string | null => null)
  .server((): string | null => {
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
    const date = new Date(override);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return new Date();
}

export function serverToday(): string {
  return serverNow().toISOString().slice(0, 10);
}
