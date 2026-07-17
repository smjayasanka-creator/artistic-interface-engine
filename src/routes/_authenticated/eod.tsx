import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/eod")({
  beforeLoad: () => { throw redirect({ to: "/admin" }); },
});
