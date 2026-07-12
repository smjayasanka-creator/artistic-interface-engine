import { useMemo, useState } from "react";
import { Download, ShieldAlert, ShieldCheck, RotateCcw, Loader2, Sparkles, Zap, ChevronDown, ChevronRight, Code2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { ProgressBar } from "@/components/mzizi/ProgressBar";
import { cn } from "@/lib/utils";
import {
  listHardeningItems,
  upsertHardeningItem,
  resetHardeningItems,
  runHardeningAutocheck,
  type AutoCheckResult,
} from "@/lib/hardening.functions";

type Status = "done" | "partial" | "missing";

type Item = { id: string; label: string; hint?: string };
type Tier = { id: string; name: string; blurb: string; blocker?: boolean; items: Item[] };

const TIERS: Tier[] = [
  {
    id: "t1",
    name: "Tier 1 — Money & Data Integrity",
    blurb: "Non-negotiable. Any gap here blocks handling real customer money at scale.",
    blocker: true,
    items: [
      { id: "double-entry", label: "Double-entry ledger enforced by trigger (debits = credits)" },
      { id: "postings-immutable", label: "Postings are append-only; corrections via reversal entries" },
      { id: "row-locks", label: "Row-level locks (SELECT … FOR UPDATE) on money-moving paths" },
      { id: "idempotency", label: "Idempotency keys on repayment, disbursement, FD payout" },
      { id: "value-dating", label: "Value-dating + effective date separate from booking date" },
      { id: "eod-batch", label: "End-of-day batch: accrual, GL close, reconciliation" },
      { id: "reconciliation", label: "Automated bank / cash / suspense reconciliation" },
      { id: "money-type", label: "Monetary amounts stored as NUMERIC (never float)" },
      { id: "fx-policy", label: "FX conversion policy + rate table with history" },
    ],
  },
  {
    id: "t2",
    name: "Tier 2 — Audit, Compliance & Controls",
    blurb: "Required for regulated finance operations (CBSL, AML/KYC, IFRS 9).",
    items: [
      { id: "audit-log", label: "Append-only audit_log with triggers on sensitive tables" },
      { id: "maker-checker", label: "Maker–checker workflow on high-risk actions" },
      { id: "sod", label: "Segregation of duties enforced by role matrix" },
      { id: "retention", label: "7–10 year retention policy on ledger + audit" },
      { id: "kyc-aml", label: "KYC / AML screening + sanctions list checks" },
      { id: "crib", label: "CRIB reporting integration" },
      { id: "wht-ifrs9", label: "WHT + IFRS 9 provisioning logic" },
      { id: "pii-masking", label: "PII masking in logs and non-prod environments" },
    ],
  },
  {
    id: "t3",
    name: "Tier 3 — Security",
    blurb: "Baseline security posture for a licensed financial institution.",
    items: [
      { id: "mfa", label: "MFA enforced for all staff logins" },
      { id: "hibp", label: "Password checked against HIBP / breach corpus" },
      { id: "rls", label: "RLS enabled on every public table + policy tests" },
      { id: "encrypted-pii", label: "PII encrypted at rest (application-layer or pgcrypto)" },
      { id: "hsm", label: "Keys managed in HSM / KMS (no plaintext secrets)" },
      { id: "pentest", label: "External penetration test — annual" },
      { id: "soc2", label: "SOC 2 / ISO 27001 controls documented" },
      { id: "vuln-scan", label: "Dependency + container vulnerability scanning" },
    ],
  },
  {
    id: "t4",
    name: "Tier 4 — Performance & Scale",
    blurb: "Needed once portfolio grows past ~50k accounts or 10k daily postings.",
    items: [
      { id: "partitioning", label: "Time-based partitioning on posting / fd_accrual" },
      { id: "indexes", label: "Index audit on hot paths (loan_id, client_id, value_date)" },
      { id: "read-replicas", label: "Read replicas for reporting workloads" },
      { id: "pgbouncer", label: "Connection pooling (pgbouncer) sized for peak" },
      { id: "job-queue", label: "Job queue for batch (pg_cron or worker service)" },
      { id: "cache", label: "Cache layer for reference data (products, rates)" },
    ],
  },
  {
    id: "t5",
    name: "Tier 5 — Availability & DR",
    blurb: "Business continuity + regulator-mandated recovery objectives.",
    items: [
      { id: "pitr", label: "Point-in-time recovery (PITR) enabled + tested" },
      { id: "backup-drill", label: "Backup restore drill — quarterly, documented" },
      { id: "multi-region", label: "Multi-region failover with defined RPO/RTO" },
      { id: "runbooks", label: "Incident runbooks + on-call rotation" },
      { id: "status-page", label: "Public status page + customer comms plan" },
    ],
  },
  {
    id: "t6",
    name: "Tier 6 — Integrations",
    blurb: "External rails the core needs to interoperate with.",
    items: [
      { id: "slips-cefts", label: "SLIPS / CEFTS payment rails" },
      { id: "sms-email", label: "Transactional SMS + email provider (with retries)" },
      { id: "cheque", label: "Cheque printing / MICR integration" },
      { id: "card-switch", label: "Card switch / ATM network" },
      { id: "mobile", label: "Mobile / internet banking channel" },
      { id: "core-seam", label: "Integration seam to swap in a licensed core (Temenos/Mambu/Fern)" },
    ],
  },
];

type Entry = { status: Status; owner?: string | null; note?: string | null; updated_at?: string };
type State = Record<string, Entry>;

const STATUS_META: Record<Status, { label: string; tone: string; dot: string }> = {
  done: { label: "Done", tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", dot: "bg-emerald-500" },
  partial: { label: "Partial", tone: "bg-amber-500/10 text-amber-700 border-amber-500/30", dot: "bg-amber-500" },
  missing: { label: "Missing", tone: "bg-rose-500/10 text-rose-700 border-rose-500/30", dot: "bg-rose-500" },
};

function scoreTier(tier: Tier, state: State) {
  const total = tier.items.length;
  let pts = 0;
  let blockers = 0;
  for (const it of tier.items) {
    const s = state[it.id]?.status ?? "missing";
    if (s === "done") pts += 1;
    else if (s === "partial") pts += 0.5;
    if (tier.blocker && s !== "done") blockers += 1;
  }
  return { pct: Math.round((pts / total) * 100), blockers };
}

const hardeningQueryOptions = queryOptions({
  queryKey: ["hardening-checklist"],
  queryFn: () => listHardeningItems(),
});

export function HardeningChecklist() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listHardeningItems);
  const upsertFn = useServerFn(upsertHardeningItem);
  const resetFn = useServerFn(resetHardeningItems);
  const autocheckFn = useServerFn(runHardeningAutocheck);
  const [autoResults, setAutoResults] = useState<AutoCheckResult[] | null>(null);
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);

  const autocheckMutation = useMutation({
    mutationFn: (apply: boolean) => autocheckFn({ data: { apply } }),
    onSuccess: (results) => {
      setAutoResults(results as AutoCheckResult[]);
      queryClient.invalidateQueries({ queryKey: ["hardening-checklist"] });
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["hardening-checklist"],
    queryFn: () => listFn(),
  });

  const state: State = useMemo(() => {
    const s: State = {};
    for (const r of rows as any[]) {
      s[r.item_id] = { status: r.status, owner: r.owner, note: r.note, updated_at: r.updated_at };
    }
    return s;
  }, [rows]);

  const autoById = useMemo(() => {
    const m = new Map<string, AutoCheckResult>();
    for (const r of autoResults ?? []) m.set(r.item_id, r);
    return m;
  }, [autoResults]);


  const upsertMutation = useMutation({
    mutationFn: (vars: { item_id: string; patch: Partial<Entry> }) =>
      upsertFn({
        data: {
          item_id: vars.item_id,
          status: vars.patch.status,
          owner: vars.patch.owner ?? undefined,
          note: vars.patch.note ?? undefined,
        },
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["hardening-checklist"] });
      const prev = queryClient.getQueryData<any[]>(["hardening-checklist"]) ?? [];
      const existing = prev.find((r: any) => r.item_id === vars.item_id);
      const merged = { item_id: vars.item_id, status: "missing", ...(existing ?? {}), ...vars.patch };
      const next = existing
        ? prev.map((r: any) => (r.item_id === vars.item_id ? merged : r))
        : [...prev, merged];
      queryClient.setQueryData(["hardening-checklist"], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["hardening-checklist"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["hardening-checklist"] }),
  });

  const resetMutation = useMutation({
    mutationFn: () => resetFn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hardening-checklist"] }),
  });

  const update = (id: string, patch: Partial<Entry>) => {
    upsertMutation.mutate({ item_id: id, patch });
  };

  const overall = useMemo(() => {
    const all = TIERS.flatMap((t) => t.items);
    const done = all.filter((i) => state[i.id]?.status === "done").length;
    const partial = all.filter((i) => state[i.id]?.status === "partial").length;
    const pts = done + partial * 0.5;
    return {
      pct: Math.round((pts / all.length) * 100),
      done,
      partial,
      missing: all.length - done - partial,
      total: all.length,
    };
  }, [state]);

  const tier1Blockers = useMemo(() => scoreTier(TIERS[0], state).blockers, [state]);

  const exportJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      overall,
      tiers: TIERS.map((t) => ({
        id: t.id,
        name: t.name,
        items: t.items.map((it) => ({
          id: it.id,
          label: it.label,
          ...(state[it.id] ?? { status: "missing" as Status }),
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hardening-checklist-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    if (confirm("Reset all checklist items to Missing? This affects all platform admins.")) {
      resetMutation.mutate();
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Overall readiness</div>
          <div className="text-[24px] font-semibold font-mono mt-1">{overall.pct}%</div>
          <div className="mt-2"><ProgressBar value={overall.pct} /></div>
          <div className="text-[11.5px] text-muted-foreground mt-2">
            {overall.done} done · {overall.partial} partial · {overall.missing} missing
          </div>
        </Card>
        <Card>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Tier 1 blockers</div>
          <div className={cn("text-[24px] font-semibold font-mono mt-1", tier1Blockers > 0 ? "text-rose-600" : "text-emerald-600")}>
            {tier1Blockers}
          </div>
          <div className="text-[11.5px] text-muted-foreground mt-2">
            {tier1Blockers > 0 ? "Not production-ready for real money" : "Money-integrity baseline met"}
          </div>
        </Card>
        <Card>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Items tracked</div>
          <div className="text-[24px] font-semibold font-mono mt-1">{overall.total}</div>
          <div className="text-[11.5px] text-muted-foreground mt-2">across {TIERS.length} tiers · shared</div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Actions</div>
          <div className="flex flex-col gap-1.5 mt-2">
            <button
              onClick={() => autocheckMutation.mutate(true)}
              disabled={autocheckMutation.isPending}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-primary/40 bg-primary/10 text-primary text-[12.5px] font-semibold hover:bg-primary/15 disabled:opacity-50"
              title="Inspect the database and auto-mark detectable items"
            >
              {autocheckMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              {autocheckMutation.isPending ? "Checking…" : "Run auto-check"}
            </button>
            <div className="flex gap-1.5">
              <button
                onClick={exportJson}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-[11.5px] font-medium hover:bg-muted"
              >
                <Download size={12} /> Export
              </button>
              <button
                onClick={resetAll}
                disabled={resetMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-[11.5px] font-medium hover:bg-muted disabled:opacity-50"
                title="Reset all (shared)"
              >
                {resetMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              </button>
            </div>
          </div>
        </Card>
      </div>

      {autoResults && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <Sparkles size={18} className="text-primary mt-0.5" />
          <div className="text-[13px] flex-1">
            <div className="font-semibold">Auto-check applied</div>
            <div className="text-muted-foreground">
              Inspected {autoResults.length} items from the live database. Detected:{" "}
              <span className="text-emerald-700 font-semibold">{autoResults.filter((r) => r.status === "done").length} done</span>,{" "}
              <span className="text-amber-700 font-semibold">{autoResults.filter((r) => r.status === "partial").length} partial</span>,{" "}
              <span className="text-rose-700 font-semibold">{autoResults.filter((r) => r.status === "missing").length} missing</span>.
              Non-checkable items (policy, operational, physical) still need manual review.
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Loading shared checklist…
        </div>
      )}

      {tier1Blockers > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3">
          <ShieldAlert size={18} className="text-rose-600 mt-0.5" />
          <div className="text-[13px]">
            <div className="font-semibold text-rose-700">Not ready for production financial workloads</div>
            <div className="text-muted-foreground">
              {tier1Blockers} Tier 1 item(s) are not fully done. Money-integrity gaps must be closed before this system can be the ledger of record.
            </div>
          </div>
        </div>
      )}
      {tier1Blockers === 0 && overall.pct >= 80 && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <ShieldCheck size={18} className="text-emerald-600 mt-0.5" />
          <div className="text-[13px]">
            <div className="font-semibold text-emerald-700">Strong hardening posture</div>
            <div className="text-muted-foreground">Tier 1 met and overall score above 80%. Continue quarterly review.</div>
          </div>
        </div>
      )}

      {TIERS.map((tier) => {
        const s = scoreTier(tier, state);
        return (
          <Card key={tier.id} padded={false}>
            <div className="px-5 py-4 border-b border-border">
              <CardTitle
                subtitle={tier.blurb}
                right={
                  <div className="flex items-center gap-3 min-w-[220px]">
                    <div className="flex-1"><ProgressBar value={s.pct} /></div>
                    <div className="text-[12px] font-mono font-semibold w-10 text-right">{s.pct}%</div>
                  </div>
                }
              >
                <span className="flex items-center gap-2">
                  {tier.name}
                  {tier.blocker && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 border border-rose-500/30 uppercase tracking-wider">
                      Blocker
                    </span>
                  )}
                </span>
              </CardTitle>
            </div>
            <div>
              {tier.items.map((it) => {
                const entry = state[it.id] ?? { status: "missing" as Status };
                const auto = autoById.get(it.id);
                const isOpen = openEvidence === it.id;
                return (
                  <div key={it.id} className="border-b border-row-divider last:border-b-0">
                  <div
                    className="grid items-center gap-3 px-5 py-3"
                    style={{ gridTemplateColumns: "1.6fr 0.9fr 1fr 1.5fr" }}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span className={cn("mt-1.5 w-1.5 h-1.5 rounded-full flex-none", STATUS_META[entry.status].dot)} />
                      <div className="min-w-0">
                        <div className="text-[13px] leading-snug flex items-center gap-1.5 flex-wrap">
                          {it.label}
                          {(entry.note ?? "").startsWith("auto:") && (
                            <span className="inline-flex items-center gap-0.5 text-[9.5px] font-semibold px-1 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 uppercase tracking-wider">
                              <Zap size={8} /> auto
                            </span>
                          )}
                          {auto && (
                            <button
                              onClick={() => setOpenEvidence(isOpen ? null : it.id)}
                              className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-border bg-card text-muted-foreground hover:bg-muted"
                              title="Show SQL check + matching rows"
                            >
                              {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                              <Code2 size={10} /> evidence ({auto.matches.length})
                            </button>
                          )}
                        </div>
                        {(entry.note ?? "").startsWith("auto:") && (
                          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                            {(entry.note ?? "").replace(/^auto:\s*/, "")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {(["done", "partial", "missing"] as Status[]).map((st) => (
                        <button
                          key={st}
                          onClick={() => update(it.id, { status: st })}
                          className={cn(
                            "px-2.5 py-1 rounded-md border text-[11px] font-semibold capitalize",
                            entry.status === st
                              ? STATUS_META[st].tone
                              : "bg-card text-muted-foreground border-border hover:bg-muted",
                          )}
                        >
                          {STATUS_META[st].label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="Owner"
                      defaultValue={entry.owner ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== (entry.owner ?? "")) update(it.id, { owner: v });
                      }}
                      className="px-2.5 py-1.5 rounded-md border border-border bg-card text-[12px] outline-none focus:border-primary"
                    />
                    <input
                      type="text"
                      placeholder="Notes / evidence link"
                      defaultValue={entry.note ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== (entry.note ?? "")) update(it.id, { note: v });
                      }}
                      className="px-2.5 py-1.5 rounded-md border border-border bg-card text-[12px] outline-none focus:border-primary"
                    />
                  </div>
                  {isOpen && auto && (
                    <div className="px-5 pb-4 pt-1 bg-muted/30 border-t border-row-divider">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Check SQL</div>
                      <pre className="text-[11px] font-mono bg-card border border-border rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap">{auto.check_sql.trim()}</pre>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-3 mb-1">
                        Matching rows ({auto.matches.length})
                      </div>
                      {auto.matches.length === 0 ? (
                        <div className="text-[12px] text-muted-foreground italic px-2 py-1.5">No rows matched — nothing detected in the database.</div>
                      ) : (
                        <div className="overflow-x-auto border border-border rounded-md bg-card">
                          <table className="w-full text-[11.5px]">
                            <thead className="bg-muted/50">
                              <tr>
                                {Object.keys(auto.matches[0]).map((k) => (
                                  <th key={k} className="text-left font-semibold px-2.5 py-1.5 border-b border-border">{k}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {auto.matches.map((row, i) => (
                                <tr key={i} className="border-b border-row-divider last:border-b-0">
                                  {Object.keys(auto.matches[0]).map((k) => (
                                    <td key={k} className="px-2.5 py-1.5 font-mono text-[11px] align-top">
                                      {row[k] === null || row[k] === undefined ? <span className="text-muted-foreground">null</span> : String(row[k])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      <div className="text-[11.5px] text-muted-foreground">
        Checklist state is stored in the shared database — all platform admins see and edit the same board. Owner/notes save on blur.
      </div>
    </div>
  );
}

// Keep exported query options for optional loader priming.
export { hardeningQueryOptions };
