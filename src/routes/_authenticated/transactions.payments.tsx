import { createFileRoute } from "@tanstack/react-router";
import { NewPaymentPage } from "./accounts.payments.new";

export const Route = createFileRoute("/_authenticated/transactions/payments")({
  component: NewPaymentPage,
});
