import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, AlertOctagon } from "lucide-react";
import { Card } from "@/components/mzizi/Card";

export const Route = createFileRoute("/_authenticated/loans/write-off")({
  component: WriteOffLanding,
});

function WriteOffLanding() {
  return (
    <div className="animate-fadein space-y-5 max-w-2xl">
      <Link
        to="/loans"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to Loans
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Write off</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Write off an overdue facility. State change and GL reversal happen atomically.
        </p>
      </div>
      <Card className="p-6 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
          <AlertOctagon size={18} />
        </div>
        <div className="text-[13px] text-secondary-foreground">
          Open the facility from the{" "}
          <Link to="/loans" className="text-primary font-medium hover:underline">
            loan register
          </Link>{" "}
          and use the <span className="font-semibold">Write off</span> action on the detail page.
          The action is available for disbursed and active facilities and posts to the loan
          product's Bad Debt Expense / Loan Loss Provision and Suspended Interest accounts.
        </div>
      </Card>
    </div>
  );
}
