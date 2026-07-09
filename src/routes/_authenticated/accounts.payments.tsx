import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPayments } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { money, shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/accounts/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const fn = useServerFn(getPayments);
  const { data } = useQuery({ queryKey: ["payments"], queryFn: () => fn() });
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="text-[12px] text-faint">
          <span className="font-semibold text-foreground">{data.payments.length}</span> payments · Total{" "}
          <span className="font-semibold text-primary font-mono">{money(data.total)}</span>
        </div>
      </div>
      <Card padded={false}>
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
        {data.payments.map((p: any) => (
          <div
            key={p.id}
            className="grid items-center text-[12.5px] py-2.5 px-5 border-b border-row-divider"
            style={{ gridTemplateColumns: "1fr 1.6fr .9fr .8fr 1fr 1fr" }}
          >
            <div className="text-muted-foreground">{shortDate(p.received_at)}</div>
            <div className="truncate">{p.loan?.client?.full_name ?? "—"}</div>
            <div className="font-mono text-[11.5px] text-faint truncate">{p.loan?.id?.slice(0, 8) ?? "—"}</div>
            <div className="capitalize text-muted-foreground">{p.channel ?? "—"}</div>
            <div className="text-muted-foreground truncate">{p.received_by_staff?.full_name ?? "—"}</div>
            <div className="text-right font-mono text-primary">{money(Number(p.amount))}</div>
          </div>
        ))}
        {data.payments.length === 0 && (
          <div className="text-center text-faint text-sm py-8">No payments recorded yet.</div>
        )}
      </Card>
    </div>
  );
}
