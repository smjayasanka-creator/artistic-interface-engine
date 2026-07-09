import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { getLoans } from "@/lib/mzizi.functions";
import { Avatar } from "@/components/mzizi/Avatar";
import { money, shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/loans/")({
  component: LoansList,
});

function LoansList() {
  const fn = useServerFn(getLoans);
  const { data } = useQuery({ queryKey: ["loans"], queryFn: () => fn() });

  return (
    <div className="animate-fadein">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid gap-4 text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
             style={{ gridTemplateColumns: "1.7fr 1.4fr 1fr 1fr 1.4fr 1fr" }}>
          <div>Borrower</div><div>Product</div><div>Principal</div><div>Outstanding</div><div>Repaid</div><div>Next due</div>
        </div>
        {(data ?? []).map((l: any) => (
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
        {(data ?? []).length === 0 && <div className="text-center text-faint text-sm py-10">No disbursed loans yet.</div>}
      </div>
    </div>
  );
}
