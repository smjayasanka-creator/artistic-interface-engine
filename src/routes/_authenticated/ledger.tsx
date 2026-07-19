import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getLedger } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ledger")({
  component: Ledger,
});

function Ledger() {
  const [account, setAccount] = useState<string>("");
  const fn = useServerFn(getLedger);
  const { data } = useQuery({
    queryKey: ["ledger", account],
    queryFn: () => fn({ data: { account: account || undefined } }),
  });
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const totalDR = data.rows.reduce((s: number, r: any) => s + Number(r.debit), 0);
  const totalCR = data.rows.reduce((s: number, r: any) => s + Number(r.credit), 0);

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setAccount("")}
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-md border",
            !account
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border",
          )}
        >
          All accounts
        </button>
        {data.accounts.map((a: any) => (
          <button
            key={a.id}
            onClick={() => setAccount(a.id)}
            className={cn(
              "text-xs font-medium px-3 py-1.5 rounded-md border",
              account === a.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:border-border-strong",
            )}
          >
            <span className="font-mono opacity-70 mr-1">{a.code}</span>
            {a.name}
          </button>
        ))}
      </div>
      <Card padded={false}>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
          style={{ gridTemplateColumns: ".9fr .9fr 1.5fr 2fr 1fr 1fr" }}
        >
          <div>Date</div>
          <div>Ref</div>
          <div>Account</div>
          <div>Description</div>
          <div className="text-right">Debit</div>
          <div className="text-right">Credit</div>
        </div>
        {data.rows.map((r: any) => (
          <div
            key={r.id}
            className="grid items-center text-[12.5px] py-2.5 px-5 border-b border-row-divider"
            style={{ gridTemplateColumns: ".9fr .9fr 1.5fr 2fr 1fr 1fr" }}
          >
            <div className="text-muted-foreground">{shortDate(r.entry?.entry_date)}</div>
            <div className="font-mono text-ledger-ref">{r.entry?.reference}</div>
            <div>
              <span className="font-mono text-faint mr-1.5">{r.account?.code}</span>
              {r.account?.name}
            </div>
            <div className="text-muted-foreground truncate">{r.entry?.description}</div>
            <div className="text-right font-mono text-debit">
              {Number(r.debit) > 0 ? money(Number(r.debit)) : ""}
            </div>
            <div className="text-right font-mono text-primary">
              {Number(r.credit) > 0 ? money(Number(r.credit)) : ""}
            </div>
          </div>
        ))}
        {data.rows.length === 0 && (
          <div className="text-center text-faint text-sm py-8">
            No entries. Approve a loan or record a repayment to see postings.
          </div>
        )}
        {data.rows.length > 0 && (
          <div
            className="grid items-center text-[13px] py-3 px-5 bg-secondary/40 font-semibold"
            style={{ gridTemplateColumns: ".9fr .9fr 1.5fr 2fr 1fr 1fr" }}
          >
            <div className="col-span-4">Totals ({data.rows.length} lines)</div>
            <div className="text-right font-mono text-debit">{money(totalDR)}</div>
            <div className="text-right font-mono text-primary">{money(totalCR)}</div>
          </div>
        )}
      </Card>
    </div>
  );
}
