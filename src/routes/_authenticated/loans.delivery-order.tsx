import { createFileRoute } from "@tanstack/react-router";
import { makeStub } from "@/components/mzizi/LoanStub";

export const Route = createFileRoute("/_authenticated/loans/delivery-order")({
  component: makeStub(
    "Delivery Order Release",
    "Issue a Delivery Order to the vehicle supplier to release the vehicle to the customer before supplier payment (movable asset financing).",
  ),
});
