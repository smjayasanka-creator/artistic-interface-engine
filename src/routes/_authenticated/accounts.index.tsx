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
      <div>
        <h1 className="text-xl font-semibold">Accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the general ledger — post entries, bulk upload from spreadsheets, and reconcile bank accounts.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.to}
              to={c.to}
              className="group block focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-xl"
            >
              <Card className="h-full flex flex-col gap-3 hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-none">
                    <Icon size={18} />
                  </div>
                  <div className="font-semibold text-[15px]">{c.title}</div>
                </div>
                <p className="text-[12.5px] leading-relaxed text-muted-foreground flex-1">{c.desc}</p>
                <div className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary group-hover:gap-2 transition-all">
                  {c.cta} <ArrowRight size={13} />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
