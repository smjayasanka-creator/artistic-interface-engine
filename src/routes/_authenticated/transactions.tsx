import { createFileRoute, Outlet } from "@tanstack/react-router";
import { TellerSummary } from "@/components/mzizi/TellerSummary";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsLayout,
});

function TransactionsLayout() {
  return (
    <div className="flex gap-0 -mx-7 -my-6 min-h-full">
      <div className="flex-1 min-w-0 px-7 py-6">
        <Outlet />
      </div>
      <TellerSummary />
    </div>
  );
}
