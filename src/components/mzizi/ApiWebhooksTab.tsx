import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Plus, Send, RotateCw, Trash2, Check, X } from "lucide-react";
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
  listWebhookEndpoints,
  createWebhookEndpoint,
  updateWebhookEndpoint,
  rotateWebhookSecret,
  deleteWebhookEndpoint,
  sendTestWebhook,
  listWebhookDeliveries,
} from "@/lib/webhooks.functions";

type Env = "sandbox" | "production";

export function ApiWebhooksTab({ env }: { env: Env }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWebhookEndpoints);
  const delListFn = useServerFn(listWebhookDeliveries);
  const createFn = useServerFn(createWebhookEndpoint);
  const updateFn = useServerFn(updateWebhookEndpoint);
  const rotateFn = useServerFn(rotateWebhookSecret);
  const deleteFn = useServerFn(deleteWebhookEndpoint);
  const testFn = useServerFn(sendTestWebhook);

  const { data } = useQuery({
    queryKey: ["webhook-endpoints", env],
    queryFn: () => listFn({ data: { env } }),
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "success" | "failed" | "dead_letter">("all");
  const [endpointFilter, setEndpointFilter] = useState<string>("all");
  const { data: dels } = useQuery({
    queryKey: ["webhook-deliveries", env, endpointFilter, statusFilter],
    queryFn: () =>
      delListFn({
        data: {
          env,
          endpoint_id: endpointFilter === "all" ? undefined : endpointFilter,
          status: statusFilter === "all" ? undefined : (statusFilter as any),
          limit: 100,
        },
      }),
    refetchInterval: 15_000,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [freshSecret, setFreshSecret] = useState<{ label: string; secret: string } | null>(null);

  const create = useMutation({
    mutationFn: (v: any) => createFn({ data: v }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["webhook-endpoints", env] });
      setShowAdd(false);
      setFreshSecret({ label: r.endpoint.label, secret: r.secret });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const rotate = useMutation({
    mutationFn: (id: string) => rotateFn({ data: { id } }),
    onSuccess: (r, id) => {
      const ep = data?.endpoints.find((e: any) => e.id === id);
      setFreshSecret({ label: ep?.label ?? "webhook", secret: r.secret });
      qc.invalidateQueries({ queryKey: ["webhook-endpoints", env] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; status: "active" | "disabled" }) =>
      updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-endpoints", env] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook-endpoints", env] });
      qc.invalidateQueries({ queryKey: ["webhook-deliveries", env] });
    },
  });

  const test = useMutation({
    mutationFn: (id: string) => testFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Ping queued — check delivery log");
      qc.invalidateQueries({ queryKey: ["webhook-deliveries", env] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const endpoints = data?.endpoints ?? [];
  const events = data?.events ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card padded={false}>
        <div className="flex items-center gap-3 p-3 border-b border-border">
          <div className="text-[13px] font-semibold">Endpoints · {env}</div>
          <div className="text-[11.5px] text-muted-foreground">
            HMAC-SHA256 signed · retry queue (1m→5m→30m→2h→12h) · dead-letter after max attempts
          </div>
          <button
            className={cn(btnPrimaryCls, "ml-auto text-[12px]")}
            onClick={() => setShowAdd(true)}
          >
            <Plus size={13} className="mr-1" /> New endpoint
          </button>
        </div>
        {endpoints.length === 0 && (
          <div className="p-8 text-center text-[12.5px] text-muted-foreground">
            No endpoints yet. Add one to start receiving events.
          </div>
        )}
        {endpoints.map((e: any) => (
          <div
            key={e.id}
            className="grid grid-cols-[1fr_auto] gap-2 items-center px-4 py-3 border-b border-row-divider last:border-b-0"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-[13px] font-semibold">{e.label}</div>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase",
                    e.status === "active"
                      ? "bg-emerald-500/10 text-emerald-700"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {e.status}
                </span>
                <code className="font-mono text-[10.5px] text-muted-foreground">
                  {e.secret_prefix}…
                </code>
              </div>
              <div className="font-mono text-[11.5px] text-foreground/80 truncate">{e.url}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {e.events.map((ev: string) => (
                  <span
                    key={ev}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                  >
                    {ev}
                  </span>
                ))}
              </div>
              <div className="text-[10.5px] text-muted-foreground mt-1">
                {e.last_delivery_at
                  ? `Last delivery ${shortDate(e.last_delivery_at)}`
                  : "No deliveries yet"}
                {" · "}timeout {e.timeout_ms}ms · retry ≤ {e.max_attempts}×
              </div>
            </div>
            <div className="flex items-center gap-1">
              <IconBtn title="Send test ping" onClick={() => test.mutate(e.id)}>
                <Send size={13} />
              </IconBtn>
              <IconBtn title="Rotate secret" onClick={() => rotate.mutate(e.id)}>
                <RotateCw size={13} />
              </IconBtn>
              <IconBtn
                title={e.status === "active" ? "Disable" : "Enable"}
                onClick={() =>
                  toggle.mutate({
                    id: e.id,
                    status: e.status === "active" ? "disabled" : "active",
                  })
                }
              >
                {e.status === "active" ? <X size={13} /> : <Check size={13} />}
              </IconBtn>
              <IconBtn
                title="Delete"
                onClick={() => {
                  if (confirm(`Delete webhook "${e.label}"? Deliveries will be removed too.`))
                    del.mutate(e.id);
                }}
              >
                <Trash2 size={13} />
              </IconBtn>
            </div>
          </div>
        ))}
      </Card>

      <Card padded={false}>
        <div className="flex items-center gap-2 p-3 border-b border-border">
          <div className="text-[13px] font-semibold">Delivery log</div>
          <select
            className={cn(selectCls, "w-48 ml-auto")}
            value={endpointFilter}
            onChange={(e) => setEndpointFilter(e.target.value)}
          >
            <option value="all">All endpoints</option>
            {endpoints.map((e: any) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <select
            className={cn(selectCls, "w-40")}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">Any status</option>
            <option value="pending">Pending</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="dead_letter">Dead letter</option>
          </select>
        </div>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-2 px-4 bg-secondary/40 border-b border-border"
          style={{ gridTemplateColumns: "1.2fr 1fr 0.5fr 0.8fr 0.6fr 0.7fr 1.2fr" }}
        >
          <div>When</div>
          <div>Event</div>
          <div>Attempt</div>
          <div>Status</div>
          <div>Code</div>
          <div>Latency</div>
          <div>Response</div>
        </div>
        {(dels?.deliveries ?? []).length === 0 && (
          <div className="p-6 text-center text-[12px] text-muted-foreground">
            No deliveries yet — press the send-test icon on an endpoint.
          </div>
        )}
        {(dels?.deliveries ?? []).map((d: any) => (
          <div
            key={d.id}
            className="grid text-[11.5px] py-2 px-4 border-b border-row-divider last:border-b-0"
            style={{ gridTemplateColumns: "1.2fr 1fr 0.5fr 0.8fr 0.6fr 0.7fr 1.2fr" }}
          >
            <div>{shortDate(d.created_at)}</div>
            <div className="font-mono">{d.event_type}</div>
            <div>{d.attempt}</div>
            <div>
              <span
                className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase",
                  d.status === "success" && "bg-emerald-500/10 text-emerald-700",
                  d.status === "pending" && "bg-sky-500/10 text-sky-700",
                  d.status === "failed" && "bg-amber-500/10 text-amber-700",
                  d.status === "dead_letter" && "bg-rose-500/10 text-rose-700",
                )}
              >
                {d.status}
              </span>
            </div>
            <div className="font-mono">{d.status_code ?? "—"}</div>
            <div>{d.response_ms ? `${d.response_ms}ms` : "—"}</div>
            <div className="font-mono text-muted-foreground truncate" title={d.response_snippet ?? ""}>
              {d.response_snippet ?? "—"}
            </div>
          </div>
        ))}
      </Card>

      {showAdd && (
        <AddEndpointModal
          env={env}
          events={events}
          onClose={() => setShowAdd(false)}
          onSubmit={(v) => create.mutate(v)}
          submitting={create.isPending}
        />
      )}
      {freshSecret && (
        <SecretRevealModal
          label={freshSecret.label}
          secret={freshSecret.secret}
          onClose={() => setFreshSecret(null)}
        />
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-7 w-7 flex items-center justify-center rounded border border-border hover:bg-muted"
    >
      {children}
    </button>
  );
}

function AddEndpointModal({
  env,
  events,
  onClose,
  onSubmit,
  submitting,
}: {
  env: Env;
  events: string[];
  onClose: () => void;
  onSubmit: (v: any) => void;
  submitting: boolean;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [timeout_ms, setTimeout] = useState(10000);
  const [max_attempts, setMaxAttempts] = useState(5);

  return (
    <Modal open onClose={onClose} title={`New webhook · ${env}`} widthClass="max-w-lg">
      <FormGrid>
        <FormField label="Label" span={2}>
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ops notifier" />
        </FormField>
        <FormField label="URL (https only)" span={2}>
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.partner.com/hooks/mzizi" />
        </FormField>
        <FormField label="Events" span={2}>
          <div className="border border-border rounded-md p-2 max-h-40 overflow-y-auto flex flex-wrap gap-1.5">
            {events.map((ev) => {
              const on = selected.includes(ev);
              return (
                <button
                  type="button"
                  key={ev}
                  onClick={() =>
                    setSelected((s) => (on ? s.filter((x) => x !== ev) : [...s, ev]))
                  }
                  className={cn(
                    "text-[11px] font-mono px-2 py-1 rounded border",
                    on
                      ? "bg-primary/10 text-primary border-primary/40"
                      : "bg-card text-muted-foreground border-border hover:text-foreground",
                  )}
                >
                  {ev}
                </button>
              );
            })}
          </div>
        </FormField>
        <FormField label="Timeout (ms)">
          <input
            type="number"
            min={1000}
            max={30000}
            className={inputCls}
            value={timeout_ms}
            onChange={(e) => setTimeout(Number(e.target.value))}
          />
        </FormField>
        <FormField label="Max attempts">
          <input
            type="number"
            min={1}
            max={20}
            className={inputCls}
            value={max_attempts}
            onChange={(e) => setMaxAttempts(Number(e.target.value))}
          />
        </FormField>
      </FormGrid>
      <FormActions>
        <button className={btnSecondaryCls} onClick={onClose}>
          Cancel
        </button>
        <button
          className={btnPrimaryCls}
          disabled={submitting || !label || !url || selected.length === 0}
          onClick={() =>
            onSubmit({ env, label, url, events: selected, timeout_ms, max_attempts })
          }
        >
          {submitting ? "Creating…" : "Create endpoint"}
        </button>
      </FormActions>
    </Modal>
  );
}

function SecretRevealModal({
  label,
  secret,
  onClose,
}: {
  label: string;
  secret: string;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={`Signing secret · ${label}`} widthClass="max-w-lg">
      <div className="text-[12.5px] text-foreground/85">
        Copy this secret now — for security we won't show it again. Verify each request by
        computing <code className="font-mono">HMAC-SHA256(secret, `${"${timestamp}"}.${"${body}"}`)</code>{" "}
        and comparing to the <code className="font-mono">X-Webhook-Signature</code> header.
      </div>
      <div className="font-mono text-[12.5px] bg-muted rounded-md px-3 py-2 mt-3 flex items-center justify-between gap-2">
        <span className="truncate">{secret}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(secret);
            toast.success("Copied");
          }}
          className="h-7 w-7 flex items-center justify-center rounded border border-border hover:bg-card"
        >
          <Copy size={12} />
        </button>
      </div>
      <FormActions>
        <button className={btnPrimaryCls} onClick={onClose}>
          I've stored it
        </button>
      </FormActions>
    </Modal>
  );
}
