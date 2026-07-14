import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, FilePlus2, FileMinus2, CalendarClock, ArrowRightLeft, Ban, Gavel, XCircle, ArrowRight, Loader2 } from "lucide-react";
import { getLoans } from "@/lib/mzizi.functions";
import { Avatar } from "@/components/mzizi/Avatar";
import { Card } from "@/components/mzizi/Card";
import { TablePagination } from "@/components/mzizi/TablePagination";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

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
] as const;

function LoansList() {
  const fn = useServerFn(getLoans);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { data, isFetching, isPlaceholderData } = useQuery({
    queryKey: ["loans", page, pageSize],
    queryFn: () => fn({ data: { page, pageSize } }),
    placeholderData: keepPreviousData,
  });
  const rows = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;

  return (
    <div className="animate-fadein space-y-6">

      <div className="grid gap-3 md:grid-cols-3">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} className="group">
              <Card className="p-3.5 hover:border-primary/40 transition-colors h-full">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0 ${t.accent}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px] truncate">{t.label}</div>
                    <div className="text-[11.5px] text-muted-foreground truncate">{t.desc}</div>
                  </div>
                  <ArrowRight size={16} className="text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Loan portfolio</h2>
          <p className="text-[12.5px] text-faint mt-0.5 flex items-center gap-2">
            Disbursed loans and repayment status
            {isFetching && <Loader2 size={12} className="animate-spin" />}
          </p>
        </div>
        <Link
          to="/loans/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[9px] bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          New application
        </Link>
      </div>
      <div className={cn("bg-card border border-border rounded-xl overflow-hidden", isPlaceholderData && "opacity-60 transition-opacity")}>
        <div className="grid gap-4 text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
             style={{ gridTemplateColumns: "1.7fr 1.4fr 1fr 1fr 1.4fr 1fr" }}>
          <div>Borrower</div><div>Product</div><div>Principal</div><div>Outstanding</div><div>Repaid</div><div>Next due</div>
        </div>
        {rows.map((l: any) => (
          <Link
            key={l.id}
            to="/clients/$id"
            params={{ id: l.client?.id }}
            className="grid gap-4 items-center text-[12.5px] py-3 px-5 border-b border-row-divider last:border-b-0 hover:bg-row-hover"
            style={{ gridTemplateColumns: "1.7fr 1.4fr 1fr 1fr 1.4fr 1fr" }}
          >
            <div className="font-semibold flex items-center gap-2.5">
              <Avatar name={l.client?.full_name ?? "?"} color={l.client?.avatar_color} size={30} />
              {l.client?.full_name}
            </div>
            <div className="text-secondary-foreground">{l.product?.name}</div>
            <div className="font-mono">{money(l.principal)}</div>
            <div className="font-mono font-semibold">{money(l.outstanding)}</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted rounded-md overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${l.progress}%` }} />
              </div>
              <span className="font-mono text-[11px] text-muted-foreground w-8">{l.progress}%</span>
            </div>
            <div className="text-[11.5px] font-semibold" style={{ color: l.overdue ? "var(--status-danger-fg)" : "var(--secondary-foreground)" }}>
              {l.overdue ? `Overdue · ${shortDate(l.nextDue)}` : shortDate(l.nextDue)}
            </div>
          </Link>
        ))}
        {rows.length === 0 && <div className="text-center text-faint text-sm py-10">No disbursed loans yet.</div>}
      </div>
      <TablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
        label="loans"
      />
    </div>
  );
}
