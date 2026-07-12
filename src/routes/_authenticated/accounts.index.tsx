import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Upload, Landmark, ArrowRight } from "lucide-react";
import { Card } from "@/components/mzizi/Card";

export const Route = createFileRoute("/_authenticated/accounts/")({
  component: AccountsIndex,
});

const CARDS = [
  {
    to: "/accounts/journal",
    icon: BookOpen,
    title: "Journal Entry",
    accent: "from-blue-500/15 to-blue-500/0 text-blue-600",
  },
  {
    to: "/accounts/bulk-journal",
    icon: Upload,
    title: "Bulk Journal Upload",
    accent: "from-violet-500/15 to-violet-500/0 text-violet-600",
  },
  {
    to: "/accounts/bank-reconciliation",
    icon: Landmark,
    title: "Bank Reconciliation",
    accent: "from-emerald-500/15 to-emerald-500/0 text-emerald-600",
  },
] as const;

function AccountsIndex() {
  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-3">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.to} to={c.to} className="group">
              <Card className="p-3.5 hover:border-primary/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0 ${c.accent}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px] truncate">{c.title}</div>
                  </div>
                  <ArrowRight size={16} className="text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
