import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, X } from "lucide-react";
import { getPayments } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accounts/payments")({
  component: PaymentsPage,
});

const PAGE_SIZES = [10, 25, 50, 100];
const CHANNELS = ["cash", "mpesa", "bank", "internal"] as const;

function PaymentsPage() {
  const fn = useServerFn(getPayments);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [channel, setChannel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, channel, from, to, pageSize]);

  const { data, isFetching, isLoading, isPlaceholderData } = useQuery({
    queryKey: ["payments", debouncedSearch, channel, from, to, page, pageSize],
    queryFn: () =>
      fn({
        data: {
          from: from || undefined,
          to: to || undefined,
          channel: channel || undefined,
          search: debouncedSearch || undefined,
          page,
          pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const payments = data?.payments ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalAmount = data?.totalAmount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeFrom = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, totalCount);

  const inputCls =
    "h-9 px-3 rounded-md border border-border bg-card text-[12.5px] focus:outline-none focus:border-primary";
  const btnCls =
    "h-8 min-w-8 px-2 rounded-md border border-border bg-card text-[12.5px] flex items-center justify-center gap-1 hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-[320px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client name…"
            className={`${inputCls} pl-8 w-full`}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputCls}>
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c} className="capitalize">
              {c[0].toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <label className="text-[11.5px] text-faint">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[11.5px] text-faint">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        {(from || to || channel) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setChannel("");
            }}
            className="text-[12px] text-faint hover:text-foreground px-2 py-1"
          >
            Reset filters
          </button>
        )}
        <div className="ml-auto flex items-center gap-3 text-[11.5px] text-faint">
          {isFetching && <Loader2 size={13} className="animate-spin" />}
          <span>
            Total{" "}
            <span className="font-semibold text-primary font-mono">{money(totalAmount)}</span>
          </span>
          <span>
            {totalCount === 0
              ? "0 payments"
              : `${rangeFrom.toLocaleString()}–${rangeTo.toLocaleString()} of ${totalCount.toLocaleString()}`}
          </span>
          <Link
            to="/accounts/payments/new"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12.5px] font-semibold hover:bg-primary-hover"
          >
            <Plus size={13} /> New payment
          </Link>
        </div>
      </div>

      <Card padded={false}>
        <div className={cn("relative", isPlaceholderData && "opacity-60 transition-opacity")}>
          <div
            className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
            style={{ gridTemplateColumns: "1fr 1.6fr .9fr .8fr 1fr 1fr" }}
          >
            <div>Received</div>
            <div>Client</div>
            <div>Loan</div>
            <div>Channel</div>
            <div>Received by</div>
            <div className="text-right">Amount</div>
          </div>

          {isLoading ? (
            <SkeletonRows count={pageSize > 10 ? 10 : pageSize} />
          ) : payments.length === 0 ? (
            <div className="text-center text-faint text-sm py-10">
              {debouncedSearch || from || to || channel
                ? "No payments match your filters."
                : "No payments recorded yet."}
            </div>
          ) : (
            payments.map((p: any) => (
              <div
                key={p.id}
                className="grid items-center text-[12.5px] py-2.5 px-5 border-b border-row-divider hover:bg-secondary/30"
                style={{ gridTemplateColumns: "1fr 1.6fr .9fr .8fr 1fr 1fr" }}
              >
                <div className="text-muted-foreground">{shortDate(p.received_at)}</div>
                <div className="truncate">{p.loan?.client?.full_name ?? "—"}</div>
                <div className="font-mono text-[11.5px] text-faint truncate">
                  {p.loan?.id?.slice(0, 8) ?? "—"}
                </div>
                <div className="capitalize text-muted-foreground">{p.channel ?? "—"}</div>
                <div className="text-muted-foreground truncate">
                  {p.received_by_staff?.full_name ?? "—"}
                </div>
                <div className="text-right font-mono text-primary">{money(Number(p.amount))}</div>
              </div>
            ))
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[12px] text-faint">
          <label>Rows per page</label>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-8 px-2 rounded-md border border-border bg-card text-[12.5px] focus:outline-none focus:border-primary"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-faint">
            Page {page} of {totalPages}
          </span>
          <button onClick={() => setPage(1)} disabled={page <= 1} className={btnCls} aria-label="First page">
            «
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className={btnCls}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className={btnCls}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            className={btnCls}
            aria-label="Last page"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="grid items-center py-3 px-5 border-b border-row-divider"
          style={{ gridTemplateColumns: "1fr 1.6fr .9fr .8fr 1fr 1fr" }}
        >
          {Array.from({ length: 6 }).map((__, j) => (
            <div key={j} className={cn("h-3 rounded bg-muted animate-pulse mr-3", j === 5 && "ml-auto w-20")} />
          ))}
        </div>
      ))}
    </>
  );
}
