import { createFileRoute, Link } from "@tanstack/react-router";
import { HandCoins, Banknote, Send, ArrowRight, PiggyBank, Wallet, Smartphone, Landmark, FileCheck2, Lock, ArrowDownFromLine, Truck, Undo2 } from "lucide-react";
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
    to: "/transactions/disbursement",
    label: "Disbursement",
    icon: Send,
    accent: "from-amber-500/15 to-amber-500/0 text-amber-600",
  },
  {
    to: "/loans/write-off",
    label: "Write-off Collection",
    icon: Undo2,
    accent: "from-red-500/15 to-red-500/0 text-red-600",
  },
  {
    to: "/transactions/supplier-payment",

    label: "Supplier Payment",
    icon: Truck,
    accent: "from-orange-500/15 to-orange-500/0 text-orange-600",
  },
  {
    to: "/transactions/deposit-receipt",
    label: "Deposit Receipt",
    icon: PiggyBank,
    accent: "from-teal-500/15 to-teal-500/0 text-teal-600",
  },
  {
    to: "/transactions/deposit-withdrawal",
    label: "Deposit Withdrawal",
    icon: Wallet,
    accent: "from-rose-500/15 to-rose-500/0 text-rose-600",
  },
  {
    to: "/transactions/savings-withdrawal",
    label: "Savings Withdrawal",
    icon: ArrowDownFromLine,
    accent: "from-pink-500/15 to-pink-500/0 text-pink-600",
  },
  {
    to: "/transactions/cash-wallet",
    label: "Cash ↔ Wallet Transfer",
    icon: Smartphone,
    accent: "from-violet-500/15 to-violet-500/0 text-violet-600",
  },
  {
    to: "/transactions/cash-bank",
    label: "Cash ↔ Bank",
    icon: Landmark,
    accent: "from-indigo-500/15 to-indigo-500/0 text-indigo-600",
  },
  {
    to: "/transactions/cheque-bank",
    label: "Cheque → Bank",
    icon: FileCheck2,
    accent: "from-cyan-500/15 to-cyan-500/0 text-cyan-600",
  },
  {
    to: "/transactions/close-cashier",
    label: "Close Cashier (Day End)",
    icon: Lock,
    accent: "from-slate-500/15 to-slate-500/0 text-slate-600",
  },
] as const;


function TransactionsIndex() {
  return (
    <div className="animate-fadein flex flex-col gap-5">
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
