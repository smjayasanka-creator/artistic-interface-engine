import { BookOpen, Download, FileJson, Rocket, Webhook, Shield, RefreshCw } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";
import { buildOpenApiDocument, buildPostmanCollection, downloadJson } from "@/lib/api-openapi";

type Env = "sandbox" | "production";

const GUIDES = [
  {
    icon: Rocket,
    title: "Onboard your first customer",
    body: (
      <ol className="list-decimal list-inside space-y-1.5">
        <li>Create a sandbox API key with the <code className="font-mono text-[11px] bg-muted px-1 rounded">clients.create</code> scope.</li>
        <li>POST to <code className="font-mono text-[11px] bg-muted px-1 rounded">/api/public/v1/clients/create</code> with a unique <code className="font-mono text-[11px] bg-muted px-1 rounded">Idempotency-Key</code>.</li>
        <li>Subscribe your webhook endpoint to the <code className="font-mono text-[11px] bg-muted px-1 rounded">client.created</code> event to receive real-time confirmation.</li>
        <li>Retry with the same idempotency key on any 5xx — the platform de-duplicates automatically.</li>
      </ol>
    ),
  },
  {
    icon: Webhook,
    title: "Verify a webhook signature",
    body: (
      <div className="space-y-2">
        <p>Every delivery includes <code className="font-mono text-[11px] bg-muted px-1 rounded">X-Webhook-Signature: t=&lt;ts&gt;,v1=&lt;hex&gt;</code>. Recompute HMAC-SHA256 over <code className="font-mono text-[11px] bg-muted px-1 rounded">{"`${t}.${rawBody}`"}</code> with your endpoint secret and compare in constant time.</p>
        <pre className="font-mono text-[11px] bg-muted rounded p-3 overflow-x-auto">{`import crypto from "crypto";

const [tPart, vPart] = req.headers["x-webhook-signature"].split(",");
const t = tPart.split("=")[1];
const v1 = vPart.split("=")[1];
const expected = crypto
  .createHmac("sha256", process.env.WEBHOOK_SECRET)
  .update(\`\${t}.\${rawBody}\`)
  .digest("hex");
if (!crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected))) {
  return res.status(401).end();
}`}</pre>
      </div>
    ),
  },
  {
    icon: RefreshCw,
    title: "Handle retries safely",
    body: (
      <ul className="list-disc list-inside space-y-1.5">
        <li>Money-moving endpoints require an <code className="font-mono text-[11px] bg-muted px-1 rounded">Idempotency-Key</code>. A replay within 24h returns the original response.</li>
        <li>Same key with a different body returns <b>409 idempotency_conflict</b>.</li>
        <li>On 429, honor the <code className="font-mono text-[11px] bg-muted px-1 rounded">Retry-After</code> header.</li>
        <li>Webhook deliveries retry with backoff 1m → 5m → 30m → 2h → 12h; after <code className="font-mono text-[11px] bg-muted px-1 rounded">max_attempts</code> they land in the dead-letter queue.</li>
      </ul>
    ),
  },
  {
    icon: Shield,
    title: "Sandbox vs production isolation",
    body: (
      <p>
        Sandbox and production share no data. Keys, mapping templates,
        webhooks and logs are all scoped by the environment inferred from the
        key prefix (<code className="font-mono text-[11px] bg-muted px-1 rounded">mz_test_</code> vs{" "}
        <code className="font-mono text-[11px] bg-muted px-1 rounded">mz_live_</code>). Mixing keys across
        envs always fails auth — you cannot accidentally move real money from a sandbox integration.
      </p>
    ),
  },
];

export function ApiGuidesTab({ env: _env }: { env: Env }) {
  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/v1`
      : "https://your-app.example/api/public/v1";

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2 flex flex-col gap-3">
        {GUIDES.map((g) => {
          const Icon = g.icon;
          return (
            <Card key={g.title}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold">{g.title}</div>
                  <div className="text-[12.5px] text-foreground/85 mt-2 leading-relaxed">
                    {g.body}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <Card>
          <CardTitle>Download specs</CardTitle>
          <p className="text-[12.5px] text-muted-foreground mt-1">
            Auto-generated from the live contract registry — never drifts from the wire.
          </p>
          <div className="flex flex-col gap-2 mt-3">
            <button
              className={cn(btnPrimaryCls, "gap-2 justify-center")}
              onClick={() =>
                downloadJson("mzizi-openapi.json", buildOpenApiDocument(baseUrl))
              }
            >
              <FileJson size={14} /> OpenAPI 3.1 (JSON)
            </button>
            <button
              className={cn(btnSecondaryCls, "gap-2 justify-center")}
              onClick={() =>
                downloadJson(
                  "mzizi-postman-collection.json",
                  buildPostmanCollection(baseUrl),
                )
              }
            >
              <Download size={14} /> Postman collection
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground mt-3">
            Base URL: <code className="font-mono">{baseUrl}</code>
          </div>
        </Card>

        <Card>
          <CardTitle>Learn more</CardTitle>
          <ul className="text-[12.5px] space-y-2 mt-2 text-foreground/85">
            <li className="flex gap-2">
              <BookOpen size={14} className="text-primary mt-0.5 shrink-0" />
              Every endpoint's full schema, error catalogue and emitted webhook
              events lives under the <b>API explorer</b> tab.
            </li>
            <li className="flex gap-2">
              <BookOpen size={14} className="text-primary mt-0.5 shrink-0" />
              Field-by-field payload docs — including PII flags — are in the{" "}
              <b>Data catalogue</b>.
            </li>
            <li className="flex gap-2">
              <BookOpen size={14} className="text-primary mt-0.5 shrink-0" />
              Map partner field names to platform fields in the{" "}
              <b>Field mapping</b> studio (deterministic + AI fallback).
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
