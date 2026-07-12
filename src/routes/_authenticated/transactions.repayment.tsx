import { createFileRoute } from "@tanstack/react-router";
import { RecordRepaymentPage } from "./collections.new";

export const Route = createFileRoute("/_authenticated/transactions/repayment")({
  component: RecordRepaymentPage,
});
