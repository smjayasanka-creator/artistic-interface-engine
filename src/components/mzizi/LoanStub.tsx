import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Construction } from "lucide-react";
import { Card } from "@/components/mzizi/Card";

export function makeStub(title: string, description: string) {
  return function Stub() {
    return (
      <div className="animate-fadein space-y-5 max-w-2xl">
        <Link to="/loans" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Back to Loans
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <Card className="p-6 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
            <Construction size={18} />
          </div>
          <div className="text-[13px] text-secondary-foreground">
            This module is being wired up. The workflow and posting rules will appear here.
          </div>
        </Card>
      </div>
    );
  };
}

// Re-export for route files
export const _routeMarker = createFileRoute;
