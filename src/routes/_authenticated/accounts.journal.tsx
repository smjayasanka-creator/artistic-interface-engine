import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { getJournalEntries } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { money, shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/accounts/journal")({
  component: JournalEntriesPage,
});

function JournalEntriesPage() {
  const fn = useServerFn(getJournalEntries);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["journal-entries", from, to],
    queryFn: () => fn({ data: { from: from || undefined, to: to || undefined } }),
  });

  // Client-side search filter (fast, no roundtrip on every keystroke).
  const entries = useMemo(() => {
    const list = data?.entries ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (e: any) =>
        (e.reference ?? "").toLowerCase().includes(s) ||
        (e.description ?? "").toLowerCase().includes(s) ||
        (e.branch?.name ?? "").toLowerCase().includes(s),
    );
  }, [data, search]);

  const totalDR = entries.reduce((s: number, e: any) => s + Number(e.totals.debit), 0);
  const totalCR = entries.reduce((s: number, e: any) => s + Number(e.totals.credit), 0);

  const inputCls =
    "h-9 px-3 rounded-md border border-border bg-card text-[12.5px] focus:outline-none focus:border-primary";

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-[360px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, description, branch…"
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
        <div className="ml-auto text-[11.5px] text-faint">
          {isFetching ? "Loading…" : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        </div>
      </div>

      <Card padded={false}>
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
        {entries.length === 0 && !isFetching && (
          <div className="text-center text-faint text-sm py-8">
            {data?.entries?.length ? "No entries match your filters." : "No journal entries yet."}
          </div>
        )}
        {entries.length > 0 && (
          <div
            className="grid items-center text-[13px] py-3 px-5 bg-secondary/40 font-semibold"
            style={{ gridTemplateColumns: ".8fr .9fr 2fr 1fr .6fr 1fr 1fr" }}
          >
            <div className="col-span-5" style={{ gridColumn: "span 5" }}>
              Totals ({entries.length})
            </div>
            <div className="text-right font-mono text-debit">{money(totalDR)}</div>
            <div className="text-right font-mono text-primary">{money(totalCR)}</div>
          </div>
        )}
      </Card>
    </div>
  );
}
