import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  getAdmin,
  getAllLoanProducts,
  createLoanProduct,
  toggleLoanProduct,
} from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Avatar } from "@/components/mzizi/Avatar";
import { Badge } from "@/components/mzizi/Badge";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FREQ_META, type Frequency, type InterestMethod } from "@/lib/loan-schedule";

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
});

type Tab = "branch" | "products";

function Admin() {
  const [tab, setTab] = useState<Tab>("branch");
  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="flex gap-1 border-b border-border">
        {(
          [
            ["branch", "Branch & staff"],
            ["products", "Loan products"],
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
      {tab === "branch" ? <BranchTab /> : <ProductsTab />}
    </div>
  );
}

function BranchTab() {
  const fn = useServerFn(getAdmin);
  const { data } = useQuery({ queryKey: ["admin"], queryFn: () => fn() });
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardTitle>Branch summary</CardTitle>
        <div className="grid grid-cols-6 gap-4 text-[13px]">
          {[
            ["Code", data.branch?.code ?? "—"],
            ["Region", data.branch?.region ?? "—"],
            ["Staff", String(data.staff.length)],
            ["Active clients", String(data.activeClients)],
            ["Portfolio", money(data.portfolio)],
            ["Opened", shortDate(data.branch?.opened_on)],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{k}</div>
              <div className="font-mono font-semibold mt-1">{v}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card padded={false}>
        <div className="px-5 pt-4 pb-3 text-sm font-semibold">Staff</div>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-y border-border bg-secondary/40"
          style={{ gridTemplateColumns: "2fr 1.2fr 1.5fr .8fr" }}
        >
          <div>Name</div>
          <div>Role</div>
          <div>Email</div>
          <div>Status</div>
        </div>
        {data.staff.map((s: any) => (
          <div
            key={s.id}
            className="grid items-center text-[13px] py-3 px-5 border-b border-row-divider last:border-b-0"
            style={{ gridTemplateColumns: "2fr 1.2fr 1.5fr .8fr" }}
          >
            <div className="flex items-center gap-2.5 font-semibold">
              <Avatar name={s.full_name} />
              {s.full_name}
            </div>
            <div className="capitalize text-secondary-foreground">{(s.role ?? "").replace("_", " ")}</div>
            <div className="text-muted-foreground truncate">{s.email ?? "—"}</div>
            <div>
              <Badge tone={s.is_active ? "active" : "neutral"}>{s.is_active ? "Active" : "Inactive"}</Badge>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function ProductsTab() {
  const listFn = useServerFn(getAllLoanProducts);
  const { data: products } = useQuery({ queryKey: ["loan_products", "all"], queryFn: () => listFn() });
  const qc = useQueryClient();
  const createFn = useServerFn(createLoanProduct);
  const toggleFn = useServerFn(toggleLoanProduct);

  const [form, setForm] = useState({
    name: "",
    minRate: "",
    maxRate: "",
    minTerm: "1",
    maxTerm: "12",
    minPrincipal: "1000",
    maxPrincipal: "",
    frequency: "monthly" as Frequency,
    method: "flat" as InterestMethod,
    processingFee: "0",
  });

  const create = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Product created");
      qc.invalidateQueries({ queryKey: ["loan_products", "all"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setForm({ ...form, name: "", minRate: "", maxRate: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: toggleFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loan_products", "all"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const minRate = Number(form.minRate);
    const maxRate = form.maxRate ? Number(form.maxRate) : undefined;
    if (!form.name.trim() || !minRate) {
      toast.error("Name and min rate required");
      return;
    }
    create.mutate({
      data: {
        name: form.name.trim(),
        annual_rate_pct: minRate,
        max_annual_rate_pct: maxRate,
        min_term_months: Number(form.minTerm),
        max_term_months: Number(form.maxTerm),
        min_principal: Number(form.minPrincipal),
        max_principal: form.maxPrincipal ? Number(form.maxPrincipal) : null,
        frequency: form.frequency,
        interest_method: form.method,
        processing_fee_pct: Number(form.processingFee || 0),
      },
    });
  }

  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-5">
      <Card padded={false}>
        <div className="px-5 pt-4 pb-3 text-sm font-semibold flex items-center justify-between">
          <span>Loan products</span>
          <span className="text-[11px] text-muted-foreground font-normal">{products?.length ?? 0} total</span>
        </div>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-y border-border bg-secondary/40"
          style={{ gridTemplateColumns: "1.4fr .7fr 1fr 1fr .8fr .5fr" }}
        >
          <div>Name</div>
          <div>Rate</div>
          <div>Term</div>
          <div>Principal</div>
          <div>Frequency</div>
          <div className="text-right">Status</div>
        </div>
        {(products ?? []).map((p: any) => (
          <div
            key={p.id}
            className="grid items-center text-[12.5px] py-3 px-5 border-b border-row-divider last:border-b-0"
            style={{ gridTemplateColumns: "1.4fr .7fr 1fr 1fr .8fr .5fr" }}
          >
            <div className="font-semibold flex items-center gap-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: p.color ?? "#0f766e" }}
              />
              {p.name}
            </div>
            <div className="font-mono">{p.annual_rate_pct}%</div>
            <div className="font-mono text-secondary-foreground">
              {p.min_term_months}–{p.max_term_months} mo
            </div>
            <div className="font-mono text-secondary-foreground">
              {money(p.min_principal)}–{p.max_principal ? money(p.max_principal) : "∞"}
            </div>
            <div className="capitalize text-secondary-foreground">{FREQ_META[p.frequency as Frequency]?.label ?? p.frequency}</div>
            <div className="text-right">
              <button
                onClick={() => toggle.mutate({ data: { id: p.id, is_active: !p.is_active } })}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full border",
                  p.is_active
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                    : "border-muted bg-muted text-muted-foreground",
                )}
              >
                {p.is_active ? "Active" : "Off"}
              </button>
            </div>
          </div>
        ))}
        {(products ?? []).length === 0 && (
          <div className="text-center text-faint text-sm py-8">No products yet.</div>
        )}
      </Card>

      <Card>
        <CardTitle>New loan product</CardTitle>
        <form onSubmit={submit} className="flex flex-col gap-3 text-[12.5px]">
          <Field label="Product name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Kilimo Boost"
              className="input"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min rate (%/yr)">
              <input
                type="number"
                step="0.01"
                value={form.minRate}
                onChange={(e) => setForm({ ...form, minRate: e.target.value })}
                className="input font-mono"
                required
              />
            </Field>
            <Field label="Max rate (%/yr)">
              <input
                type="number"
                step="0.01"
                value={form.maxRate}
                onChange={(e) => setForm({ ...form, maxRate: e.target.value })}
                placeholder="optional"
                className="input font-mono"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min term (months)">
              <input
                type="number"
                min={1}
                value={form.minTerm}
                onChange={(e) => setForm({ ...form, minTerm: e.target.value })}
                className="input font-mono"
                required
              />
            </Field>
            <Field label="Max term (months)">
              <input
                type="number"
                min={1}
                value={form.maxTerm}
                onChange={(e) => setForm({ ...form, maxTerm: e.target.value })}
                className="input font-mono"
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min principal (KES)">
              <input
                type="number"
                value={form.minPrincipal}
                onChange={(e) => setForm({ ...form, minPrincipal: e.target.value })}
                className="input font-mono"
                required
              />
            </Field>
            <Field label="Max principal (KES)">
              <input
                type="number"
                value={form.maxPrincipal}
                onChange={(e) => setForm({ ...form, maxPrincipal: e.target.value })}
                placeholder="optional"
                className="input font-mono"
              />
            </Field>
          </div>
          <Field label="Repayment frequency">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FREQ_META) as Frequency[]).map((f) => (
                <button
                  type="button"
                  key={f}
                  onClick={() => setForm({ ...form, frequency: f })}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-[11.5px] font-medium",
                    form.frequency === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border",
                  )}
                >
                  {FREQ_META[f].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Interest method">
            <div className="flex gap-1.5">
              {(["flat", "declining_balance"] as InterestMethod[]).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setForm({ ...form, method: m })}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-[11.5px] font-medium capitalize",
                    form.method === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border",
                  )}
                >
                  {m.replace("_", " ")}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Processing fee (%)">
            <input
              type="number"
              step="0.01"
              value={form.processingFee}
              onChange={(e) => setForm({ ...form, processingFee: e.target.value })}
              className="input font-mono"
            />
          </Field>
          <button
            type="submit"
            disabled={create.isPending}
            className="bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 mt-2"
          >
            {create.isPending ? "Creating…" : "Create product"}
          </button>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">{label}</span>
      {children}
    </label>
  );
}
