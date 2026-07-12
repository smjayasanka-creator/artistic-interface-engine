// Server-side clock helper. Reads the x-dev-now header attached by
// clock-middleware on the client. Falls back to real time.
//
// Only READ-side "today" checks should use this. Audit timestamps
// (approved_at, closed_at, created_at) should stay on real wall-clock time.

import { getRequestHeader } from "@tanstack/react-start/server";

export function serverNow(): Date {
  try {
    const override = getRequestHeader("x-dev-now");
    if (override) {
      const d = new Date(override);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {
    // outside request context — fall through
  }
  return new Date();
}

export function serverToday(): string {
  return serverNow().toISOString().slice(0, 10);
}
