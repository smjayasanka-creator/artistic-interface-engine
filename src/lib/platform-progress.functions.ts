import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cross-tab progress snapshot for the Platform Admin console.
 *
 * Combines three signals per tab:
 *  - `hardening`  — completion counts from `hardening_checklist_item`, split
 *    by the tier the item lives in (tiers are mapped to tabs below).
 *  - `activity`   — recent write activity from `audit_log` and
 *    `domain_event`, filtered by the entity/domain relevant to the tab.
 *  - `contracts`  — presence check for critical database RPCs the app
 *    depends on. Any missing RPC is a red flag that a migration hasn't
 *    landed on this environment yet.
 */

// Map each Platform Admin tab to the hardening tiers, audit entity types,
// and domain-event domains it should reflect. The `*` tab id is the
// aggregate view shown on Overview.
const TAB_SCOPE = {
  overview: {
    tiers: ["t1", "t2", "t3", "t4", "t5", "t6", "t7"],
    entities: null as string[] | null,
    domains: null as string[] | null,
  },
  companies: {
    tiers: ["t3", "t6"],
    entities: ["company", "company_subscription", "staff", "user_roles"],
    domains: ["tenant", "identity"],
  },
  plans: {
    tiers: ["t3"],
    entities: ["subscription_plan", "company_subscription"],
    domains: ["billing"],
  },
  jobs: {
    tiers: ["t1", "t5"],
    entities: ["cron_job", "eod_run"],
    domains: ["scheduler", "eod"],
  },
  processes: {
    tiers: ["t1", "t2"],
    entities: ["loan_application", "loan", "repayment", "journal_entry", "fixed_deposit"],
    domains: ["loan", "repayment", "ledger", "savings"],
  },
  hardening: {
    tiers: ["t1", "t2", "t3", "t4", "t5", "t6", "t7"],
    entities: ["hardening_checklist_item"],
    domains: null,
  },
  architecture: {
    tiers: ["t4", "t5", "t7"],
    entities: null,
    domains: ["ledger", "loan", "savings"],
  },
} as const;

export type ProgressTab = keyof typeof TAB_SCOPE;

// Critical RPCs the app calls. If any of these are missing from the
// database, the corresponding UI paths are broken. Keep in sync with
// src/lib/__tests__/migration-rpc-contract.test.ts.
const CRITICAL_RPCS: { name: string; tab: ProgressTab; purpose: string }[] = [
  { name: "record_repayment", tab: "processes", purpose: "3-pass repayment allocation" },
  {
    name: "disburse_loan_from_application",
    tab: "processes",
    purpose: "Application → loan disbursement",
  },
  { name: "post_manual_journal", tab: "processes", purpose: "Manual journal posting" },
  { name: "compute_trial_balance", tab: "jobs", purpose: "EOD trial balance" },
  { name: "submit_loan_application", tab: "processes", purpose: "Application submit transition" },
  { name: "decide_loan_application", tab: "processes", purpose: "Approve / reject transition" },
  { name: "return_loan_application", tab: "processes", purpose: "Return-for-info transition" },
  { name: "cancel_loan_application", tab: "processes", purpose: "Cancel transition" },
  { name: "record_write_off_recovery", tab: "processes", purpose: "Write-off recovery posting" },
  { name: "has_role", tab: "companies", purpose: "Role check used everywhere" },
  { name: "is_company_admin", tab: "companies", purpose: "Company-scoped admin check" },
  { name: "current_business_date", tab: "jobs", purpose: "EOD business-date resolver" },
  { name: "can_backdate_repayment", tab: "processes", purpose: "Backdating authorization" },
];

type Snapshot = {
  generated_at: string;
  hardening: {
    total: number;
    done: number;
    partial: number;
    missing: number;
    by_tier: Record<string, { done: number; partial: number; missing: number; total: number }>;
    by_tab: Record<ProgressTab, { done: number; total: number }>;
  };
  activity: {
    by_tab: Record<
      ProgressTab,
      Array<{
        id: string;
        source: "audit" | "event";
        at: string;
        actor: string | null;
        summary: string;
      }>
    >;
  };
  contracts: {
    rpcs: Array<{ name: string; tab: ProgressTab; purpose: string; present: boolean }>;
    migrations_applied: number;
    latest_migration: string | null;
  };
};

export const getPlatformProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Snapshot> => {
    const { supabase, userId } = context;

    // Gate: platform admin only. Everything below leaks cross-tenant data.
    const { data: isPa } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "platform_admin",
    });
    if (!isPa) throw new Error("Forbidden: platform admin only");

    // --- Hardening rollup -------------------------------------------------
    const { data: hitems } = await supabase
      .from("hardening_checklist_item")
      .select("item_id, status");

    const HARDENING_TIER_MAP = getHardeningTierMap();
    const by_tier: Snapshot["hardening"]["by_tier"] = {};
    let done = 0,
      partial = 0,
      missing = 0;
    const statuses = new Map<string, string>();
    for (const row of (hitems ?? []) as Array<{ item_id: string; status: string }>) {
      statuses.set(row.item_id, row.status);
    }
    for (const [item_id, tier] of Object.entries(HARDENING_TIER_MAP)) {
      const status = statuses.get(item_id) ?? "missing";
      by_tier[tier] ??= { done: 0, partial: 0, missing: 0, total: 0 };
      by_tier[tier].total += 1;
      if (status === "done") {
        by_tier[tier].done += 1;
        done += 1;
      } else if (status === "partial") {
        by_tier[tier].partial += 1;
        partial += 1;
      } else {
        by_tier[tier].missing += 1;
        missing += 1;
      }
    }

    const by_tab = {} as Snapshot["hardening"]["by_tab"];
    for (const tab of Object.keys(TAB_SCOPE) as ProgressTab[]) {
      const tiers = TAB_SCOPE[tab].tiers;
      let td = 0,
        tt = 0;
      for (const t of tiers) {
        td += by_tier[t]?.done ?? 0;
        tt += by_tier[t]?.total ?? 0;
      }
      by_tab[tab] = { done: td, total: tt };
    }

    // --- Recent activity -------------------------------------------------
    const [{ data: audits }, { data: events }] = await Promise.all([
      supabase
        .from("audit_log")
        .select("id, actor_user_id, actor_role, action, entity_type, entity_id, created_at")
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("domain_event")
        .select("id, actor_user_id, event_type, domain, aggregate_type, aggregate_id, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(80),
    ]);

    const activity_by_tab = {} as Snapshot["activity"]["by_tab"];
    for (const tab of Object.keys(TAB_SCOPE) as ProgressTab[]) activity_by_tab[tab] = [];

    for (const row of (audits ?? []) as Array<Record<string, unknown>>) {
      const entity = String(row.entity_type ?? "");
      const at = String(row.created_at ?? "");
      const actor = (row.actor_role as string) ?? (row.actor_user_id as string) ?? null;
      const summary = `${row.action ?? ""} ${entity}${row.entity_id ? ` #${String(row.entity_id).slice(0, 8)}` : ""}`;
      for (const tab of Object.keys(TAB_SCOPE) as ProgressTab[]) {
        const ents = TAB_SCOPE[tab].entities;
        if (ents === null || ents.includes(entity)) {
          activity_by_tab[tab].push({
            id: String(row.id),
            source: "audit",
            at,
            actor,
            summary: summary.trim(),
          });
        }
      }
    }

    for (const row of (events ?? []) as Array<Record<string, unknown>>) {
      const domain = String(row.domain ?? "");
      const at = String(row.occurred_at ?? "");
      const summary = `${row.event_type ?? ""} ${row.aggregate_type ?? ""}${
        row.aggregate_id ? ` #${String(row.aggregate_id).slice(0, 8)}` : ""
      }`;
      for (const tab of Object.keys(TAB_SCOPE) as ProgressTab[]) {
        const doms = TAB_SCOPE[tab].domains;
        if (doms === null || doms.includes(domain)) {
          activity_by_tab[tab].push({
            id: String(row.id),
            source: "event",
            at,
            actor: (row.actor_user_id as string) ?? null,
            summary: summary.trim(),
          });
        }
      }
    }

    // Trim each tab to the most recent 15 entries by timestamp.
    for (const tab of Object.keys(activity_by_tab) as ProgressTab[]) {
      activity_by_tab[tab].sort((a, b) => (a.at < b.at ? 1 : -1));
      activity_by_tab[tab] = activity_by_tab[tab].slice(0, 15);
    }

    // --- Contract health --------------------------------------------------
    // pg_proc lookup runs as platform admin via a lightweight helper RPC
    // when available; fall back to naming heuristics otherwise. We keep
    // this best-effort — a missing RPC in the list is the actionable signal.
    const rpcs = await Promise.all(
      CRITICAL_RPCS.map(async (r) => {
        const { error } = await (supabase.rpc as (n: string, args?: unknown) => Promise<{ error: { message: string; code?: string } | null }>)(r.name, {});
        const missing =
          !!error &&
          /(pgrst202|could not find|does not exist)/i.test(
            (error.message ?? "") + (error.code ?? ""),
          );
        return { ...r, present: !missing };
      }),
    );

    // Migration count/latest is best-effort from supabase_migrations.schema_migrations
    // via the read_migrations helper if it exists; otherwise leave nulls.
    let migrations_applied = 0;
    let latest_migration: string | null = null;
    try {
      const { data: mig } = await supabase.rpc("read_migrations" as never);
      if (Array.isArray(mig)) {
        migrations_applied = mig.length;
        latest_migration = String(mig[mig.length - 1] ?? "") || null;
      }
    } catch {
      // ignore
    }

    return {
      generated_at: new Date().toISOString(),
      hardening: { total: done + partial + missing, done, partial, missing, by_tier, by_tab },
      activity: { by_tab: activity_by_tab },
      contracts: { rpcs, migrations_applied, latest_migration },
    };
  });

/**
 * Maps every hardening item id to the tier it belongs in. Kept as a
 * function so the map is only built when the server function is invoked.
 * Item ids come from src/components/mzizi/HardeningChecklist.tsx.
 */
function getHardeningTierMap(): Record<string, string> {
  return {
    // Tier 1 — Money & Data Integrity
    "double-entry": "t1",
    "postings-immutable": "t1",
    "row-locks": "t1",
    idempotency: "t1",
    "value-dating": "t1",
    "eod-batch": "t1",
    reconciliation: "t1",
    "gl-close": "t1",
    "fx-rate-history": "t1",
    "lifecycle-atomicity": "t1",
    // Tier 2 — Domain Correctness
    "schedule-calendar": "t2",
    "structured-schedule": "t2",
    "repayment-allocation": "t2",
    "capitalized-charges": "t2",
    "app-transitions": "t2",
    "disbursement-rpc": "t2",
    "repayment-guard": "t2",
    // Tier 3 — Multi-tenancy & Access
    "rls-company-scoped": "t3",
    "no-cross-company-admin": "t3",
    "role-in-separate-table": "t3",
    "delegation-authority": "t3",
    "sod-maker-checker": "t3",
    // Tier 4 — Observability & Audit
    "audit-log": "t4",
    "domain-events": "t4",
    "eod-status-dashboard": "t4",
    "hardening-checklist": "t4",
    // Tier 5 — Operations
    "cron-jobs": "t5",
    "eod-orchestrator": "t5",
    "write-off-recovery": "t5",
    "bank-directory": "t5",
    // Tier 6 — Compliance
    "sanctions-screening": "t6",
    "risk-band-scoring": "t6",
    "kyc-documents": "t6",
    // Tier 7 — Platform
    "platform-admin-console": "t7",
    "subscription-plans": "t7",
    "email-domain": "t7",
    "contract-tests": "t7",
  };
}
