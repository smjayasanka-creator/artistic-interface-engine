import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Badge } from "@/components/mzizi/Badge";
import {
  Monitor,
  Server,
  Database,
  Cloud,
  Workflow,
  KeyRound,
  Radio,
  Timer,
  ShieldCheck,
  Boxes,
  Plug,
  Brain,
} from "lucide-react";

type Layer = "client" | "edge" | "cloud" | "external";

type Node = {
  id: string;
  label: string;
  layer: Layer;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tag: string;
  summary: string;
  responsibilities: string[];
  reads: string[]; // node ids this node reads from
  writes: string[]; // node ids this node writes/calls
  files?: string[];
};

const NODES: Node[] = [
  {
    id: "ui",
    label: "React UI",
    layer: "client",
    icon: Monitor,
    tag: "TanStack Router · React 19",
    summary:
      "Every screen the operator sees — dashboard, clients, loans, savings, FD, ALCO, accounts, transactions, admin.",
    responsibilities: [
      "File-based routes under src/routes/_authenticated/*",
      "Shared shell (sidebar, header, breadcrumbs) via AppShell",
      "Form validation + optimistic UI with TanStack Query",
    ],
    reads: ["rq", "sbc"],
    writes: ["sfn", "sbc"],
    files: ["src/components/mzizi/AppShell.tsx", "src/routes/_authenticated/*"],
  },
  {
    id: "rq",
    label: "Query Cache",
    layer: "client",
    icon: Boxes,
    tag: "TanStack Query",
    summary:
      "Client-side data cache. Loaders prefetch, components subscribe via useSuspenseQuery / useQuery.",
    responsibilities: [
      "Deduplicates concurrent fetches",
      "Invalidated on mutations and company/currency changes",
      "Backs the sidebar's session/dashboard/company reads",
    ],
    reads: ["sbc", "sfn"],
    writes: ["ui"],
  },
  {
    id: "sbc",
    label: "Supabase JS",
    layer: "client",
    icon: KeyRound,
    tag: "publishable key",
    summary: "Browser Supabase client. Handles auth and direct PostgREST reads that pass RLS.",
    responsibilities: [
      "Email + Google OAuth sign-in",
      "Session persistence in localStorage",
      "Public/anon selects on RLS-protected tables",
    ],
    reads: ["auth", "db"],
    writes: ["auth"],
    files: ["src/integrations/supabase/client.ts"],
  },
  {
    id: "ssr",
    label: "SSR Renderer",
    layer: "edge",
    icon: Server,
    tag: "TanStack Start",
    summary: "Renders the initial HTML on the Cloudflare Worker so the app is fast and crawlable.",
    responsibilities: [
      "__root shell + _authenticated route gate",
      "Redirects unauthenticated users to /auth",
      "Head metadata per route (title, og:*)",
    ],
    reads: ["auth"],
    writes: ["ui"],
    files: ["src/routes/__root.tsx", "src/routes/_authenticated/route.tsx"],
  },
  {
    id: "sfn",
    label: "Server Functions",
    layer: "edge",
    icon: Workflow,
    tag: "createServerFn",
    summary:
      "All app-internal business logic: FD engine, savings, ALCO proposals, workflow, platform admin.",
    responsibilities: [
      "Zod-validated RPC callable from the browser",
      "Runs under requireSupabaseAuth middleware (user JWT)",
      "Reads/writes Postgres with RLS enforced as the caller",
    ],
    reads: ["mw", "db"],
    writes: ["db", "lai"],
    files: [
      "src/lib/fd.functions.ts",
      "src/lib/savings.functions.ts",
      "src/lib/alco.functions.ts",
      "src/lib/workflow.functions.ts",
      "src/lib/mzizi.functions.ts",
      "src/lib/platform-admin.functions.ts",
    ],
  },
  {
    id: "mw",
    label: "Middleware",
    layer: "edge",
    icon: ShieldCheck,
    tag: "auth · csrf · error · clock",
    summary: "Cross-cutting concerns wrapped around every server function and request.",
    responsibilities: [
      "attachSupabaseAuth — forwards the bearer token",
      "CSRF filter for serverFn calls",
      "Error boundary → renders friendly error page",
      "Dev clock override for time-travel testing",
    ],
    reads: [],
    writes: ["sfn"],
    files: ["src/start.ts", "src/integrations/supabase/auth-attacher.ts"],
  },
  {
    id: "api",
    label: "Public API",
    layer: "edge",
    icon: Plug,
    tag: "/api/public/v1/*",
    summary:
      "External-facing HTTP endpoints — CEFT, ATM, IB, CRIB, inbound/outbound transactions, health.",
    responsibilities: [
      "API-key + signature verification per request",
      "Uses service-role client after verification",
      "Never returns PII beyond what the integration needs",
    ],
    reads: ["db"],
    writes: ["db"],
    files: ["src/routes/api/public/v1/*"],
  },
  {
    id: "auth",
    label: "Auth",
    layer: "cloud",
    icon: KeyRound,
    tag: "Supabase Auth",
    summary:
      "Identity provider. Issues JWTs consumed by the browser and forwarded to server functions.",
    responsibilities: [
      "Email/password + Google OAuth",
      "Session refresh; RLS uses auth.uid()",
      "No anonymous sign-ups",
    ],
    reads: [],
    writes: ["db"],
  },
  {
    id: "db",
    label: "Postgres",
    layer: "cloud",
    icon: Database,
    tag: "RLS · has_role · company-scoped",
    summary:
      "Source of truth. Every public table has RLS + GRANTs; company scoping via current_company_id().",
    responsibilities: [
      "Domain: clients, loans, savings, FD, ALCO, workflow, GL",
      "user_roles + has_role() for approver/admin gates",
      "Balanced posting via journal_entry / posting",
    ],
    reads: [],
    writes: [],
  },
  {
    id: "cron",
    label: "pg_cron",
    layer: "cloud",
    icon: Timer,
    tag: "scheduled jobs",
    summary:
      "Calls back into /api/public/hooks/* on a schedule for FD accruals, interest payouts, maturity processing.",
    responsibilities: [
      "Daily accrual insert per active deposit (actual/365)",
      "Monthly interest payout scan",
      "Maturity + auto-renewal processing",
    ],
    reads: [],
    writes: ["api"],
  },
  {
    id: "lai",
    label: "Lovable AI",
    layer: "external",
    icon: Brain,
    tag: "gateway",
    summary: "Optional AI gateway for chat completions / embeddings used by advisory features.",
    responsibilities: [
      "Called only from server functions (never the browser)",
      "No API key required — Lovable manages it",
    ],
    reads: [],
    writes: [],
  },
  {
    id: "bank",
    label: "Bank Rails",
    layer: "external",
    icon: Radio,
    tag: "CEFT · ATM · IB · CRIB",
    summary:
      "Partner banking and credit-bureau systems that call the public API and receive callbacks.",
    responsibilities: [
      "Inbound transaction webhooks",
      "Outbound transfer requests",
      "CRIB report fetch",
    ],
    reads: [],
    writes: ["api"],
  },
  {
    id: "wf",
    label: "Workflow Engine",
    layer: "cloud",
    icon: Workflow,
    tag: "maker · checker",
    summary:
      "Approval routing for loans, FD closures, ALCO rate changes and other sensitive mutations.",
    responsibilities: [
      "Per transaction_type routing rules",
      "Records approvers, limits, timestamps",
      "Blocks apply-step until approved",
    ],
    reads: ["db"],
    writes: ["db"],
    files: ["src/lib/workflow.functions.ts"],
  },
  {
    id: "cloudflare",
    label: "Cloudflare Worker",
    layer: "edge",
    icon: Cloud,
    tag: "runtime",
    summary: "The edge runtime hosting SSR, server functions, middleware and public API routes.",
    responsibilities: [
      "nodejs_compat enabled; no native binaries",
      "Bundled at build time — no dynamic module resolution",
      "Env vars injected into handler bodies at call time",
    ],
    reads: [],
    writes: ["ssr", "sfn", "api", "mw"],
  },
];

const LAYERS: { id: Layer; label: string; hint: string; className: string }[] = [
  {
    id: "client",
    label: "Browser",
    hint: "React + TanStack Router",
    className: "from-sky-500/10 to-sky-500/0 border-sky-500/30",
  },
  {
    id: "edge",
    label: "Edge (Worker)",
    hint: "TanStack Start on Cloudflare",
    className: "from-violet-500/10 to-violet-500/0 border-violet-500/30",
  },
  {
    id: "cloud",
    label: "Lovable Cloud",
    hint: "Supabase — Auth, Postgres, Cron",
    className: "from-emerald-500/10 to-emerald-500/0 border-emerald-500/30",
  },
  {
    id: "external",
    label: "External",
    hint: "Partner systems & AI",
    className: "from-amber-500/10 to-amber-500/0 border-amber-500/30",
  },
];

export function ArchitectureExplorer() {
  const [selectedId, setSelectedId] = useState<string>("sfn");
  const selected = NODES.find((n) => n.id === selectedId)!;

  const related = new Set<string>([
    ...selected.reads,
    ...selected.writes,
    ...NODES.filter((n) => n.reads.includes(selected.id) || n.writes.includes(selected.id)).map(
      (n) => n.id,
    ),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>System architecture</CardTitle>
            <p className="text-[12.5px] text-muted-foreground mt-1">
              Click any component to inspect its responsibilities and see how it connects to the
              rest of the platform.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" /> selected
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-primary/30" /> connected
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 xl:grid-cols-4 gap-4">
          {LAYERS.map((layer) => {
            const nodes = NODES.filter((n) => n.layer === layer.id);
            return (
              <div
                key={layer.id}
                className={cn(
                  "rounded-xl border bg-gradient-to-b p-3 flex flex-col gap-2 min-h-[220px]",
                  layer.className,
                )}
              >
                <div className="flex items-baseline justify-between px-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                    {layer.label}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground">{layer.hint}</div>
                </div>
                <div className="flex flex-col gap-2">
                  {nodes.map((n) => {
                    const Icon = n.icon;
                    const isSel = n.id === selected.id;
                    const isRel = related.has(n.id);
                    return (
                      <button
                        key={n.id}
                        onClick={() => setSelectedId(n.id)}
                        className={cn(
                          "text-left rounded-lg border bg-card px-3 py-2.5 transition-all",
                          "hover:border-primary/50 hover:shadow-sm",
                          isSel && "border-primary ring-2 ring-primary/20 shadow-sm",
                          !isSel && isRel && "border-primary/40 bg-primary/[0.03]",
                          !isSel && !isRel && "border-border",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "w-7 h-7 rounded-md flex items-center justify-center flex-none",
                              isSel
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground",
                            )}
                          >
                            <Icon size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold truncate">{n.label}</div>
                            <div className="text-[10.5px] text-muted-foreground truncate">
                              {n.tag}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <DetailPanel node={selected} onSelect={setSelectedId} />
    </div>
  );
}

function DetailPanel({ node, onSelect }: { node: Node; onSelect: (id: string) => void }) {
  const Icon = node.icon;
  const outbound = node.writes
    .map((id) => NODES.find((n) => n.id === id))
    .filter(Boolean) as Node[];
  const inbound = NODES.filter((n) => n.writes.includes(node.id));
  const readsFrom = node.reads
    .map((id) => NODES.find((n) => n.id === id))
    .filter(Boolean) as Node[];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Icon size={22} />
          </div>
          <div className="min-w-0">
            <CardTitle>{node.label}</CardTitle>
            <div className="text-[11.5px] text-muted-foreground mt-0.5">{node.tag}</div>
          </div>
        </div>
        <p className="text-[13px] text-foreground/90 mt-3">{node.summary}</p>

        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Responsibilities
          </div>
          <ul className="flex flex-col gap-1.5">
            {node.responsibilities.map((r) => (
              <li key={r} className="text-[13px] flex gap-2">
                <span className="text-primary mt-1.5 w-1 h-1 rounded-full bg-primary flex-none" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        {node.files && node.files.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Source
            </div>
            <div className="flex flex-wrap gap-1.5">
              {node.files.map((f) => (
                <code
                  key={f}
                  className="text-[11.5px] px-2 py-1 rounded-md bg-muted text-foreground/80 font-mono"
                >
                  {f}
                </code>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Data flows</CardTitle>

        <FlowGroup
          title="Reads from"
          nodes={readsFrom}
          onSelect={onSelect}
          empty="Doesn't read from other components."
        />
        <FlowGroup
          title="Writes / calls"
          nodes={outbound}
          onSelect={onSelect}
          empty="Passive component — nothing outbound."
        />
        <FlowGroup
          title="Called by"
          nodes={inbound}
          onSelect={onSelect}
          empty="No inbound callers."
        />
      </Card>
    </div>
  );
}

function FlowGroup({
  title,
  nodes,
  onSelect,
  empty,
}: {
  title: string;
  nodes: Node[];
  onSelect: (id: string) => void;
  empty: string;
}) {
  return (
    <div className="mt-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {title}
      </div>
      {nodes.length === 0 ? (
        <div className="text-[12px] text-muted-foreground italic">{empty}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {nodes.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => onSelect(n.id)}
                className="text-left flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 hover:border-primary/50 hover:bg-primary/[0.03]"
              >
                <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-none">
                  <Icon size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium truncate">{n.label}</div>
                </div>
                <Badge tone="neutral">{LAYER_LABEL[n.layer]}</Badge>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const LAYER_LABEL: Record<Layer, string> = {
  client: "Browser",
  edge: "Edge",
  cloud: "Cloud",
  external: "External",
};
