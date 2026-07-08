import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGroups } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { Link } from "@tanstack/react-router";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/groups/")({
  component: Groups,
});

function Groups() {
  const fn = useServerFn(getGroups);
  const { data } = useQuery({ queryKey: ["groups"], queryFn: () => fn() });

  return (
    <div className="grid grid-cols-2 gap-4 animate-fadein">
      {(data ?? []).length === 0 && (
        <Card className="col-span-2 text-center text-muted-foreground py-10">
          No lending groups yet. Groups are created by admins from the Administration screen.
        </Card>
      )}
      {(data ?? []).map((g: any) => (
        <Card key={g.id} className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-2 h-10 rounded-full" style={{ background: g.color ?? "var(--primary)" }} />
            <div className="flex-1">
              <div className="text-base font-semibold">{g.name}</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                Cycle {g.cycle} · {g.members} members · {g.meeting_day ?? "no meeting set"}
              </div>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-status-active-bg text-status-active-fg">PAR 0%</span>
          </div>
          <div className="grid grid-cols-2 gap-4 my-4">
            <div>
              <div className="text-[11px] text-muted-foreground">Outstanding</div>
              <div className="font-mono text-lg font-semibold mt-1">{money(g.outstanding)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Group savings</div>
              <div className="font-mono text-lg font-semibold mt-1">{money(0)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-row-divider">
            <div className="text-[12px] text-muted-foreground">Chair: {g.leader?.full_name ?? "—"}</div>
            <Link to="/collections/new" className="bg-primary text-primary-foreground text-[11.5px] font-semibold px-3 py-1.5 rounded-md hover:bg-primary-hover">
              Record collection
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
