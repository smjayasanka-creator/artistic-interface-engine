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
    desc: "Record installment payments from customers against active loans.",
    icon: HandCoins,
    accent: "from-emerald-500/15 to-emerald-500/0 text-emerald-600",
  },
  {
    to: "/transactions/payments",
    label: "Payments",
    desc: "Post incoming payments across cash, M-Pesa or bank channels.",
    icon: Banknote,
    accent: "from-sky-500/15 to-sky-500/0 text-sky-600",
  },
  {
    to: "/transactions/disbursement",
    label: "Disbursement",
    desc: "Release approved loans to clients and post the disbursement entry.",
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
      <div className="grid gap-4 md:grid-cols-3">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} className="group">
              <Card className="p-5 h-full flex flex-col gap-4 hover:border-primary/40 transition-colors">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center ${t.accent}`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-[15px]">{t.label}</div>
                  <div className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">{t.desc}</div>
                </div>
                <div className="text-[12px] font-semibold text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                  Open <ArrowRight size={13} />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
