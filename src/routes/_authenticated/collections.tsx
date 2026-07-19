import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCollections } from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Avatar } from "@/components/mzizi/Avatar";
import { money, relTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/collections")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["collections"],
      queryFn: () => getCollections(),
    }),
  component: Collections,
});

function Collections() {
  const fn = useServerFn(getCollections);
  const { data } = useQuery({ queryKey: ["collections"], queryFn: () => fn() });
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const pct = Math.min(100, (data.totalToday / data.target) * 100);

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div
        className="rounded-2xl p-7 text-white"
        style={{ background: "linear-gradient(135deg,#0c1f24,#0f3a35)" }}
      >
        <div className="text-xs uppercase tracking-wider opacity-70">Collected today</div>
        <div className="font-mono text-4xl font-bold mt-2">{money(data.totalToday)}</div>
        <div className="text-sm opacity-80 mt-1">of {money(data.target)} branch target</div>
        <div
          className="h-2 rounded-full mt-4 overflow-hidden"
          style={{ background: "rgba(255,255,255,.12)" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "#4ade80" }}
          />
        </div>
        <Link
          to="/collections/new"
          className="inline-block mt-5 bg-primary-glow text-[#06131a] font-semibold text-sm px-4 py-2 rounded-md hover:brightness-95"
        >
          + Record repayment
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardTitle>Group collections due</CardTitle>
          {data.groups.length === 0 && (
            <div className="text-sm text-muted-foreground py-4">No group meetings today.</div>
          )}
          {data.groups.map((g: any) => (
            <div
              key={g.id}
              className="flex items-center gap-3 py-3 border-t border-row-divider first:border-t-0"
            >
              <div
                className="w-1.5 h-10 rounded-full"
                style={{ background: g.color ?? "var(--primary)" }}
              />
              <div className="flex-1">
                <div className="text-sm font-semibold">{g.name}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {g.meeting_place} · {g.meeting_day}
                </div>
              </div>
              <div className="font-mono text-sm font-semibold text-primary">
                {money(g.target_today)}
              </div>
            </div>
          ))}
        </Card>

        <Card>
          <CardTitle>Recorded today</CardTitle>
          {data.recorded.length === 0 && (
            <div className="text-sm text-muted-foreground py-4">
              No repayments recorded yet today.
            </div>
          )}
          {data.recorded.map((r: any) => (
            <div
              key={r.id}
              className="flex items-center gap-3 py-2.5 border-t border-row-divider first:border-t-0"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-primary"
                style={{ background: "var(--teal-tint)" }}
              >
                ↓
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{r.loan?.client?.full_name}</div>
                <div className="text-[11px] text-faint">
                  {r.channel} · {relTime(r.received_at)}
                </div>
              </div>
              <div className="font-mono font-semibold text-primary text-sm">+{money(r.amount)}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
