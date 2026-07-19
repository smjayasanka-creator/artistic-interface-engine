import { createFileRoute } from "@tanstack/react-router";
import { makeStub } from "@/components/mzizi/LoanStub";

export const Route = createFileRoute("/_authenticated/loans/legal-action")({
  component: makeStub("Legal Action", "Record legal action against transferred facilities."),
});
