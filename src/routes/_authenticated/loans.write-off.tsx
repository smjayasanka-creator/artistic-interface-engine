import { createFileRoute } from "@tanstack/react-router";
import { makeStub } from "@/components/mzizi/LoanStub";

export const Route = createFileRoute("/_authenticated/loans/write-off")({
  component: makeStub("Write Off", "Write off overdue facilities."),
});
