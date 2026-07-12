import { createFileRoute } from "@tanstack/react-router";
import { makeStub } from "@/components/mzizi/LoanStub";

export const Route = createFileRoute("/_authenticated/loans/reschedule")({
  component: makeStub(
    "Reschedule / Restructure",
    "Change the rental schedule and conditions, and create a new facility using the existing loan settlement balance.",
  ),
});
