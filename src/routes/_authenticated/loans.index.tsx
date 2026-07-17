import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { FilePlus2, FileMinus2, CalendarClock, ArrowRightLeft, Ban, Gavel, XCircle, ArrowRight, Loader2, Truck, Eye } from "lucide-react";
import { getLoans } from "@/lib/mzizi.functions";
import { Avatar } from "@/components/mzizi/Avatar";
import { Card } from "@/components/mzizi/Card";
import { TablePagination } from "@/components/mzizi/TablePagination";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/loans/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["loans", 1, 25],
      queryFn: () => getLoans({ data: { page: 1, pageSize: 25 } }),
    }),
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

      <div className="pt-2">
        <h2 className="text-lg font-semibold text-foreground">Pending facilities</h2>
        <p className="text-[12.5px] text-faint mt-0.5 flex items-center gap-2">
          Applications and drafts awaiting disbursement
          {isFetching && <Loader2 size={12} className="animate-spin" />}
        </p>
      </div>

      <div className={cn("bg-card border border-border rounded-xl overflow-hidden", isPlaceholderData && "opacity-60 transition-opacity")}>
        <div className="grid gap-4 text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
             style={{ gridTemplateColumns: "1fr 1.7fr 1fr 1.4fr 60px" }}>
          <div>Facility No.</div><div>Client</div><div>Principal</div><div>Current stage</div><div className="text-right">View</div>
        </div>
        {rows.map((l: any) => {
          const isDraft = l.status === "draft";
          const to = isDraft ? "/loans/new" : "/loans/$id";
          const linkProps: any = isDraft
            ? { to, search: { id: l.id } }
            : { to, params: { id: l.id } };
          return (
            <Link
              key={l.id}
              {...linkProps}
              className="grid gap-4 items-center text-[12.5px] py-3 px-5 border-b border-row-divider last:border-b-0 hover:bg-row-hover"
              style={{ gridTemplateColumns: "1fr 1.7fr 1fr 1.4fr 60px" }}
            >
              <div className="font-mono text-[12px] font-semibold">{l.contract_no ?? "—"}</div>
              <div className="font-semibold flex items-center gap-2.5 min-w-0">
                <Avatar name={l.client?.full_name ?? "?"} color={l.client?.avatar_color} size={30} />
                <span className="truncate">{l.client?.full_name}</span>
              </div>
              <div className="font-mono">{money(l.principal)}</div>
              <div className="text-[11.5px] font-semibold text-secondary-foreground">
                <span className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-md",
                  isDraft ? "bg-amber-500/15 text-amber-700" : "bg-primary/10 text-primary",
                )}>
                  {l.stage}
                </span>
              </div>
              <div className="flex justify-end">
                <span className="w-8 h-8 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40">
                  <Eye size={14} />
                </span>
              </div>
            </Link>
          );
        })}
        {rows.length === 0 && <div className="text-center text-faint text-sm py-10">No pending facilities.</div>}
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
