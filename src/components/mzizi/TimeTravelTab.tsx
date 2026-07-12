import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, RotateCcw, FastForward } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { getClientOverride, setClientOverride } from "@/lib/clock";
import { inputCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TimeTravelTab() {
  const qc = useQueryClient();
  const [override, setOverride] = useState<string | null>(getClientOverride());
  const [draft, setDraft] = useState<string>(() => {
    const cur = getClientOverride();
    return toLocalInputValue(cur ? new Date(cur) : new Date());
  });

  useEffect(() => {
    const on = () => setOverride(getClientOverride());
    window.addEventListener("dev-now-change", on);
    return () => window.removeEventListener("dev-now-change", on);
  }, []);

  function apply(iso: string | null) {
    setClientOverride(iso);
    qc.invalidateQueries();
    toast.success(iso ? `Time travelled to ${new Date(iso).toLocaleString()}` : "Reset to real time");
  }

  function jump(days: number) {
    const base = override ? new Date(override) : new Date();
    base.setDate(base.getDate() + days);
    apply(base.toISOString());
    setDraft(toLocalInputValue(base));
  }

  const realNow = new Date();
  const effective = override ? new Date(override) : realNow;
  const diffDays = override
    ? Math.round((effective.getTime() - realNow.getTime()) / 86400000)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
            <Clock size={18} />
          </div>
          <div className="min-w-0">
            <CardTitle>Time travel (testing)</CardTitle>
            <p className="text-[12px] text-muted-foreground -mt-1">
              Overrides "today" for FD maturity, accruals, teller summary, and workflow SLA.
              Audit timestamps (approved_at, closed_at, created_at) always use real time.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Real time</div>
            <div className="font-mono text-[13px] mt-1">{realNow.toLocaleString()}</div>
          </div>
          <div className={`rounded-lg border p-3 ${override ? "border-amber-500/40 bg-amber-500/5" : "border-border"}`}>
            <div className="text-[11px] uppercase tracking-wide flex items-center gap-2">
              <span className={override ? "text-amber-700" : "text-muted-foreground"}>Effective time</span>
              {override && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 font-semibold">
                  {diffDays >= 0 ? "+" : ""}{diffDays}d
                </span>
              )}
            </div>
            <div className="font-mono text-[13px] mt-1">{effective.toLocaleString()}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="text-[12px] font-medium">Set effective date/time</label>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="datetime-local"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className={inputCls + " max-w-[260px]"}
            />
            <button
              className={btnPrimaryCls}
              onClick={() => draft && apply(new Date(draft).toISOString())}
            >
              Apply
            </button>
            <button className={btnSecondaryCls} onClick={() => { apply(null); setDraft(toLocalInputValue(new Date())); }}>
              <RotateCcw size={13} className="inline mr-1" /> Reset
            </button>
          </div>

          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">Quick jumps</div>
            <div className="flex flex-wrap gap-2">
              {[1, 7, 30, 90, 180, 365].map((d) => (
                <button key={d} onClick={() => jump(d)} className={btnSecondaryCls + " text-[12px]"}>
                  <FastForward size={12} className="inline mr-1" /> +{d}d
                </button>
              ))}
              {[-1, -7, -30].map((d) => (
                <button key={d} onClick={() => jump(d)} className={btnSecondaryCls + " text-[12px]"}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>How it works</CardTitle>
        <ul className="text-[12.5px] text-muted-foreground space-y-1.5 list-disc pl-5">
          <li>The override is stored in your browser's localStorage under <code className="font-mono text-[11.5px]">dev:now</code>.</li>
          <li>Every server function call sends it as an <code className="font-mono text-[11.5px]">x-dev-now</code> header.</li>
          <li>Server code that reads "today" (via <code className="font-mono text-[11.5px]">serverNow()</code>) honors it.</li>
          <li>Writes that record audit trails still use real wall-clock time — so nothing in the database is silently backdated.</li>
          <li>Only affects your own browser session. Reset before signing off.</li>
        </ul>
      </Card>
    </div>
  );
}
