import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/transactions/payments")({
  beforeLoad: () => {
    throw redirect({ to: "/accounts/payments/new" });
  },
});
