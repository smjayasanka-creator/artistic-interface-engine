import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/mzizi/Card";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/loans/account-statements")({
  component: AccountStatements,
});

function AccountStatements() {
  return (
    <div className="animate-fadein">
      <Card className="p-8 text-center">
        <FileText size={32} className="mx-auto text-blue-600 mb-3" />
        <div className="font-semibold text-[15px]">Account Statements</div>
        <div className="text-[12.5px] text-muted-foreground mt-1">
          Coming soon — view and download facility account statements.
        </div>
      </Card>
    </div>
  );
}
