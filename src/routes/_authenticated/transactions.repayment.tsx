import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/transactions/repayment")({
  beforeLoad: () => {
    throw redirect({ to: "/collections/new" });
  },
});
