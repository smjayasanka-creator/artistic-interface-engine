import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Plug, Shield, Trash2, Check } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Modal } from "@/components/mzizi/Modal";
import {
  FormGrid, FormField, FormActions,
  inputCls, selectCls, btnPrimaryCls, btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";
import { shortDate } from "@/lib/format";
import { listApiKeys, createApiKey, revokeApiKey, listApiLogs } from "@/lib/api-console.functions";

export const Route = createFileRoute("/_authenticated/api")({
  component: ApiConsole,
});

type Tab = "overview" | "endpoints" | "keys" | "logs";

const SCOPES: { id: string; label: string; hint: string }[] = [
  { id: "transactions.inbound", label: "Accept third-party transactions", hint: "Receive credits from partner accounts" },
  { id: "transactions.outbound", label: "Send to third-party accounts", hint: "Push debits/credits to partner accounts" },
  { id: "ceft", label: "CEFT clearing", hint: "Common Electronic Funds Transfer switch" },
  { id: "atm", label: "ATM authorization", hint: "ISO-8583 style ATM transaction messages" },
  { id: "internet_banking", label: "Internet Banking", hint: "Customer-facing digital channel" },
  { id: "crib", label: "CRIB credit bureau", hint: "Credit information reporting bureau" },
];

const ENDPOINTS = [
  { channel: "Transactions · Inbound", method: "POST", path: "/api/public/v1/transactions/inbound", scope: "transactions.inbound",
    desc: "Third parties post credits/debits into a customer account. Returns an internal reference for reconciliation." },
  { channel: "Transactions · Outbound", method: "POST", path: "/api/public/v1/transactions/outbound", scope: "transactions.outbound",
    desc: "Queue an outbound transfer to an external bank / wallet account. Idempotency key required." },
  { channel: "CEFT", method: "POST", path: "/api/public/v1/ceft/transfer", scope: "ceft",
    desc: "Submit a CEFT (Common Electronic Funds Transfer) message. Same-day clearing within LankaClear cutoff." },
  { channel: "ATM Switch", method: "POST", path: "/api/public/v1/atm/authorize", scope: "atm",
    desc: "Authorize an ATM withdrawal, balance inquiry, or mini-statement. Terminal ID + STAN required." },
  { channel: "Internet Banking", method: "POST", path: "/api/public/v1/ib/transaction", scope: "internet_banking",
    desc: "Post an internet-banking initiated transaction. Requires device fingerprint and verified OTP." },
  { channel: "CRIB", method: "POST", path: "/api/public/v1/crib/report", scope: "crib",
    desc: "Request a Credit Information Bureau report for a national ID. Consent reference required." },
  { channel: "Health", method: "GET", path: "/api/public/v1/health", scope: "—",
    desc: "Public health probe. No authentication required — safe for uptime monitors." },
];

function ApiConsole() {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div>
        <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground font-semibold">Integration</div>
        <div className="text-[18px] font-semibold mt-0.5">API console</div>
        <p className="text-[12.5px] text-muted-foreground mt-1 max-w-2xl">
          REST endpoints for connecting third-party accounts, CEFT clearing, ATM switch, internet banking, and CRIB. Bearer-token authenticated over HTTPS.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {([
          ["overview", "Overview"],
          ["endpoints", "Endpoints"],
          ["keys", "API keys"],
          ["logs", "Request log"],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px",
              tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "endpoints" && <EndpointsTab />}
      {tab === "keys" && <KeysTab />}
      {tab === "logs" && <LogsTab />}
    </div>
  );
}

function OverviewTab() {
  const base = typeof window !== "undefined" ? window.location.origin : "https://your-app.example";
  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="col-span-2">
        <CardTitle>Getting started</CardTitle>
        <ol className="mt-3 text-[13px] space-y-2 text-foreground/85 list-decimal list-inside">
          <li>Open <b>API keys</b> and create a key with the scopes you need (sandbox first).</li>
          <li>Copy the secret shown once — store it in your partner system's secrets manager.</li>
          <li>Call any endpoint with <code className="font-mono text-[11.5px] bg-muted px-1.5 py-0.5 rounded">Authorization: Bearer &lt;key&gt;</code>.</li>
          <li>Every call is recorded under <b>Request log</b> for reconciliation & audit.</li>
        </ol>
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Base URL</div>
          <div className="font-mono text-[12.5px] bg-muted rounded px-3 py-2 flex items-center justify-between">
            <span>{base}/api/public/v1</span>
            <CopyBtn value={`${base}/api/public/v1`} />
          </div>
        </div>
      </Card>
      <Card>
        <CardTitle>Standards</CardTitle>
        <ul className="text-[12.5px] space-y-2 mt-2 text-foreground/85">
          <li className="flex gap-2"><Shield size={14} className="text-primary mt-0.5" /> TLS-only, bearer token, per-scope authorization</li>
          <li className="flex gap-2"><Plug size={14} className="text-primary mt-0.5" /> REST + JSON, ISO 4217 currency codes, RFC 3339 timestamps</li>
          <li className="flex gap-2"><KeyRound size={14} className="text-primary mt-0.5" /> Idempotency-Key on all outbound money moves</li>
          <li className="flex gap-2"><Check size={14} className="text-primary mt-0.5" /> Sandbox &amp; Production environments per key</li>
        </ul>
      </Card>
    </div>
  );
}

function EndpointsTab() {
  const [open, setOpen] = useState<string | null>(ENDPOINTS[0].path);
  const base = typeof window !== "undefined" ? window.location.origin : "https://your-app.example";
  return (
    <Card padded={false}>
      {ENDPOINTS.map((e) => {
        const isOpen = open === e.path;
        const url = `${base}${e.path}`;
        const curl = e.method === "GET"
          ? `curl -H "Authorization: Bearer <YOUR_KEY>" \\\n  ${url}`
          : `curl -X POST ${url} \\\n  -H "Authorization: Bearer <YOUR_KEY>" \\\n  -H "Content-Type: application/json" \\\n  -d '${sampleBody(e.scope)}'`;
        return (
          <div key={e.path} className="border-b border-row-divider last:border-b-0">
            <button onClick={() => setOpen(isOpen ? null : e.path)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/40">
              <span className={cn("font-mono text-[10.5px] font-semibold px-1.5 py-0.5 rounded",
                e.method === "GET" ? "bg-sky-500/10 text-sky-700" : "bg-emerald-500/10 text-emerald-700")}>
                {e.method}
              </span>
              <span className="font-mono text-[12.5px]">{e.path}</span>
              <span className="text-[11.5px] text-muted-foreground ml-2 flex-1 truncate">{e.desc}</span>
              <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{e.scope}</span>
            </button>
            {isOpen && (
              <div className="px-5 pb-5">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mt-2 mb-1">Channel</div>
                <div className="text-[13px] mb-3">{e.channel}</div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">cURL</div>
                <pre className="font-mono text-[11.5px] bg-muted rounded p-3 whitespace-pre-wrap">{curl}</pre>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function sampleBody(scope: string): string {
  switch (scope) {
    case "transactions.inbound":
      return JSON.stringify({ external_reference: "PARTNER-9821", counterparty: { name: "Acme Ltd", account: "0011223344" }, amount: 15000, currency: "LKR", narrative: "Salary credit" });
    case "transactions.outbound":
      return JSON.stringify({ source_account: "1002200330", destination: { name: "Jane Doe", account: "0099887766", bank_code: "7010" }, amount: 4500, currency: "LKR", idempotency_key: "req-abc-123" });
    case "ceft":
      return JSON.stringify({ transaction_type: "credit", originator: { name: "Mzizi", account: "1000", bank_code: "7010" }, beneficiary: { name: "Sam", account: "2000", bank_code: "7135" }, amount: 25000, currency: "LKR", session_id: "S-20260712-01" });
    case "atm":
      return JSON.stringify({ terminal_id: "TERM-045", card_pan_masked: "411111******1234", transaction_type: "withdrawal", amount: 10000, currency: "LKR", stan: "004587" });
    case "internet_banking":
      return JSON.stringify({ customer_id: "CUS-1102", channel: "internet_banking", action: "loan_repayment", amount: 8500, currency: "LKR", source_account: "1001", device_fingerprint: "fp-9a1b2c3d", otp_verified: true });
    case "crib":
      return JSON.stringify({ national_id: "199012345678", purpose: "loan_application", consent_reference: "CNSNT-4471" });
    default:
      return "{}";
  }
}

function KeysTab() {
  const listFn = useServerFn(listApiKeys);
  const revokeFn = useServerFn(revokeApiKey);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["api-keys"], queryFn: () => listFn() });
  const [modal, setModal] = useState(false);
  const revoke = useMutation({
    mutationFn: revokeFn,
    onSuccess: () => { toast.success("Key revoked"); qc.invalidateQueries({ queryKey: ["api-keys"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card padded={false}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="text-[13.5px] font-semibold">API keys</div>
            <div className="text-[11.5px] text-muted-foreground">Only company admins and platform admins can create keys.</div>
          </div>
          <button className={btnPrimaryCls} onClick={() => setModal(true)}>Create key</button>
        </div>
        <div className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
             style={{ gridTemplateColumns: "1.4fr 1.2fr 0.7fr 0.7fr 1fr 0.6fr" }}>
          <div>Label</div><div>Key prefix</div><div>Env</div><div>Status</div><div>Last used</div><div></div>
        </div>
        {isLoading && <div className="p-5 text-[12.5px] text-muted-foreground">Loading…</div>}
        {(data?.keys ?? []).map((k: any) => (
          <div key={k.id} className="grid items-center text-[12.5px] py-3 px-5 border-b border-row-divider last:border-b-0"
               style={{ gridTemplateColumns: "1.4fr 1.2fr 0.7fr 0.7fr 1fr 0.6fr" }}>
            <div>
              <div className="font-semibold">{k.label}</div>
              <div className="text-[11px] text-muted-foreground truncate">{(k.scopes ?? []).join(" · ")}</div>
            </div>
            <div className="font-mono text-[11.5px]">{k.key_prefix}…</div>
            <div className="capitalize">{k.environment}</div>
            <div>
              <span className={cn("text-[10.5px] font-semibold px-2 py-0.5 rounded-full border capitalize",
                k.status === "active" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-rose-500/10 text-rose-700 border-rose-500/30")}>
                {k.status}
              </span>
            </div>
            <div className="text-muted-foreground">{k.last_used_at ? shortDate(k.last_used_at) : "Never"}</div>
            <div className="text-right">
              {k.status === "active" && (
                <button onClick={() => { if (confirm("Revoke this key? Third parties using it will start failing immediately.")) revoke.mutate({ data: { id: k.id } }); }}
                        className="text-rose-600 hover:underline text-[12px] font-medium inline-flex items-center gap-1">
                  <Trash2 size={13} /> Revoke
                </button>
              )}
            </div>
          </div>
        ))}
        {!isLoading && (data?.keys ?? []).length === 0 && (
          <div className="p-8 text-center text-[12.5px] text-muted-foreground">No API keys yet — create one to start integrating.</div>
        )}
      </Card>
      {modal && <CreateKeyModal onClose={() => setModal(false)} />}
    </>
  );
}

function CreateKeyModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createApiKey);
  const [label, setLabel] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [scopes, setScopes] = useState<string[]>([]);
  const [issued, setIssued] = useState<{ secret: string; prefix: string } | null>(null);

  const create = useMutation({
    mutationFn: createFn,
    onSuccess: (r) => { setIssued({ secret: r.secret, prefix: r.key.key_prefix }); qc.invalidateQueries({ queryKey: ["api-keys"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open onClose={onClose} title={issued ? "API key created" : "Create API key"}>
      {!issued && (
        <>
          <FormGrid>
            <FormField label="Label" required span={8}>
              <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. LankaClear CEFT sandbox" />
            </FormField>
            <FormField label="Environment" required span={4}>
              <select className={selectCls} value={environment} onChange={(e) => setEnvironment(e.target.value as any)}>
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </FormField>
            <FormField label="Scopes" required span={12}>
              <div className="grid grid-cols-2 gap-2">
                {SCOPES.map((s) => {
                  const on = scopes.includes(s.id);
                  return (
                    <button type="button" key={s.id}
                      onClick={() => setScopes((x) => on ? x.filter((y) => y !== s.id) : [...x, s.id])}
                      className={cn("text-left border rounded-md p-2.5 text-[12px] transition",
                        on ? "border-primary bg-primary/5" : "border-border hover:border-border-strong")}>
                      <div className="flex items-center gap-2">
                        <span className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center",
                          on ? "bg-primary border-primary" : "border-border-strong")}>
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
            <button className={btnSecondaryCls} onClick={onClose}>Cancel</button>
            <button className={btnPrimaryCls} disabled={create.isPending || !label.trim() || scopes.length === 0}
                    onClick={() => create.mutate({ data: { label: label.trim(), environment, scopes: scopes as any } })}>
              {create.isPending ? "Creating…" : "Create key"}
            </button>
          </FormActions>
        </>
      )}
      {issued && (
        <div className="flex flex-col gap-3">
          <div className="text-[12.5px] text-rose-700 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
            <b>Copy this key now.</b> It will never be shown again. Store it in your partner system's secrets manager.
          </div>
          <div className="font-mono text-[12.5px] bg-muted rounded p-3 break-all flex items-start justify-between gap-2">
            <span>{issued.secret}</span>
            <CopyBtn value={issued.secret} />
          </div>
          <FormActions>
            <button className={btnPrimaryCls} onClick={onClose}>Done</button>
          </FormActions>
        </div>
      )}
    </Modal>
  );
}

function LogsTab() {
  const fn = useServerFn(listApiLogs);
  const [channel, setChannel] = useState<string>("");
  const { data, isLoading } = useQuery({ queryKey: ["api-logs", channel], queryFn: () => fn({ data: { channel: channel || undefined, limit: 100 } }) });
  const rows = useMemo(() => data?.logs ?? [], [data]);
  return (
    <Card padded={false}>
      <div className="p-4 flex items-center gap-3 border-b border-border">
        <select className={selectCls + " w-52"} value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">All channels</option>
          <option value="transactions">Transactions</option>
          <option value="ceft">CEFT</option>
          <option value="atm">ATM</option>
          <option value="internet_banking">Internet banking</option>
          <option value="crib">CRIB</option>
        </select>
        <div className="ml-auto text-[11.5px] text-muted-foreground">{rows.length} recent requests</div>
      </div>
      <div className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
           style={{ gridTemplateColumns: "0.9fr 0.8fr 0.7fr 1.8fr 0.9fr 0.6fr" }}>
        <div>When</div><div>Channel</div><div>Dir</div><div>Endpoint</div><div>Reference</div><div className="text-right">Status</div>
      </div>
      {isLoading && <div className="p-5 text-[12.5px] text-muted-foreground">Loading…</div>}
      {rows.map((r: any) => (
        <div key={r.id} className="grid items-center text-[12px] py-2.5 px-5 border-b border-row-divider last:border-b-0"
             style={{ gridTemplateColumns: "0.9fr 0.8fr 0.7fr 1.8fr 0.9fr 0.6fr" }}>
          <div className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
          <div className="capitalize">{r.channel.replace("_", " ")}</div>
          <div className="capitalize text-muted-foreground">{r.direction}</div>
          <div className="font-mono text-[11.5px] truncate">{r.method} {r.endpoint}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{r.reference ?? "—"}</div>
          <div className={cn("text-right font-mono font-semibold",
            r.status_code >= 500 ? "text-rose-600" : r.status_code >= 400 ? "text-amber-600" : "text-emerald-700")}>
            {r.status_code}
          </div>
        </div>
      ))}
      {!isLoading && rows.length === 0 && (
        <div className="p-8 text-center text-[12.5px] text-muted-foreground">No API calls recorded yet.</div>
      )}
    </Card>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="text-muted-foreground hover:text-foreground flex-none" title="Copy">
      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
    </button>
  );
}
