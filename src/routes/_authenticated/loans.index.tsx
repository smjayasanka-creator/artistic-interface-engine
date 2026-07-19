import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FilePlus2,
  FileMinus2,
  CalendarClock,
  ArrowRightLeft,
  Ban,
  Gavel,
  XCircle,
  ArrowRight,
  Truck,
  Mail,
  Activity,
  FileText,
} from "lucide-react";
import { Card } from "@/components/mzizi/Card";

export const Route = createFileRoute("/_authenticated/loans/")({
  component: LoansList,
});

const TILES = [
  {
    to: "/loans/new",
    label: "New Loan Application",
    desc: "Create a new loan facility",
    icon: FilePlus2,
    accent: "from-emerald-500/15 to-emerald-500/0 text-emerald-600",
  },
  {
    to: "/loans/debit-note",
    label: "Debit Note",
    desc: "Add charges to the facility after disbursement",
    icon: FileMinus2,
    accent: "from-sky-500/15 to-sky-500/0 text-sky-600",
  },
  {
    to: "/loans/delivery-order",
    label: "Delivery Order Release",
    desc: "Issue a DO to the vehicle supplier to release the asset before supplier payment",
    icon: Truck,
    accent: "from-cyan-500/15 to-cyan-500/0 text-cyan-600",
  },
  {
    to: "/loans/reschedule",
    label: "Reschedule / Restructure",
    desc: "Change rental schedule and create a new facility from the settlement balance",
    icon: CalendarClock,
    accent: "from-amber-500/15 to-amber-500/0 text-amber-600",
  },
  {
    to: "/loans/termination",
    label: "Facility Termination",
    desc: "Settle the outstanding balance early and close the facility",
    icon: XCircle,
    accent: "from-teal-500/15 to-teal-500/0 text-teal-600",
  },
  {
    to: "/loans/transfer",
    label: "Facility Transfer",
    desc: "Transfer facilities for repossession or legal action",
    icon: ArrowRightLeft,
    accent: "from-indigo-500/15 to-indigo-500/0 text-indigo-600",
  },
  {
    to: "/loans/write-off",
    label: "Write Off",
    desc: "Write off overdue facilities",
    icon: Ban,
    accent: "from-rose-500/15 to-rose-500/0 text-rose-600",
  },
  {
    to: "/loans/legal-action",
    label: "Legal Action",
    desc: "Record legal action against transferred facilities",
    icon: Gavel,
    accent: "from-fuchsia-500/15 to-fuchsia-500/0 text-fuchsia-600",
  },
  {
    to: "/loans/reminder-letters",
    label: "Reminder Letters",
    desc: "Generate and send reminder letters to borrowers",
    icon: Mail,
    accent: "from-orange-500/15 to-orange-500/0 text-orange-600",
  },
  {
    to: "/loans/actions",
    label: "Actions",
    desc: "Track follow-up actions on facilities",
    icon: Activity,
    accent: "from-lime-500/15 to-lime-500/0 text-lime-600",
  },
  {
    to: "/loans/account-statements",
    label: "Account Statements",
    desc: "View and download facility account statements",
    icon: FileText,
    accent: "from-blue-500/15 to-blue-500/0 text-blue-600",
  },
] as const;

function LoansList() {
  return (
    <div className="animate-fadein space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} className="group">
              <Card className="p-3.5 hover:border-primary/40 transition-colors h-full">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0 ${t.accent}`}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px] truncate">{t.label}</div>
                    <div className="text-[11.5px] text-muted-foreground truncate">{t.desc}</div>
                  </div>
                  <ArrowRight
                    size={16}
                    className="text-primary shrink-0 group-hover:translate-x-0.5 transition-transform"
                  />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
