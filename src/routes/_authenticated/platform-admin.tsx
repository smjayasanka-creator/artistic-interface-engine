import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Search } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Kpi } from "@/components/mzizi/Kpi";
import { Badge } from "@/components/mzizi/Badge";
import { Modal } from "@/components/mzizi/Modal";
import { FormGrid, FormField, FormActions, inputCls, selectCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/mzizi.functions";
import {
  getPlatformOverview,
  listSubscriptionPlans,
  upsertCompanySubscription,
  listCronJobs,
  setCronJobActive,
} from "@/lib/platform-admin.functions";
import { HardeningChecklist } from "@/components/mzizi/HardeningChecklist";
import { ArchitectureExplorer } from "@/components/mzizi/ArchitectureExplorer";
import { ServiceBoundaries } from "@/components/mzizi/ServiceBoundaries";
import { ProcessDiagrams } from "@/components/mzizi/ProcessDiagrams";

export const Route = createFileRoute("/_authenticated/platform-admin")({
  component: PlatformAdmin,
});

type Tab = "overview" | "companies" | "plans" | "jobs" | "processes" | "hardening" | "architecture";


const STATUS_TONE: Record<string, string> = {
  trialing: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  past_due: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  canceled: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  paused: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  unassigned: "bg-muted text-muted-foreground border-border",
};

function PlatformAdmin() {
  const sessionFn = useServerFn(getSession);
  const { data: session, isLoading: sessionLoading } = useQuery({ queryKey: ["session"], queryFn: () => sessionFn() });
  const isPlatformAdmin = (session?.roles ?? []).includes("platform_admin");

  const [tab, setTab] = useState<Tab>("overview");

  if (sessionLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!isPlatformAdmin) {
    return (
      <div className="animate-fadein max-w-2xl">
        <Card className="text-center py-12">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <ShieldCheck className="text-muted-foreground" size={22} />
          </div>
          <CardTitle>Platform Admin Control</CardTitle>
          <p className="text-[13px] text-muted-foreground mt-1">
            This console is restricted to platform administrators. Contact the platform owner if you need access.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground font-semibold">Platform Admin</div>
          <div className="text-[18px] font-semibold mt-0.5">Tenant oversight console</div>
        </div>
      </div>


      <div className="flex gap-1 border-b border-border">
        {(
          [
            ["overview", "Overview"],
            ["companies", "Companies"],
            ["plans", "Plans"],
            ["jobs", "Jobs"],
            ["processes", "Processes"],
            ["hardening", "Hardening"],
            ["architecture", "Architecture"],

          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px",
              tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "companies" && <CompaniesTab />}
      {tab === "plans" && <PlansTab />}
      {tab === "jobs" && <JobsTab />}
      {tab === "processes" && <ProcessDiagrams />}
      {tab === "hardening" && <HardeningChecklist />}
      {tab === "architecture" && <ArchitectureView />}

    </div>
  );
}

/* ---------------- Architecture (runtime + service boundaries) ---------------- */

function ArchitectureView() {
  const [mode, setMode] = useState<"runtime" | "services">("runtime");
  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex self-start rounded-lg border border-border bg-card p-0.5">
        {([
          ["runtime", "Runtime map"],
          ["services", "Service boundaries"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={cn(
              "px-3 py-1.5 text-[12.5px] font-medium rounded-md",
              mode === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "runtime" ? <ArchitectureExplorer /> : <ServiceBoundaries />}
    </div>
  );
}


function OverviewTab() {
  const fn = useServerFn(getPlatformOverview);
  const { data, isLoading } = useQuery({ queryKey: ["platform-overview"], queryFn: () => fn() });
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const t = data.totals;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <Kpi label="Monthly recurring revenue" value={money(t.mrr) + " LKR"} delta={`ARR ${money(t.arr)} LKR`} />
        <Kpi label="Companies" value={String(t.companies)} delta={`${t.active} active · ${t.trialing} trialing`} />
        <Kpi label="Portfolio under management" value={money(t.loan_value) + " LKR"} delta={`Deposits ${money(t.fd_value)}`} />
        <Kpi label="Users on platform" value={String(t.staff)} delta={`${t.clients} end-customers`} deltaTone="neutral" />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card>
          <CardTitle>Subscription health</CardTitle>
          <div className="flex flex-col gap-2 mt-2">
            {[
              ["Active", t.active, "bg-emerald-500"],
              ["Trialing", t.trialing, "bg-sky-500"],
              ["Past due", t.past_due, "bg-amber-500"],
            ].map(([label, v, color]) => {
              const pct = t.companies ? Math.round((Number(v) / t.companies) * 100) : 0;
              return (
                <div key={String(label)}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-semibold">{String(v)} · {pct}%</span>
                  </div>
                  <div className="h-2 rounded bg-muted overflow-hidden">
                    <div className={`${color} h-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardTitle>Top companies by MRR</CardTitle>
          <div className="mt-2 divide-y divide-border">
            {[...data.rows].sort((a, b) => b.mrr - a.mrr).slice(0, 6).map((r) => (
              <div key={r.id} className="py-2 flex items-center gap-3 text-[13px]">
                <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center font-semibold">
                  {r.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-[11.5px] text-muted-foreground">{r.plan_name} · {r.country}</div>
                </div>
                <div className="font-mono font-semibold">{money(r.mrr)}</div>
              </div>
            ))}
            {data.rows.length === 0 && <div className="text-[12px] text-muted-foreground py-3">No companies yet.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------------- Companies ---------------- */

function CompaniesTab() {
  const fn = useServerFn(getPlatformOverview);
  const { data, isLoading } = useQuery({ queryKey: ["platform-overview"], queryFn: () => fn() });
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    let r = data?.rows ?? [];
    if (statusFilter !== "all") r = r.filter((x) => x.status === statusFilter);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      r = r.filter((x) => x.name.toLowerCase().includes(s) || (x.country ?? "").toLowerCase().includes(s));
    }
    return r;
  }, [data, q, statusFilter]);

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <>
      <Card padded={false}>
        <div className="p-4 flex items-center gap-3 border-b border-border">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-[12.5px] flex-1 max-w-md">
            <Search size={14} className="text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…" className="bg-transparent outline-none flex-1" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls + " w-40"}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past due</option>
            <option value="paused">Paused</option>
            <option value="canceled">Canceled</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <div className="ml-auto text-[11.5px] text-muted-foreground">{rows.length} companies</div>
        </div>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
          style={{ gridTemplateColumns: "1.6fr 1fr 0.9fr 0.7fr 0.9fr 0.9fr 0.9fr 0.5fr" }}
        >
          <div>Company</div>
          <div>Plan</div>
          <div>Status</div>
          <div className="text-right">MRR</div>
          <div className="text-right">Staff</div>
          <div className="text-right">Customers</div>
          <div className="text-right">Portfolio</div>
          <div></div>
        </div>
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid items-center text-[13px] py-3 px-5 border-b border-row-divider last:border-b-0 hover:bg-muted/40"
            style={{ gridTemplateColumns: "1.6fr 1fr 0.9fr 0.7fr 0.9fr 0.9fr 0.9fr 0.5fr" }}
          >
            <div className="min-w-0">
              <div className="font-semibold truncate">{r.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {r.country ?? "—"} · joined {shortDate(r.created_at)}
              </div>
            </div>
            <div>{r.plan_name}</div>
            <div>
              <span className={cn("text-[10.5px] font-semibold px-2 py-0.5 rounded-full border capitalize", STATUS_TONE[r.status] ?? STATUS_TONE.unassigned)}>
                {r.status.replace("_", " ")}
              </span>
            </div>
            <div className="text-right font-mono">{money(r.mrr)}</div>
            <div className="text-right font-mono">{r.staff_count}</div>
            <div className="text-right font-mono">{r.client_count}</div>
            <div className="text-right font-mono">{money(r.loan_value)}</div>
            <div className="text-right">
              <button onClick={() => setSelected(r.id)} className="text-primary text-[12px] font-semibold hover:underline">
                Manage
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-5 py-8 text-[12.5px] text-muted-foreground text-center">No companies match your filters.</div>
        )}
      </Card>

      {selected && (
        <ManageSubscriptionModal
          company={data.rows.find((r) => r.id === selected)!}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

/* ---------------- Manage subscription modal ---------------- */


function ManageSubscriptionModal({ company, onClose }: { company: any; onClose: () => void }) {
  const qc = useQueryClient();
  const plansFn = useServerFn(listSubscriptionPlans);
  const upsertFn = useServerFn(upsertCompanySubscription);
  const { data: plans } = useQuery({ queryKey: ["subscription-plans"], queryFn: () => plansFn() });

  const [planId, setPlanId] = useState<string>("");
  const [status, setStatus] = useState<"trialing" | "active" | "past_due" | "canceled" | "paused">(
    company.status === "unassigned" ? "trialing" : company.status,
  );
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [seats, setSeats] = useState<number>(5);
  const [mrr, setMrr] = useState<number>(company.mrr || 0);
  const [periodEnd, setPeriodEnd] = useState<string>("");

  const chosenPlan = useMemo(() => (plans ?? []).find((p: any) => p.id === planId), [plans, planId]);

  // preselect current plan by code once plans load
  if (plans && !planId) {
    const p = (plans as any[]).find((p) => p.code === company.plan_code) ?? (plans as any[])[0];
    if (p) {
      setPlanId(p.id);
      setMrr(company.mrr || Number(p.price_monthly));
    }
  }

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          company_id: company.id,
          plan_id: planId,
          status,
          billing_cycle: cycle,
          seats,
          mrr,
          currency: chosenPlan?.currency ?? "LKR",
          current_period_end: periodEnd || null,
        },
      }),
    onSuccess: () => {
      toast.success("Subscription updated");
      qc.invalidateQueries({ queryKey: ["platform-overview"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open onClose={onClose} title={`Manage subscription — ${company.name}`}>
      <FormGrid>
        <FormField label="Plan" required span={6}>
          <select className={selectCls} value={planId} onChange={(e) => {
            setPlanId(e.target.value);
            const p = (plans as any[])?.find((x) => x.id === e.target.value);
            if (p) setMrr(cycle === "monthly" ? Number(p.price_monthly) : Number(p.price_annual) / 12);
          }}>
            {(plans ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name} · {money(p.price_monthly)}/mo</option>
            ))}
          </select>
        </FormField>
        <FormField label="Status" required span={3}>
          <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="trialing">Trialing</option>
            <option value="active">Active</option>
            <option value="past_due">Past due</option>
            <option value="paused">Paused</option>
            <option value="canceled">Canceled</option>
          </select>
        </FormField>
        <FormField label="Billing cycle" required span={3}>
          <select className={selectCls} value={cycle} onChange={(e) => {
            const c = e.target.value as "monthly" | "annual";
            setCycle(c);
            if (chosenPlan) setMrr(c === "monthly" ? Number(chosenPlan.price_monthly) : Number(chosenPlan.price_annual) / 12);
          }}>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </FormField>
        <FormField label="Seats" required span={3}>
          <input type="number" min={0} className={inputCls + " font-mono"} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
        </FormField>
        <FormField label="MRR (LKR)" required span={5}>
          <input type="number" min={0} step="0.01" className={inputCls + " font-mono"} value={mrr} onChange={(e) => setMrr(Number(e.target.value))} />
        </FormField>
        <FormField label="Current period end" span={4}>
          <input type="date" className={inputCls + " font-mono"} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </FormField>
      </FormGrid>
      <FormActions>
        <button className={btnSecondaryCls} onClick={onClose}>Cancel</button>
        <button className={btnPrimaryCls} disabled={save.isPending || !planId} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save subscription"}
        </button>
      </FormActions>
    </Modal>
  );
}

/* ---------------- Plans ---------------- */

function PlansTab() {
  const fn = useServerFn(listSubscriptionPlans);
  const { data } = useQuery({ queryKey: ["subscription-plans"], queryFn: () => fn() });
  return (
    <div className="grid grid-cols-3 gap-4">
      {(data ?? []).map((p: any) => (
        <Card key={p.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">{p.code}</div>
              <div className="text-[16px] font-semibold">{p.name}</div>
            </div>
            {p.active ? (
              <Badge tone="active">Active</Badge>
            ) : (
              <Badge tone="neutral">Inactive</Badge>
            )}
          </div>
          <div>
            <div className="font-mono text-[22px] font-semibold">
              {money(p.price_monthly)} <span className="text-[12px] text-muted-foreground font-normal">{p.currency}/mo</span>
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              or {money(p.price_annual)} {p.currency}/year
            </div>
          </div>
          <ul className="text-[12.5px] text-foreground/85 space-y-1 border-t border-border pt-3">
            {(Array.isArray(p.features) ? p.features : []).map((f: string, i: number) => (
              <li key={i} className="flex gap-2"><span className="text-primary">•</span>{f}</li>
            ))}
          </ul>
          <div className="text-[11.5px] text-muted-foreground border-t border-border pt-2">
            Seat limit: <span className="font-mono">{p.seat_limit ?? "unlimited"}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function JobsTab() {
  const qc = useQueryClient();
  const fn = useServerFn(listCronJobs);
  const toggleFn = useServerFn(setCronJobActive);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["cron-jobs"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });
  const toggle = useMutation({
    mutationFn: (v: { jobid: number; active: boolean }) => toggleFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.active ? "Job resumed" : "Job paused");
      qc.invalidateQueries({ queryKey: ["cron-jobs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update job"),
  });
  const rows = data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold">Scheduled background jobs</div>
          <div className="text-[12px] text-muted-foreground">Live status of every pg_cron job — most recent run per job.</div>
        </div>
        <button onClick={() => refetch()} className={btnSecondaryCls} disabled={isFetching}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <Card padded={false}>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
          style={{ gridTemplateColumns: "1.4fr 0.8fr 0.6fr 1.2fr 0.8fr 1.4fr 0.8fr" }}
        >
          <div>Job</div>
          <div>Schedule</div>
          <div>Active</div>
          <div>Last run</div>
          <div>Status</div>
          <div>Message</div>
          <div className="text-right">Actions</div>
        </div>
        {isLoading && <div className="text-center text-faint text-sm py-8">Loading…</div>}
        {!isLoading && rows.length === 0 && (
          <div className="text-center text-faint text-sm py-8">No scheduled jobs yet.</div>
        )}
        {rows.map((j) => {
          const ok = (j.last_status ?? "").toLowerCase() === "succeeded";
          const failed = (j.last_status ?? "").toLowerCase() === "failed";
          return (
            <div
              key={j.jobid}
              className="grid items-start text-[12.5px] py-2.5 px-5 border-b border-row-divider"
              style={{ gridTemplateColumns: "1.4fr 0.8fr 0.6fr 1.2fr 0.8fr 1.4fr 0.8fr" }}
            >
              <div className="font-medium truncate" title={j.jobname}>{j.jobname}</div>
              <div className="font-mono text-faint">{j.schedule}</div>
              <div>
                <Badge className={j.active ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-muted text-muted-foreground border-border"}>
                  {j.active ? "yes" : "paused"}
                </Badge>
              </div>
              <div className="font-mono text-faint">
                {j.last_start ? new Date(j.last_start).toLocaleString() : "—"}
              </div>
              <div>
                {j.last_status ? (
                  <Badge className={cn(
                    ok && "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
                    failed && "bg-rose-500/10 text-rose-700 border-rose-500/30",
                    !ok && !failed && "bg-amber-500/10 text-amber-700 border-amber-500/30",
                  )}>
                    {j.last_status}
                  </Badge>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </div>
              <div className="font-mono text-[11.5px] text-faint truncate" title={j.last_return_message ?? ""}>
                {j.last_return_message ?? "—"}
              </div>
              <div className="text-right">
                <button
                  className={btnSecondaryCls}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ jobid: j.jobid, active: !j.active })}
                >
                  {j.active ? "Pause" : "Resume"}
                </button>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
