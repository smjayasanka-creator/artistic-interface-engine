import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/mzizi/Card";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/loans/actions")({
  component: LoanActions,
});

function LoanActions() {
  return (
    <div className="animate-fadein">
      <Card className="p-8 text-center">
        <Activity size={32} className="mx-auto text-lime-600 mb-3" />
        <div className="font-semibold text-[15px]">Actions</div>
        <div className="text-[12.5px] text-muted-foreground mt-1">Coming soon — record and track follow-up actions on facilities.</div>
      </Card>
    </div>
  );
}
