import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Plug, Shield, Trash2, Check } from "lucide-react";
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
import { listApiKeys, createApiKey, revokeApiKey, listApiLogs } from "@/lib/api-console.functions";

export const Route = createFileRoute("/_authenticated/api")({
  component: ApiConsole,
});

type Tab = "overview" | "endpoints" | "keys" | "logs";

const SCOPES: { id: string; label: string; hint: string }[] = [
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
  { id: "internet_banking", label: "Internet Banking", hint: "Customer-facing digital channel" },
  { id: "crib", label: "CRIB credit bureau", hint: "Credit information reporting bureau" },
  {
    id: "clients.create",
    label: "Create clients",
    hint: "Onboard customers programmatically from an origination channel",
  },
];

export const ENDPOINTS = [
  {
    channel: "Clients · Create",
    method: "POST",
    path: "/api/public/v1/clients/create",
    scope: "clients.create",
    desc: "Onboard a new client (KYC record + optional bank accounts). Idempotency key optional but recommended.",
  },
  {
    channel: "Transactions · Inbound",
    method: "POST",
    path: "/api/public/v1/transactions/inbound",
    scope: "transactions.inbound",
    desc: "Third parties post credits/debits into a customer account. Returns an internal reference for reconciliation.",
  },
  {
    channel: "Transactions · Outbound",
    method: "POST",
    path: "/api/public/v1/transactions/outbound",
    scope: "transactions.outbound",
    desc: "Queue an outbound transfer to an external bank / wallet account. Idempotency key required.",
  },
  {
    channel: "CEFT",
    method: "POST",
    path: "/api/public/v1/ceft/transfer",
    scope: "ceft",
    desc: "Submit a CEFT (Common Electronic Funds Transfer) message. Same-day clearing within LankaClear cutoff.",
  },
  {
    channel: "ATM Switch",
    method: "POST",
    path: "/api/public/v1/atm/authorize",
    scope: "atm",
    desc: "Authorize an ATM withdrawal, balance inquiry, or mini-statement. Terminal ID + STAN required.",
  },
  {
    channel: "Internet Banking",
    method: "POST",
    path: "/api/public/v1/ib/transaction",
    scope: "internet_banking",
    desc: "Post an internet-banking initiated transaction. Requires device fingerprint and verified OTP.",
  },
  {
    channel: "CRIB",
    method: "POST",
    path: "/api/public/v1/crib/report",
    scope: "crib",
    desc: "Request a Credit Information Bureau report for a national ID. Consent reference required.",
  },
  {
    channel: "Health",
    method: "GET",
    path: "/api/public/v1/health",
    scope: "—",
    desc: "Public health probe. No authentication required — safe for uptime monitors.",
  },
];

function ApiConsole() {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div>
        <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground font-semibold">
          Integration
        </div>
        <div className="text-[18px] font-semibold mt-0.5">API console</div>
        <p className="text-[12.5px] text-muted-foreground mt-1 max-w-2xl">
          REST endpoints for connecting third-party accounts, CEFT clearing, ATM switch, internet
          banking, and CRIB. Bearer-token authenticated over HTTPS.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(
          [
            ["overview", "Overview"],
            ["endpoints", "Endpoints"],
            ["keys", "API keys"],
            ["logs", "Request log"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
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
          <li>
            Open <b>API keys</b> and create a key with the scopes you need (sandbox first).
          </li>
          <li>Copy the secret shown once — store it in your partner system's secrets manager.</li>
          <li>
            Call any endpoint with{" "}
            <code className="font-mono text-[11.5px] bg-muted px-1.5 py-0.5 rounded">
              Authorization: Bearer &lt;key&gt;
            </code>
            .
          </li>
          <li>
            Every call is recorded under <b>Request log</b> for reconciliation & audit.
          </li>
        </ol>
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Base URL
          </div>
          <div className="font-mono text-[12.5px] bg-muted rounded px-3 py-2 flex items-center justify-between">
            <span>{base}/api/public/v1</span>
            <CopyBtn value={`${base}/api/public/v1`} />
          </div>
        </div>
      </Card>
      <Card>
        <CardTitle>Standards</CardTitle>
        <ul className="text-[12.5px] space-y-2 mt-2 text-foreground/85">
          <li className="flex gap-2">
            <Shield size={14} className="text-primary mt-0.5" /> TLS-only, bearer token, per-scope
            authorization
          </li>
          <li className="flex gap-2">
            <Plug size={14} className="text-primary mt-0.5" /> REST + JSON, ISO 4217 currency codes,
            RFC 3339 timestamps
          </li>
          <li className="flex gap-2">
            <KeyRound size={14} className="text-primary mt-0.5" /> Idempotency-Key on all outbound
            money moves
          </li>
          <li className="flex gap-2">
            <Check size={14} className="text-primary mt-0.5" /> Sandbox &amp; Production
            environments per key
          </li>
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
        const spec = endpointSpec(e.scope, e.method);
        const headerLines = spec.headers.map((h) => `  -H "${h.name}: ${h.value}"`).join(" \\\n");
        const curl =
          e.method === "GET"
            ? `curl ${url} \\\n${headerLines}`
            : `curl -X POST ${url} \\\n${headerLines} \\\n  -d '${JSON.stringify(spec.requestExample)}'`;
        return (
          <div key={e.path} className="border-b border-row-divider last:border-b-0">
            <button
              onClick={() => setOpen(isOpen ? null : e.path)}
              className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/40"
            >
              <span
                className={cn(
                  "font-mono text-[10.5px] font-semibold px-1.5 py-0.5 rounded",
                  e.method === "GET"
                    ? "bg-sky-500/10 text-sky-700"
                    : "bg-emerald-500/10 text-emerald-700",
                )}
              >
                {e.method}
              </span>
              <span className="font-mono text-[12.5px]">{e.path}</span>
              <span className="text-[11.5px] text-muted-foreground ml-2 flex-1 truncate">
                {e.desc}
              </span>
              <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {e.scope}
              </span>
            </button>
            {isOpen && (
              <div className="px-5 pb-5 flex flex-col gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mt-2 mb-1">
                    Channel
                  </div>
                  <div className="text-[13px]">{e.channel}</div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                    Required headers
                  </div>
                  <div className="border border-border rounded-md overflow-hidden">
                    <div
                      className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-2 px-3 bg-secondary/40 border-b border-border"
                      style={{ gridTemplateColumns: "1fr 1.4fr 0.5fr" }}
                    >
                      <div>Header</div>
                      <div>Example value</div>
                      <div>Required</div>
                    </div>
                    {spec.headers.map((h) => (
                      <div
                        key={h.name}
                        className="grid items-center text-[12px] py-2 px-3 border-b border-row-divider last:border-b-0"
                        style={{ gridTemplateColumns: "1fr 1.4fr 0.5fr" }}
                      >
                        <div className="font-mono">{h.name}</div>
                        <div className="font-mono text-muted-foreground truncate">{h.value}</div>
                        <div
                          className={cn(
                            "text-[11px] font-semibold",
                            h.required ? "text-emerald-700" : "text-muted-foreground",
                          )}
                        >
                          {h.required ? "Yes" : "Optional"}
                        </div>
                      </div>
                    ))}
                  </div>
                  {spec.idempotency && (
                    <div className="mt-2 text-[11.5px] text-foreground/80 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                      <b>Idempotency:</b> {spec.idempotency}
                    </div>
                  )}
                </div>

                {spec.requestExample !== null && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                      Request body
                    </div>
                    <pre className="font-mono text-[11.5px] bg-muted rounded p-3 whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(spec.requestExample, null, 2)}
                    </pre>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Response · {spec.responseStatus}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      Content-Type: application/json
                    </div>
                  </div>
                  <pre className="font-mono text-[11.5px] bg-muted rounded p-3 whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(spec.responseExample, null, 2)}
                  </pre>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    Error responses
                  </div>
                  <div className="border border-border rounded-md overflow-hidden">
                    <div
                      className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-2 px-3 bg-secondary/40 border-b border-border"
                      style={{ gridTemplateColumns: "0.4fr 0.7fr 1.6fr" }}
                    >
                      <div>Code</div>
                      <div>Error</div>
                      <div>Meaning</div>
                    </div>
                    {spec.errors.map((er) => (
                      <div
                        key={er.code + er.error}
                        className="grid items-start text-[12px] py-2 px-3 border-b border-row-divider last:border-b-0"
                        style={{ gridTemplateColumns: "0.4fr 0.7fr 1.6fr" }}
                      >
                        <div className="font-mono font-semibold">{er.code}</div>
                        <div className="font-mono text-muted-foreground">{er.error}</div>
                        <div className="text-foreground/85">{er.meaning}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    cURL
                  </div>
                  <pre className="font-mono text-[11.5px] bg-muted rounded p-3 whitespace-pre-wrap overflow-x-auto">
                    {curl}
                  </pre>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

type HeaderSpec = { name: string; value: string; required: boolean };
type EndpointSpec = {
  headers: HeaderSpec[];
  idempotency: string | null;
  requestExample: unknown | null;
  responseStatus: string;
  responseExample: unknown;
  errors: { code: number; error: string; meaning: string }[];
};

const COMMON_ERRORS = [
  {
    code: 400,
    error: "validation_failed",
    meaning: "Request body failed schema validation. See `details` for field-level errors.",
  },
  {
    code: 401,
    error: "missing_bearer_token",
    meaning: "Authorization header missing, malformed, or key revoked.",
  },
  {
    code: 403,
    error: "insufficient_scope",
    meaning: "API key is valid but does not include the scope required for this endpoint.",
  },
  {
    code: 429,
    error: "rate_limited",
    meaning: "Too many requests. Back off and retry after the `Retry-After` header.",
  },
  {
    code: 500,
    error: "internal_error",
    meaning: "Unexpected server error. Safe to retry idempotent calls.",
  },
];

function endpointSpec(scope: string, method: string): EndpointSpec {
  const bearer: HeaderSpec = {
    name: "Authorization",
    value: "Bearer sk_live_a1b2c3…",
    required: true,
  };
  const contentType: HeaderSpec = {
    name: "Content-Type",
    value: "application/json",
    required: method !== "GET",
  };
  const accept: HeaderSpec = { name: "Accept", value: "application/json", required: false };
  const idem: HeaderSpec = {
    name: "Idempotency-Key",
    value: "req-2026-07-12-abc123",
    required: true,
  };

  const nowIso = "2026-07-12T10:15:30Z";

  switch (scope) {
    case "transactions.inbound":
      return {
        headers: [
          bearer,
          contentType,
          accept,
          { ...idem, required: false, value: "partner-evt-88213" },
        ],
        idempotency:
          "Optional. When supplied, repeated calls with the same key within 24h return the original response instead of creating a duplicate credit.",
        requestExample: {
          external_reference: "PARTNER-9821",
          counterparty: { name: "Acme Ltd", account: "0011223344", bank_code: "7010" },
          amount: 15000,
          currency: "LKR",
          narrative: "Salary credit",
          value_date: "2026-07-12",
        },
        responseStatus: "202 Accepted",
        responseExample: {
          status: "accepted",
          reference: "INB-20260712-0001",
          received_at: nowIso,
          counterparty: { name: "Acme Ltd", account: "0011223344" },
          amount: 15000,
          currency: "LKR",
        },
        errors: COMMON_ERRORS,
      };
    case "transactions.outbound":
      return {
        headers: [bearer, contentType, accept, idem],
        idempotency:
          "Required. Reusing the same `Idempotency-Key` within 24h returns the original queued response — the transfer is never submitted twice, even on retries after network failure.",
        requestExample: {
          source_account: "1002200330",
          destination: { name: "Jane Doe", account: "0099887766", bank_code: "7010" },
          amount: 4500,
          currency: "LKR",
          narrative: "Vendor payout",
          idempotency_key: "req-abc-123",
        },
        responseStatus: "202 Accepted",
        responseExample: {
          status: "queued",
          reference: "OUT-20260712-0007",
          idempotency_key: "req-abc-123",
          submitted_at: nowIso,
        },
        errors: [
          ...COMMON_ERRORS,
          {
            code: 409,
            error: "idempotency_conflict",
            meaning: "Same `Idempotency-Key` reused with a different request body.",
          },
        ],
      };
    case "ceft":
      return {
        headers: [
          bearer,
          contentType,
          accept,
          { ...idem, required: false, value: "ceft-20260712-01" },
        ],
        idempotency:
          "Optional but recommended. LankaClear rejects duplicate `session_id` submissions — pair each session_id with a matching Idempotency-Key.",
        requestExample: {
          transaction_type: "credit",
          originator: { name: "Mzizi Finance", account: "1000200030", bank_code: "7010" },
          beneficiary: { name: "Sam Perera", account: "2000300040", bank_code: "7135" },
          amount: 25000,
          currency: "LKR",
          session_id: "S-20260712-01",
          narrative: "Loan disbursement",
        },
        responseStatus: "202 Accepted",
        responseExample: {
          status: "accepted",
          ceft_reference: "CEFT-20260712-0031",
          session_id: "S-20260712-01",
          cleared_at: null,
        },
        errors: COMMON_ERRORS,
      };
    case "atm":
      return {
        headers: [
          bearer,
          contentType,
          accept,
          { name: "X-Terminal-Id", value: "TERM-045", required: true },
          idem,
        ],
        idempotency:
          "Required. Every ATM message carries a STAN (System Trace Audit Number); the STAN plus `Idempotency-Key` guarantees at-most-once authorization.",
        requestExample: {
          terminal_id: "TERM-045",
          card_pan_masked: "411111******1234",
          transaction_type: "withdrawal",
          amount: 10000,
          currency: "LKR",
          stan: "004587",
        },
        responseStatus: "200 OK",
        responseExample: {
          status: "approved",
          authorization_code: "A7Q9K2",
          stan: "004587",
          balance_after: 87250,
          currency: "LKR",
          processed_at: nowIso,
        },
        errors: [
          ...COMMON_ERRORS,
          {
            code: 402,
            error: "insufficient_funds",
            meaning: "Card account balance below requested amount.",
          },
          {
            code: 423,
            error: "card_blocked",
            meaning: "Card is frozen, expired, or reported lost.",
          },
        ],
      };
    case "internet_banking":
      return {
        headers: [
          bearer,
          contentType,
          accept,
          { name: "X-Device-Fingerprint", value: "fp-9a1b2c3d", required: true },
          idem,
        ],
        idempotency:
          "Required. Protects against double-submits from browser retries. Reusing an `Idempotency-Key` within 24h returns the original transaction result.",
        requestExample: {
          customer_id: "CUS-1102",
          channel: "internet_banking",
          action: "loan_repayment",
          amount: 8500,
          currency: "LKR",
          source_account: "1001",
          device_fingerprint: "fp-9a1b2c3d",
          otp_verified: true,
        },
        responseStatus: "200 OK",
        responseExample: {
          status: "posted",
          reference: "IB-20260712-0142",
          posted_at: nowIso,
          new_balance: 122400,
          currency: "LKR",
        },
        errors: [
          ...COMMON_ERRORS,
          {
            code: 401,
            error: "otp_required",
            meaning: "`otp_verified` was false or the OTP session expired.",
          },
        ],
      };
    case "crib":
      return {
        headers: [
          bearer,
          contentType,
          accept,
          { name: "X-Consent-Reference", value: "CNSNT-4471", required: true },
        ],
        idempotency:
          "Not applicable. CRIB report requests are read-only lookups; repeat calls simply re-query the bureau (each call is billed).",
        requestExample: {
          national_id: "199012345678",
          purpose: "loan_application",
          consent_reference: "CNSNT-4471",
        },
        responseStatus: "200 OK",
        responseExample: {
          status: "ok",
          national_id: "199012345678",
          score: 742,
          band: "A",
          active_facilities: 3,
          delinquencies_12m: 0,
          report_generated_at: nowIso,
          report_url: "https://crib.example/reports/rpt-9f2a.pdf",
        },
        errors: [
          ...COMMON_ERRORS,
          {
            code: 404,
            error: "subject_not_found",
            meaning: "No CRIB record exists for the supplied national ID.",
          },
          {
            code: 451,
            error: "consent_invalid",
            meaning: "`consent_reference` expired, revoked, or does not match the subject.",
          },
        ],
      };
    case "clients.create":
      return {
        headers: [
          bearer,
          contentType,
          accept,
          { ...idem, required: false, value: "client-onboard-2026-07-12-001" },
        ],
        idempotency:
          "Optional but recommended. When supplied, repeated calls with the same key within 24h return the original client_id — the same customer is never onboarded twice, even if the origination channel retries.",
        requestExample: {
          first_name: "Nimal",
          last_name: "Perera",
          phone_country_code: "+94",
          phone: "771234567",
          national_id: "199012345678",
          date_of_birth: "1990-05-14",
          gender: "male",
          address: "24 Galle Road, Colombo 03",
          gn_division: "Kollupitiya",
          divisional_secretariat: "Thimbirigasyaya",
          district: "Colombo",
          province: "Western",
          email: "nimal.perera@example.com",
          branch_id: "8d2f8017-1111-2222-3333-444455556666",
          bank_accounts: [
            {
              bank_name: "Bank of Ceylon",
              branch_name: "Colombo Fort",
              account_no: "0011223344",
              account_name: "Nimal Perera",
              is_primary: true,
            },
          ],
        },
        responseStatus: "201 Created",
        responseExample: {
          status: "created",
          client_id: "b1a2c3d4-e5f6-4789-a012-3456789abcde",
          full_name: "Nimal Perera",
          phone: "+94771234567",
          national_id: "199012345678",
          branch_id: "8d2f8017-1111-2222-3333-444455556666",
          status_code: "active",
          created_at: nowIso,
        },
        errors: [
          ...COMMON_ERRORS,
          {
            code: 409,
            error: "duplicate_client",
            meaning:
              "A client with the same `national_id` already exists in this company. Retrieve the existing client instead of retrying create.",
          },
          {
            code: 422,
            error: "branch_not_found",
            meaning: "`branch_id` does not belong to this company or has been deactivated.",
          },
        ],
      };
    default:
      // health
      return {
        headers: [accept],
        idempotency: null,
        requestExample: null,
        responseStatus: "200 OK",
        responseExample: { status: "ok", time: nowIso, version: "v1" },
        errors: [
          {
            code: 503,
            error: "service_unavailable",
            meaning: "Backend dependency (database or clearing switch) is unreachable.",
          },
        ],
      };
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
    onSuccess: () => {
      toast.success("Key revoked");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card padded={false}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="text-[13.5px] font-semibold">API keys</div>
            <div className="text-[11.5px] text-muted-foreground">
              Only company admins and platform admins can create keys.
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
            No API keys yet — create one to start integrating.
          </div>
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
    onSuccess: (r) => {
      setIssued({ secret: r.secret, prefix: r.key.key_prefix });
      qc.invalidateQueries({ queryKey: ["api-keys"] });
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
                onChange={(e) => setEnvironment(e.target.value as any)}
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </FormField>
            <FormField label="Scopes" required span={12}>
              <div className="grid grid-cols-2 gap-2">
                {SCOPES.map((s) => {
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

function LogsTab() {
  const fn = useServerFn(listApiLogs);
  const [channel, setChannel] = useState<string>("");
  const { data, isLoading } = useQuery({
    queryKey: ["api-logs", channel],
    queryFn: () => fn({ data: { channel: channel || undefined, limit: 100 } }),
  });
  const rows = useMemo(() => data?.logs ?? [], [data]);
  return (
    <Card padded={false}>
      <div className="p-4 flex items-center gap-3 border-b border-border">
        <select
          className={selectCls + " w-52"}
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
          <option value="">All channels</option>
          <option value="transactions">Transactions</option>
          <option value="ceft">CEFT</option>
          <option value="atm">ATM</option>
          <option value="internet_banking">Internet banking</option>
          <option value="crib">CRIB</option>
        </select>
        <div className="ml-auto text-[11.5px] text-muted-foreground">
          {rows.length} recent requests
        </div>
      </div>
      <div
        className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
        style={{ gridTemplateColumns: "0.9fr 0.8fr 0.7fr 1.8fr 0.9fr 0.6fr" }}
      >
        <div>When</div>
        <div>Channel</div>
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
          style={{ gridTemplateColumns: "0.9fr 0.8fr 0.7fr 1.8fr 0.9fr 0.6fr" }}
        >
          <div className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
          <div className="capitalize">{r.channel.replace("_", " ")}</div>
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
            {r.status_code}
          </div>
        </div>
      ))}
      {!isLoading && rows.length === 0 && (
        <div className="p-8 text-center text-[12.5px] text-muted-foreground">
          No API calls recorded yet.
        </div>
      )}
    </Card>
  );
}

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
