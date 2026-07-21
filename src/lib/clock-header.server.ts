// Server-only helper. Reads the x-dev-now override header.
// The `.server.ts` extension keeps this module out of client bundles.
import { getRequestHeader } from "@tanstack/react-start/server";

export function readDevNowHeader(): string | null {
  try {
    return getRequestHeader("x-dev-now") ?? null;
  } catch {
    return null;
  }
}
