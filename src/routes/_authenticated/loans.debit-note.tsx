import { createFileRoute } from "@tanstack/react-router";
import { makeStub } from "@/components/mzizi/LoanStub";

export const Route = createFileRoute("/_authenticated/loans/debit-note")({
  component: makeStub("Debit Note", "Add charges to the facility after disbursement."),
});
