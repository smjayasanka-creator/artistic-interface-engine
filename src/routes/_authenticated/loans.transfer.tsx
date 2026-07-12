import { createFileRoute } from "@tanstack/react-router";
import { makeStub } from "@/components/mzizi/LoanStub";

export const Route = createFileRoute("/_authenticated/loans/transfer")({
  component: makeStub(
    "Facility Transfer",
    "Transfer facilities for repossession or legal action.",
  ),
});
