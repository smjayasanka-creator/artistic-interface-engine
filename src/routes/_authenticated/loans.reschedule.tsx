import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { Card } from "@/components/mzizi/Card";

export const Route = createFileRoute("/_authenticated/loans/reschedule")({
  component: RescheduleLanding,
});

function RescheduleLanding() {
  return (
    <div className="animate-fadein space-y-5 max-w-2xl">
      <Link
        to="/loans"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to Loans
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Reschedule / Restructure</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Change the rental schedule for an existing facility. Repayments received to date are
          preserved; upcoming installments are replaced with the new plan.
        </p>
      </div>
      <Card className="p-6 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <CalendarClock size={18} />
        </div>
        <div className="text-[13px] text-secondary-foreground">
          Open the facility from the{" "}
          <Link to="/loans" className="text-primary font-medium hover:underline">
            loan register
          </Link>{" "}
          and use the <span className="font-semibold">Reschedule</span> action on the detail page.
          The upcoming installments are pre-loaded so you can edit dates and amounts before
          applying the new schedule.
        </div>
      </Card>
    </div>
  );
}
