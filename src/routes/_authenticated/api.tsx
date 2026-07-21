import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Plug, Shield, Trash2, Check, Search, Activity } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Modal } from "@/components/mzizi/Modal";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  selectCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";
import { shortDate } from "@/lib/format";
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  listApiLogs,
  getApiPortalStats,
} from "@/lib/api-console.functions";
import {
  API_CONTRACTS,
  contractsByResource,
  type ApiContract,
  type ApiResource,
} from "@/lib/api-contract";
import { ApiDataCatalogue } from "@/components/mzizi/ApiDataCatalogue";
import { ApiMappingStudio } from "@/components/mzizi/ApiMappingStudio";

// The registry ships resource/direction types; env is a UI-only union.
type Env = "sandbox" | "production";

export const Route = createFileRoute("/_authenticated/api")({
  component: ApiHub,
});

type Tab = "quickstart" | "explorer" | "catalogue" | "mapping" | "keys" | "logs";

const TABS: [Tab, string, string][] = [
  ["quickstart", "Quick start", "9-step onboarding, base URL, auth, standards"],
  ["explorer", "API explorer", "Every endpoint · request/response · errors"],
  ["catalogue", "Data catalogue", "Every field, resource and PII flag"],
  ["mapping", "Field mapping", "Deterministic matcher + AI fallback"],
  ["keys", "API keys", "Env-scoped credentials"],
  ["logs", "Request log", "Filter by env, channel, direction, status"],
];

function ApiHub() {
  const [tab, setTab] = useState<Tab>("quickstart");
  const [env, setEnv] = useState<Env>("sandbox");
  const statsFn = useServerFn(getApiPortalStats);
  const { data: stats } = useQuery({
    queryKey: ["api-portal-stats", env],
    queryFn: () => statsFn({ data: { env } }),
  });

  const liveCount = API_CONTRACTS.filter((c) => c.status === "live").length;
  const inboundCount = API_CONTRACTS.filter((c) => c.direction === "inbound").length;
  const outboundCount = API_CONTRACTS.filter((c) => c.direction === "outbound").length;

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground font-semibold">
            Integration
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="text-[18px] font-semibold">API &amp; Integration Hub</div>
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 uppercase tracking-wider">
              API-first platform
            </span>
          </div>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-2xl">
            Connect any system to the platform through secure REST APIs, outbound webhooks and
            field-level data mapping.
          </p>
        </div>
        <EnvSwitcher env={env} onChange={setEnv} />
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-6 gap-3">
        <StatTile label="Live endpoints" value={liveCount} />
        <StatTile label="Resources" value={Object.keys(contractsByResource()).length} />
        <StatTile label="Inbound" value={inboundCount} />
        <StatTile label="Outbound" value={outboundCount} />
        <StatTile label={`Active keys · ${env}`} value={stats?.activeKeys ?? "—"} />
        <StatTile
          label="24h success"
          value={stats?.successRate == null ? "—" : `${stats.successRate}%`}
          hint={stats?.total24h ? `${stats.total24h} calls` : "no traffic"}
        />
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(([id, label, desc]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            title={desc}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "quickstart" && <QuickStartTab env={env} />}
      {tab === "explorer" && <ExplorerTab env={env} />}
      {tab === "catalogue" && <ApiDataCatalogue />}
      {tab === "mapping" && <ApiMappingStudio env={env} />}
      {tab === "keys" && <KeysTab env={env} />}
      {tab === "logs" && <LogsTab env={env} />}
    </div>
  );
}

function EnvSwitcher({ env, onChange }: { env: Env; onChange: (e: Env) => void }) {
  return (
    <div className="flex items-center gap-2 border border-border rounded-lg bg-card p-1">
      {(["sandbox", "production"] as const).map((e) => (
        <button
          key={e}
          onClick={() => onChange(e)}
          className={cn(
            "px-3 py-1.5 text-[12px] font-semibold rounded-md capitalize transition",
            env === e
              ? e === "production"
                ? "bg-rose-500/10 text-rose-700 border border-rose-500/30"
                : "bg-emerald-500/10 text-emerald-700 border border-emerald-500/30"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="border border-border rounded-lg bg-card px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-[18px] font-semibold mt-0.5">{value}</div>
      {hint && <div className="text-[10.5px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

// ---------- QUICK START ----------

function QuickStartTab({ env }: { env: Env }) {
  const base = typeof window !== "undefined" ? window.location.origin : "https://your-app.example";
  const prefix = env === "production" ? "mz_live_" : "mz_test_";
  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "1 · Pick your environment",
      body: (
        <div>
          You're currently viewing <b className="capitalize">{env}</b>. Sandbox keys begin with{" "}
          <code className="font-mono text-[11.5px] bg-muted px-1.5 py-0.5 rounded">mz_test_</code>{" "}
          and production keys with{" "}
          <code className="font-mono text-[11.5px] bg-muted px-1.5 py-0.5 rounded">mz_live_</code>.
          Env is inferred from the key prefix on every request — you cannot mix them.
        </div>
      ),
    },
    {
      title: "2 · Create an API key",
      body: (
        <div>
          Open the <b>API keys</b> tab and issue a key with only the scopes you need. The secret is
          shown <b>once</b> — copy it to your partner system's secrets manager.
        </div>
      ),
    },
    {
      title: "3 · Base URL",
      body: (
        <div className="font-mono text-[12.5px] bg-muted rounded px-3 py-2 flex items-center justify-between">
          <span>
            {base}/api/public/v1
          </span>
          <CopyBtn value={`${base}/api/public/v1`} />
        </div>
      ),
    },
    {
      title: "4 · Authenticate",
      body: (
        <div>
          Send{" "}
          <code className="font-mono text-[11.5px] bg-muted px-1.5 py-0.5 rounded">
            Authorization: Bearer {prefix}…
          </code>{" "}
          on every request.
        </div>
      ),
    },
    {
      title: "5 · Idempotency",
      body: (
        <div>
          For any money-moving POST, send an{" "}
          <code className="font-mono text-[11.5px] bg-muted px-1.5 py-0.5 rounded">
            Idempotency-Key
          </code>{" "}
          header (UUID or your own reference). Replays inside 24h return the original response;
          same key + different body returns <b>409 idempotency_conflict</b>.
        </div>
      ),
    },
    {
      title: "6 · Pagination",
      body: (
        <div>
          List endpoints accept{" "}
          <code className="font-mono text-[11.5px] bg-muted px-1.5 py-0.5 rounded">?cursor=</code>{" "}
          and{" "}
          <code className="font-mono text-[11.5px] bg-muted px-1.5 py-0.5 rounded">?limit=</code>{" "}
          (default 50, max 200). Response includes{" "}
          <code className="font-mono text-[11.5px] bg-muted px-1.5 py-0.5 rounded">
            next_cursor
          </code>{" "}
          when more rows exist.
        </div>
      ),
    },
    {
      title: "7 · Rate limits",
      body: (
        <div>
          Default 600 req/min per key. Bursts up to 100 req/s. Exceeded requests return{" "}
          <b>429 rate_limited</b> with a{" "}
          <code className="font-mono text-[11.5px] bg-muted px-1.5 py-0.5 rounded">
            Retry-After
          </code>{" "}
          header.
        </div>
      ),
    },
    {
      title: "8 · Standard error shape",
      body: (
        <pre className="font-mono text-[11.5px] bg-muted rounded p-3 whitespace-pre-wrap">{`{
  "error": "validation_failed",
  "message": "Request body failed schema validation.",
  "details": { ... }
}`}</pre>
      ),
    },
    {
      title: "9 · Observe",
      body: (
        <div>
          Every call is recorded in <b>Request log</b> — filter by env, channel, direction and
          status class. Use it for reconciliation and debugging.
        </div>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="col-span-2">
        <CardTitle>Getting started</CardTitle>
        <ol className="mt-3 flex flex-col gap-3">
          {steps.map((s) => (
            <li key={s.title} className="border-l-2 border-primary/30 pl-3">
              <div className="text-[13px] font-semibold">{s.title}</div>
              <div className="text-[12.5px] text-foreground/85 mt-1">{s.body}</div>
            </li>
          ))}
        </ol>
      </Card>
      <div className="flex flex-col gap-4">
        <Card>
          <CardTitle>Platform standards</CardTitle>
          <ul className="text-[12.5px] space-y-2 mt-2 text-foreground/85">
            <li className="flex gap-2">
              <Shield size={14} className="text-primary mt-0.5" /> TLS 1.2+, bearer token, per-scope
              authorization
            </li>
            <li className="flex gap-2">
              <Plug size={14} className="text-primary mt-0.5" /> REST + JSON, ISO 4217 currency,
              RFC 3339 timestamps
            </li>
            <li className="flex gap-2">
              <KeyRound size={14} className="text-primary mt-0.5" /> Idempotency-Key on all
              outbound money moves
            </li>
            <li className="flex gap-2">
              <Activity size={14} className="text-primary mt-0.5" /> Every call logged, env-scoped,
              company-scoped
            </li>
          </ul>
        </Card>
        <Card>
          <CardTitle>Coming next</CardTitle>
          <ul className="text-[12.5px] space-y-1.5 mt-2 text-foreground/85 list-disc list-inside">
            <li>Data catalogue &amp; field mapping studio</li>
            <li>Outbound webhooks (HMAC, retries, dead letter)</li>
            <li>GET read endpoints for every resource</li>
            <li>OpenAPI 3.1 + Postman collection download</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ---------- API EXPLORER ----------

function ExplorerTab({ env }: { env: Env }) {
  const [q, setQ] = useState("");
  const [resource, setResource] = useState<"all" | ApiResource>("all");
  const [direction, setDirection] = useState<"all" | "inbound" | "outbound" | "bi">("all");
  const [openId, setOpenId] = useState<string | null>(API_CONTRACTS[0]?.id ?? null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return API_CONTRACTS.filter((c) => {
      if (resource !== "all" && c.resource !== resource) return false;
      if (direction !== "all" && c.direction !== direction) return false;
      if (!query) return true;
      return (
        c.path.toLowerCase().includes(query) ||
        c.title.toLowerCase().includes(query) ||
        c.id.toLowerCase().includes(query) ||
        (c.scope ?? "").toLowerCase().includes(query)
      );
    });
  }, [q, resource, direction]);

  const resources = Object.keys(contractsByResource()) as ApiResource[];

  return (
    <div className="flex flex-col gap-3">
      <Card padded={false}>
        <div className="flex items-center gap-2 p-3 border-b border-border">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className={cn(inputCls, "pl-7")}
              placeholder="Search path, title, scope…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className={cn(selectCls, "w-40")}
            value={resource}
            onChange={(e) => setResource(e.target.value as any)}
          >
            <option value="all">All resources</option>
            {resources.map((r) => (
              <option key={r} value={r}>
                {r.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            className={cn(selectCls, "w-36")}
            value={direction}
            onChange={(e) => setDirection(e.target.value as any)}
          >
            <option value="all">All directions</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
            <option value="bi">Bidirectional</option>
          </select>
          <div className="ml-auto text-[11.5px] text-muted-foreground">
            {filtered.length} of {API_CONTRACTS.length}
          </div>
        </div>
        {filtered.map((c) => (
          <EndpointRow
            key={c.id}
            contract={c}
            env={env}
            open={openId === c.id}
            onToggle={() => setOpenId(openId === c.id ? null : c.id)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-[12.5px] text-muted-foreground">
            No endpoints match those filters.
          </div>
        )}
      </Card>
    </div>
  );
}

function EndpointRow({
  contract,
  env,
  open,
  onToggle,
}: {
  contract: ApiContract;
  env: Env;
  open: boolean;
  onToggle: () => void;
}) {
  const base = typeof window !== "undefined" ? window.location.origin : "https://your-app.example";
  const url = `${base}${contract.path}`;
  const prefix = env === "production" ? "mz_live_" : "mz_test_";
  return (
    <div className="border-b border-row-divider last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/40"
      >
        <span
          className={cn(
            "font-mono text-[10.5px] font-semibold px-1.5 py-0.5 rounded",
            contract.method === "GET"
              ? "bg-sky-500/10 text-sky-700"
              : "bg-emerald-500/10 text-emerald-700",
          )}
        >
          {contract.method}
        </span>
        <span className="font-mono text-[12.5px]">{contract.path}</span>
        <span className="text-[11.5px] text-muted-foreground ml-2 flex-1 truncate">
          {contract.title} — {contract.summary}
        </span>
        {contract.scope && (
          <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {contract.scope}
          </span>
        )}
      </button>

      {open && (
        <div className="px-5 pb-5 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Chip>Resource · {contract.resource}</Chip>
            <Chip>Direction · {contract.direction}</Chip>
            <Chip>
              Idempotency · {contract.requiresIdempotency ? "required" : "not applicable"}
            </Chip>
            <Chip>Env · {env}</Chip>
          </div>

          {contract.fields.length > 0 && (
            <div>
              <Label>Fields</Label>
              <div className="border border-border rounded-md overflow-hidden">
                <div
                  className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-2 px-3 bg-secondary/40 border-b border-border"
                  style={{
                    gridTemplateColumns: "1.6fr 1.4fr 0.6fr 0.6fr 0.6fr 0.6fr 0.7fr",
                  }}
                >
                  <div>Path</div>
                  <div>Label</div>
                  <div>Type</div>
                  <div>Req.</div>
                  <div>Inbound</div>
                  <div>Outbound</div>
                  <div>Sensitive</div>
                </div>
                {contract.fields.map((f) => (
                  <div
                    key={f.path}
                    className="grid items-center text-[12px] py-2 px-3 border-b border-row-divider last:border-b-0"
                    style={{
                      gridTemplateColumns: "1.6fr 1.4fr 0.6fr 0.6fr 0.6fr 0.6fr 0.7fr",
                    }}
                  >
                    <div className="font-mono">{f.path}</div>
                    <div>{f.label}</div>
                    <div className="text-muted-foreground">{f.type}</div>
                    <div>{f.required ? "yes" : ""}</div>
                    <div>{f.inbound ? "✓" : ""}</div>
                    <div>{f.outbound ? "✓" : ""}</div>
                    <div className={f.sensitive ? "text-amber-700 font-semibold" : ""}>
                      {f.sensitive ? "PII" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {contract.requestExample != null && (
            <div>
              <Label>Request body</Label>
              <pre className="font-mono text-[11.5px] bg-muted rounded p-3 whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(contract.requestExample, null, 2)}
              </pre>
            </div>
          )}

          {contract.responseExample != null && (
            <div>
              <Label>Response example</Label>
              <pre className="font-mono text-[11.5px] bg-muted rounded p-3 whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(contract.responseExample, null, 2)}
              </pre>
            </div>
          )}

          {contract.errors.length > 0 && (
            <div>
              <Label>Errors</Label>
              <div className="border border-border rounded-md overflow-hidden">
                <div
                  className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-2 px-3 bg-secondary/40 border-b border-border"
                  style={{ gridTemplateColumns: "0.4fr 0.8fr 1.8fr" }}
                >
                  <div>Code</div>
                  <div>Error</div>
                  <div>Meaning</div>
                </div>
                {contract.errors.map((er) => (
                  <div
                    key={er.code + er.error}
                    className="grid items-start text-[12px] py-2 px-3 border-b border-row-divider last:border-b-0"
                    style={{ gridTemplateColumns: "0.4fr 0.8fr 1.8fr" }}
                  >
                    <div className="font-mono font-semibold">{er.code}</div>
                    <div className="font-mono text-muted-foreground">{er.error}</div>
                    <div className="text-foreground/85">{er.meaning}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {contract.webhookEvents && contract.webhookEvents.length > 0 && (
            <div>
              <Label>Emits webhook events</Label>
              <div className="flex flex-wrap gap-1.5">
                {contract.webhookEvents.map((e) => (
                  <span
                    key={e}
                    className="font-mono text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                  >
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>cURL</Label>
            <pre className="font-mono text-[11.5px] bg-muted rounded p-3 whitespace-pre-wrap overflow-x-auto">
              {contract.method === "GET"
                ? `curl ${url} \\\n  -H "Authorization: Bearer ${prefix}…" \\\n  -H "Accept: application/json"`
                : `curl -X ${contract.method} ${url} \\\n  -H "Authorization: Bearer ${prefix}…" \\\n  -H "Content-Type: application/json" \\\n  ${
                    contract.requiresIdempotency
                      ? `-H "Idempotency-Key: 2026-07-21-abc123" \\\n  `
                      : ""
                  }-d '${JSON.stringify(contract.requestExample ?? {})}'`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-full bg-muted text-foreground/80 border border-border capitalize">
      {children}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
      {children}
    </div>
  );
}

// ---------- KEYS ----------

const SCOPE_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "clients.create", label: "Create clients", hint: "Onboard customers programmatically" },
  {
    id: "transactions.inbound",
    label: "Accept third-party transactions",
    hint: "Receive credits from partner accounts",
  },
  {
    id: "transactions.outbound",
    label: "Send to third-party accounts",
    hint: "Push debits/credits to partner accounts",
  },
  { id: "ceft", label: "CEFT clearing", hint: "Common Electronic Funds Transfer switch" },
  { id: "atm", label: "ATM authorization", hint: "ISO-8583 style ATM transaction messages" },
  { id: "internet_banking", label: "Internet banking", hint: "Customer-facing digital channel" },
  { id: "crib", label: "CRIB credit bureau", hint: "Credit information reporting bureau" },
];

function KeysTab({ env }: { env: Env }) {
  const listFn = useServerFn(listApiKeys);
  const revokeFn = useServerFn(revokeApiKey);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["api-keys", env],
    queryFn: () => listFn({ data: { env } }),
  });
  const [modal, setModal] = useState(false);
  const revoke = useMutation({
    mutationFn: revokeFn,
    onSuccess: () => {
      toast.success("Key revoked");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      qc.invalidateQueries({ queryKey: ["api-portal-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card padded={false}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="text-[13.5px] font-semibold">
              API keys · <span className="capitalize">{env}</span>
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              Only company admins and platform admins can create keys. Env is enforced end-to-end
              (RLS, queries, idempotency, logs).
            </div>
          </div>
          <button className={btnPrimaryCls} onClick={() => setModal(true)}>
            Create key
          </button>
        </div>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
          style={{ gridTemplateColumns: "1.4fr 1.2fr 0.7fr 0.7fr 1fr 0.6fr" }}
        >
          <div>Label</div>
          <div>Key prefix</div>
          <div>Env</div>
          <div>Status</div>
          <div>Last used</div>
          <div></div>
        </div>
        {isLoading && <div className="p-5 text-[12.5px] text-muted-foreground">Loading…</div>}
        {(data?.keys ?? []).map((k: any) => (
          <div
            key={k.id}
            className="grid items-center text-[12.5px] py-3 px-5 border-b border-row-divider last:border-b-0"
            style={{ gridTemplateColumns: "1.4fr 1.2fr 0.7fr 0.7fr 1fr 0.6fr" }}
          >
            <div>
              <div className="font-semibold">{k.label}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {(k.scopes ?? []).join(" · ")}
              </div>
            </div>
            <div className="font-mono text-[11.5px]">{k.key_prefix}…</div>
            <div className="capitalize">{k.environment}</div>
            <div>
              <span
                className={cn(
                  "text-[10.5px] font-semibold px-2 py-0.5 rounded-full border capitalize",
                  k.status === "active"
                    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                    : "bg-rose-500/10 text-rose-700 border-rose-500/30",
                )}
              >
                {k.status}
              </span>
            </div>
            <div className="text-muted-foreground">
              {k.last_used_at ? shortDate(k.last_used_at) : "Never"}
            </div>
            <div className="text-right">
              {k.status === "active" && (
                <button
                  onClick={() => {
                    if (
                      confirm(
                        "Revoke this key? Third parties using it will start failing immediately.",
                      )
                    )
                      revoke.mutate({ data: { id: k.id } });
                  }}
                  className="text-rose-600 hover:underline text-[12px] font-medium inline-flex items-center gap-1"
                >
                  <Trash2 size={13} /> Revoke
                </button>
              )}
            </div>
          </div>
        ))}
        {!isLoading && (data?.keys ?? []).length === 0 && (
          <div className="p-8 text-center text-[12.5px] text-muted-foreground">
            No {env} keys yet — create one to start integrating.
          </div>
        )}
      </Card>
      {modal && <CreateKeyModal env={env} onClose={() => setModal(false)} />}
    </>
  );
}

function CreateKeyModal({ env, onClose }: { env: Env; onClose: () => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createApiKey);
  const [label, setLabel] = useState("");
  const [environment, setEnvironment] = useState<Env>(env);
  const [scopes, setScopes] = useState<string[]>([]);
  const [issued, setIssued] = useState<{ secret: string; prefix: string } | null>(null);

  const create = useMutation({
    mutationFn: createFn,
    onSuccess: (r) => {
      setIssued({ secret: r.secret, prefix: r.key.key_prefix });
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      qc.invalidateQueries({ queryKey: ["api-portal-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open onClose={onClose} title={issued ? "API key created" : "Create API key"}>
      {!issued && (
        <>
          <FormGrid>
            <FormField label="Label" required span={8}>
              <input
                className={inputCls}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. LankaClear CEFT sandbox"
              />
            </FormField>
            <FormField label="Environment" required span={4}>
              <select
                className={selectCls}
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as Env)}
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </FormField>
            <FormField label="Scopes" required span={12}>
              <div className="grid grid-cols-2 gap-2">
                {SCOPE_OPTIONS.map((s) => {
                  const on = scopes.includes(s.id);
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() =>
                        setScopes((x) => (on ? x.filter((y) => y !== s.id) : [...x, s.id]))
                      }
                      className={cn(
                        "text-left border rounded-md p-2.5 text-[12px] transition",
                        on
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-border-strong",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "w-3.5 h-3.5 rounded border flex items-center justify-center",
                            on ? "bg-primary border-primary" : "border-border-strong",
                          )}
                        >
                          {on && <Check size={10} className="text-primary-foreground" />}
                        </span>
                        <span className="font-semibold">{s.label}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 ml-5">{s.hint}</div>
                    </button>
                  );
                })}
              </div>
            </FormField>
          </FormGrid>
          <FormActions>
            <button className={btnSecondaryCls} onClick={onClose}>
              Cancel
            </button>
            <button
              className={btnPrimaryCls}
              disabled={create.isPending || !label.trim() || scopes.length === 0}
              onClick={() =>
                create.mutate({ data: { label: label.trim(), environment, scopes: scopes as any } })
              }
            >
              {create.isPending ? "Creating…" : "Create key"}
            </button>
          </FormActions>
        </>
      )}
      {issued && (
        <div className="flex flex-col gap-3">
          <div className="text-[12.5px] text-rose-700 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
            <b>Copy this key now.</b> It will never be shown again. Store it in your partner
            system's secrets manager.
          </div>
          <div className="font-mono text-[12.5px] bg-muted rounded p-3 break-all flex items-start justify-between gap-2">
            <span>{issued.secret}</span>
            <CopyBtn value={issued.secret} />
          </div>
          <FormActions>
            <button className={btnPrimaryCls} onClick={onClose}>
              Done
            </button>
          </FormActions>
        </div>
      )}
    </Modal>
  );
}

// ---------- LOGS ----------

function LogsTab({ env }: { env: Env }) {
  const fn = useServerFn(listApiLogs);
  const [channel, setChannel] = useState<string>("");
  const [direction, setDirection] = useState<string>("");
  const [statusClass, setStatusClass] = useState<string>("");
  const { data, isLoading } = useQuery({
    queryKey: ["api-logs", env, channel, direction, statusClass],
    queryFn: () =>
      fn({
        data: {
          channel: channel || undefined,
          env,
          direction: (direction || undefined) as any,
          status_class: (statusClass || undefined) as any,
          limit: 100,
        },
      }),
  });
  const rows = useMemo(() => data?.logs ?? [], [data]);
  return (
    <Card padded={false}>
      <div className="p-4 flex items-center gap-2 border-b border-border flex-wrap">
        <select
          className={cn(selectCls, "w-48")}
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
          <option value="">All channels</option>
          <option value="clients">Clients</option>
          <option value="transactions">Transactions</option>
          <option value="ceft">CEFT</option>
          <option value="atm">ATM</option>
          <option value="internet_banking">Internet banking</option>
          <option value="crib">CRIB</option>
        </select>
        <select
          className={cn(selectCls, "w-36")}
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
        >
          <option value="">Any direction</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        <select
          className={cn(selectCls, "w-40")}
          value={statusClass}
          onChange={(e) => setStatusClass(e.target.value)}
        >
          <option value="">Any status</option>
          <option value="success">2xx success</option>
          <option value="client_error">4xx client error</option>
          <option value="server_error">5xx server error</option>
        </select>
        <div className="ml-auto text-[11.5px] text-muted-foreground">
          {rows.length} recent · <span className="capitalize">{env}</span>
        </div>
      </div>
      <div
        className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
        style={{ gridTemplateColumns: "0.9fr 0.7fr 0.7fr 0.5fr 1.6fr 0.9fr 0.5fr" }}
      >
        <div>When</div>
        <div>Channel</div>
        <div>Env</div>
        <div>Dir</div>
        <div>Endpoint</div>
        <div>Reference</div>
        <div className="text-right">Status</div>
      </div>
      {isLoading && <div className="p-5 text-[12.5px] text-muted-foreground">Loading…</div>}
      {rows.map((r: any) => (
        <div
          key={r.id}
          className="grid items-center text-[12px] py-2.5 px-5 border-b border-row-divider last:border-b-0"
          style={{ gridTemplateColumns: "0.9fr 0.7fr 0.7fr 0.5fr 1.6fr 0.9fr 0.5fr" }}
        >
          <div className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
          <div className="capitalize">{String(r.channel).replace("_", " ")}</div>
          <div className="capitalize text-muted-foreground">{r.env}</div>
          <div className="capitalize text-muted-foreground">{r.direction}</div>
          <div className="font-mono text-[11.5px] truncate">
            {r.method} {r.endpoint}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">{r.reference ?? "—"}</div>
          <div
            className={cn(
              "text-right font-mono font-semibold",
              r.status_code >= 500
                ? "text-rose-600"
                : r.status_code >= 400
                  ? "text-amber-600"
                  : "text-emerald-700",
            )}
          >
            {r.status_code ?? "—"}
          </div>
        </div>
      ))}
      {!isLoading && rows.length === 0 && (
        <div className="p-8 text-center text-[12.5px] text-muted-foreground">
          No API calls recorded for these filters.
        </div>
      )}
    </Card>
  );
}

// ---------- misc ----------

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-muted-foreground hover:text-foreground flex-none"
      title="Copy"
    >
      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
    </button>
  );
}

// Re-exported for tests: keeps the contract registry pinned as endpoints
// come and go.
export { API_CONTRACTS as ENDPOINTS };
