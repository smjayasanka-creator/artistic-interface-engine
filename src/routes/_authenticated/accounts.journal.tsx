import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getJournalEntries } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { money, shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/accounts/journal")({
  component: JournalEntriesPage,
});

function JournalEntriesPage() {
  const fn = useServerFn(getJournalEntries);
  const { data } = useQuery({ queryKey: ["journal-entries"], queryFn: () => fn() });
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Card padded={false}>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
          style={{ gridTemplateColumns: ".8fr .9fr 2fr 1fr .8fr 1fr 1fr" }}
        >
          <div>Date</div>
          <div>Reference</div>
          <div>Description</div>
          <div>Branch</div>
          <div className="text-right">Lines</div>
          <div className="text-right">Debit</div>
          <div className="text-right">Credit</div>
        </div>
        {data.entries.map((e: any) => (
          <div
            key={e.id}
            className="grid items-center text-[12.5px] py-2.5 px-5 border-b border-row-divider"
            style={{ gridTemplateColumns: ".8fr .9fr 2fr 1fr .8fr 1fr 1fr" }}
          >
            <div className="text-muted-foreground">{shortDate(e.entry_date)}</div>
            <div className="font-mono text-ledger-ref">{e.reference}</div>
            <div className="text-muted-foreground truncate">{e.description}</div>
            <div className="text-faint text-[11.5px]">{e.branch?.name ?? "—"}</div>
            <div className="text-right font-mono">{e.totals.lines}</div>
            <div className="text-right font-mono text-debit">{money(e.totals.debit)}</div>
            <div className="text-right font-mono text-primary">{money(e.totals.credit)}</div>
          </div>
        ))}
        {data.entries.length === 0 && (
          <div className="text-center text-faint text-sm py-8">No journal entries yet.</div>
        )}
      </Card>
    </div>
  );
}
