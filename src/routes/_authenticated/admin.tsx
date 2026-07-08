import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdmin } from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Avatar } from "@/components/mzizi/Avatar";
import { Badge } from "@/components/mzizi/Badge";
import { money, shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
});

function Admin() {
  const fn = useServerFn(getAdmin);
  const { data } = useQuery({ queryKey: ["admin"], queryFn: () => fn() });
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <Card>
        <CardTitle>Branch summary</CardTitle>
        <div className="grid grid-cols-6 gap-4 text-[13px]">
          {[
            ["Code", data.branch?.code ?? "—"],
            ["Region", data.branch?.region ?? "—"],
            ["Staff", String(data.staff.length)],
            ["Active clients", String(data.activeClients)],
            ["Portfolio", money(data.portfolio)],
            ["Opened", shortDate(data.branch?.opened_on)],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{k}</div>
              <div className="font-mono font-semibold mt-1">{v}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card padded={false}>
        <div className="px-5 pt-4 pb-3 text-sm font-semibold">Staff</div>
        <div className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-y border-border bg-secondary/40"
             style={{ gridTemplateColumns: "2fr 1.2fr 1.5fr .8fr" }}>
          <div>Name</div><div>Role</div><div>Email</div><div>Status</div>
        </div>
        {data.staff.map((s: any) => (
          <div key={s.id} className="grid items-center text-[13px] py-3 px-5 border-b border-row-divider last:border-b-0"
               style={{ gridTemplateColumns: "2fr 1.2fr 1.5fr .8fr" }}>
            <div className="flex items-center gap-2.5 font-semibold"><Avatar name={s.full_name} />{s.full_name}</div>
            <div className="capitalize text-secondary-foreground">{(s.role ?? "").replace("_", " ")}</div>
            <div className="text-muted-foreground truncate">{s.email ?? "—"}</div>
            <div><Badge tone={s.is_active ? "active" : "neutral"}>{s.is_active ? "Active" : "Inactive"}</Badge></div>
          </div>
        ))}
      </Card>
    </div>
  );
}
