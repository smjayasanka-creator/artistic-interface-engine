import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { getJournalEntries } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accounts/journal")({
  component: JournalEntriesPage,
});

const PAGE_SIZES = [10, 25, 50, 100];

function JournalEntriesPage() {
  const fn = useServerFn(getJournalEntries);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to first page whenever filters or page size change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, from, to, pageSize]);

  const { data, isFetching, isLoading, isPlaceholderData } = useQuery({
    queryKey: ["journal-entries", debouncedSearch, from, to, page, pageSize],
    queryFn: () =>
      fn({
        data: {
          from: from || undefined,
          to: to || undefined,
          search: debouncedSearch || undefined,
          page,
          pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, total);
  const totalDR = entries.reduce((s: number, e: any) => s + Number(e.totals.debit), 0);
  const totalCR = entries.reduce((s: number, e: any) => s + Number(e.totals.credit), 0);

  const inputCls =
    "h-9 px-3 rounded-md border border-border bg-card text-[12.5px] focus:outline-none focus:border-primary";
  const btnCls =
    "h-8 min-w-8 px-2 rounded-md border border-border bg-card text-[12.5px] flex items-center justify-center gap-1 hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-[360px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, description…"
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
        <div className="flex items-center gap-1.5">
          <label className="text-[11.5px] text-faint">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[11.5px] text-faint">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        {(from || to) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="text-[12px] text-faint hover:text-foreground px-2 py-1"
          >
            Reset dates
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-[11.5px] text-faint">
          {isFetching && <Loader2 size={13} className="animate-spin" />}
          <span>
            {total === 0
              ? "0 entries"
              : `${rangeFrom.toLocaleString()}–${rangeTo.toLocaleString()} of ${total.toLocaleString()}`}
          </span>
        </div>
      </div>

      <Card padded={false}>
        <div className={cn("relative", isPlaceholderData && "opacity-60 transition-opacity")}>
          <div
            className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
            style={{ gridTemplateColumns: ".8fr .9fr 2fr 1fr .6fr 1fr 1fr" }}
          >
            <div>Date</div>
            <div>Reference</div>
            <div>Description</div>
            <div>Branch</div>
            <div className="text-right">Lines</div>
            <div className="text-right">Debit</div>
            <div className="text-right">Credit</div>
          </div>

          {isLoading ? (
            <SkeletonRows count={pageSize > 10 ? 10 : pageSize} />
          ) : entries.length === 0 ? (
            <div className="text-center text-faint text-sm py-10">
              {debouncedSearch || from || to ? "No entries match your filters." : "No journal entries yet."}
            </div>
          ) : (
            <>
              {entries.map((e: any) => (
                <div
                  key={e.id}
                  className="grid items-center text-[12.5px] py-2.5 px-5 border-b border-row-divider hover:bg-secondary/30"
                  style={{ gridTemplateColumns: ".8fr .9fr 2fr 1fr .6fr 1fr 1fr" }}
                >
                  <div className="text-muted-foreground">{shortDate(e.entry_date)}</div>
                  <div className="font-mono text-ledger-ref">{e.reference}</div>
                  <div className="text-muted-foreground truncate">{e.description}</div>
                  <div className="text-faint text-[11.5px] truncate">{e.branch?.name ?? "—"}</div>
                  <div className="text-right font-mono">{e.totals.lines}</div>
                  <div className="text-right font-mono text-debit">
                    {e.totals.debit > 0 ? money(e.totals.debit) : ""}
                  </div>
                  <div className="text-right font-mono text-primary">
                    {e.totals.credit > 0 ? money(e.totals.credit) : ""}
                  </div>
                </div>
              ))}
              <div
                className="grid items-center text-[13px] py-3 px-5 bg-secondary/40 font-semibold"
                style={{ gridTemplateColumns: ".8fr .9fr 2fr 1fr .6fr 1fr 1fr" }}
              >
                <div style={{ gridColumn: "span 5" }}>Page totals ({entries.length})</div>
                <div className="text-right font-mono text-debit">{money(totalDR)}</div>
                <div className="text-right font-mono text-primary">{money(totalCR)}</div>
              </div>
            </>
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
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={btnCls} aria-label="Previous page">
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
          style={{ gridTemplateColumns: ".8fr .9fr 2fr 1fr .6fr 1fr 1fr" }}
        >
          {Array.from({ length: 7 }).map((__, j) => (
            <div key={j} className={cn("h-3 rounded bg-muted animate-pulse mr-3", j >= 4 && "ml-auto w-16")} />
          ))}
        </div>
      ))}
    </>
  );
}
