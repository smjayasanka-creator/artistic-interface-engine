import { createFileRoute, Link } from "@tanstack/react-router";
import { HandCoins, Banknote, Send, ArrowRight } from "lucide-react";
import { Card } from "@/components/mzizi/Card";

export const Route = createFileRoute("/_authenticated/transactions/")({
  component: TransactionsIndex,
});

const TILES = [
  {
    to: "/transactions/repayment",
    label: "Loan Repayment",
    icon: HandCoins,
    accent: "from-emerald-500/15 to-emerald-500/0 text-emerald-600",
  },
  {
    to: "/transactions/payments",
    label: "Payments",
    icon: Banknote,
    accent: "from-sky-500/15 to-sky-500/0 text-sky-600",
  },
  {
    to: "/transactions/disbursement",
    label: "Disbursement",
    icon: Send,
    accent: "from-amber-500/15 to-amber-500/0 text-amber-600",
  },
] as const;

function TransactionsIndex() {
  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Transactions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Post money-movement transactions. Every entry is captured against your assigned branch.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} className="group">
              <Card className="p-3.5 hover:border-primary/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0 ${t.accent}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px] truncate">{t.label}</div>
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
