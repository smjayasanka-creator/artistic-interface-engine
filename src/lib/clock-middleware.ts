import { createMiddleware } from "@tanstack/react-start";
import { getClientOverride } from "./clock";

// Attaches the current dev-time override (if any) to every server function call
// as an `x-dev-now` header. Server code reads it via serverNow().
export const attachDevClock = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const override = typeof window !== "undefined" ? getClientOverride() : null;
  return next({
    headers: override ? { "x-dev-now": override } : {},
  });
});
