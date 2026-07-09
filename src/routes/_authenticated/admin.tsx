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
  createBranch,
  createStaff,
  toggleStaff,
  getGlAccounts,
  createGlAccount,
  toggleGlAccount,
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

type Tab = "branches" | "staff" | "products" | "accounts";

const STAFF_ROLES = ["loan_officer", "branch_manager", "teller", "operations", "admin"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];
const DEFAULT_NORMAL_BALANCE: Record<AccountType, 1 | -1> = {
  asset: 1,
  expense: 1,
  liability: -1,
  equity: -1,
  income: -1,
};
const TYPE_TONE: Record<AccountType, string> = {
  asset: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  liability: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  equity: "bg-violet-500/10 text-violet-700 border-violet-500/30",
  income: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  expense: "bg-rose-500/10 text-rose-700 border-rose-500/30",
};

function Admin() {
  const [tab, setTab] = useState<Tab>("branches");
  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="flex gap-1 border-b border-border">
        {(
          [
            ["branches", "Branches"],
            ["staff", "Staff"],
            ["products", "Loan products"],
            ["accounts", "Chart of accounts"],
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
      {tab === "branches" && <BranchesTab />}
      {tab === "staff" && <StaffTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "accounts" && <AccountsTab />}
    </div>
  );
}

function BranchesTab() {
  const fn = useServerFn(getAdmin);
  const { data } = useQuery({ queryKey: ["admin"], queryFn: () => fn() });
  const qc = useQueryClient();
  const createFn = useServerFn(createBranch);

  const [form, setForm] = useState({ code: "", name: "", region: "", currency: "KES", opened_on: "" });

  const create = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Branch created");
      qc.invalidateQueries({ queryKey: ["admin"] });
      setForm({ code: "", name: "", region: "", currency: "KES", opened_on: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name required");
      return;
    }
    create.mutate({ data: form });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardTitle>Overview</CardTitle>
        <div className="grid grid-cols-4 gap-4 text-[13px]">
          {[
            ["Branches", String(data.branches.length)],
            ["Staff", String(data.staff.length)],
            ["Active clients", String(data.activeClients)],
            ["Portfolio", money(data.portfolio)],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{k}</div>
              <div className="font-mono font-semibold mt-1">{v}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-[1.4fr_1fr] gap-5">
        <Card padded={false}>
          <div className="px-5 pt-4 pb-3 text-sm font-semibold flex items-center justify-between">
            <span>Branches</span>
            <span className="text-[11px] text-muted-foreground font-normal">{data.branches.length} total</span>
          </div>
          <div
            className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-y border-border bg-secondary/40"
            style={{ gridTemplateColumns: "0.6fr 1.4fr 1fr 0.6fr 0.8fr" }}
          >
            <div>Code</div>
            <div>Name</div>
            <div>Region</div>
            <div>Currency</div>
            <div>Opened</div>
          </div>
          {data.branches.map((b: any) => (
            <div
              key={b.id}
              className="grid items-center text-[13px] py-3 px-5 border-b border-row-divider last:border-b-0"
              style={{ gridTemplateColumns: "0.6fr 1.4fr 1fr 0.6fr 0.8fr" }}
            >
              <div className="font-mono font-semibold">{b.code}</div>
              <div className="font-semibold">{b.name}</div>
              <div className="text-secondary-foreground">{b.region ?? "—"}</div>
              <div className="font-mono">{b.currency}</div>
              <div className="text-secondary-foreground">{shortDate(b.opened_on)}</div>
            </div>
          ))}
          {data.branches.length === 0 && (
            <div className="text-center text-faint text-sm py-8">No branches yet.</div>
          )}
        </Card>

        <Card>
          <CardTitle>New branch</CardTitle>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="grid grid-cols-[0.5fr_1fr] gap-3">
              <Field label="Code">
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="NRB"
                  className={inputCls}
                  required
                />
              </Field>
              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nairobi Branch"
                  className={inputCls}
                  required
                />
              </Field>
            </div>
            <Field label="Region">
              <input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="optional"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency">
                <input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  maxLength={3}
                  className={inputCls + " font-mono"}
                />
              </Field>
              <Field label="Opened on">
                <input
                  type="date"
                  value={form.opened_on}
                  onChange={(e) => setForm({ ...form, opened_on: e.target.value })}
                  className={inputCls + " font-mono"}
                />
              </Field>
            </div>
            <button
              type="submit"
              disabled={create.isPending}
              className="bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 mt-2"
            >
              {create.isPending ? "Creating…" : "Create branch"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function StaffTab() {
  const fn = useServerFn(getAdmin);
  const { data } = useQuery({ queryKey: ["admin"], queryFn: () => fn() });
  const qc = useQueryClient();
  const createFn = useServerFn(createStaff);
  const toggleFn = useServerFn(toggleStaff);

  const [form, setForm] = useState<{
    full_name: string;
    role: StaffRole;
    branch_id: string;
    email: string;
    phone: string;
  }>({ full_name: "", role: "loan_officer", branch_id: "", email: "", phone: "" });

  const create = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Staff added");
      qc.invalidateQueries({ queryKey: ["admin"] });
      setForm({ full_name: "", role: "loan_officer", branch_id: form.branch_id, email: "", phone: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: toggleFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.branch_id) {
      toast.error("Name and branch required");
      return;
    }
    create.mutate({ data: form });
  }

  return (
    <div className="grid grid-cols-[1.6fr_1fr] gap-5">
      <Card padded={false}>
        <div className="px-5 pt-4 pb-3 text-sm font-semibold flex items-center justify-between">
          <span>Staff</span>
          <span className="text-[11px] text-muted-foreground font-normal">{data.staff.length} total</span>
        </div>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-y border-border bg-secondary/40"
          style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1.2fr 0.6fr" }}
        >
          <div>Name</div>
          <div>Role</div>
          <div>Branch</div>
          <div>Contact</div>
          <div className="text-right">Status</div>
        </div>
        {data.staff.map((s: any) => (
          <div
            key={s.id}
            className="grid items-center text-[13px] py-3 px-5 border-b border-row-divider last:border-b-0"
            style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1.2fr 0.6fr" }}
          >
            <div className="flex items-center gap-2.5 font-semibold">
              <Avatar name={s.full_name} />
              {s.full_name}
            </div>
            <div className="capitalize text-secondary-foreground">{(s.role ?? "").replace("_", " ")}</div>
            <div className="text-secondary-foreground">{s.branch?.name ?? "—"}</div>
            <div className="text-muted-foreground text-[12px] truncate">
              <div className="truncate">{s.email ?? "—"}</div>
              {s.phone && <div className="font-mono text-[11px]">{s.phone}</div>}
            </div>
            <div className="text-right">
              <button
                onClick={() => toggle.mutate({ data: { id: s.id, is_active: !s.is_active } })}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full border",
                  s.is_active
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                    : "border-muted bg-muted text-muted-foreground",
                )}
              >
                {s.is_active ? "Active" : "Off"}
              </button>
            </div>
          </div>
        ))}
        {data.staff.length === 0 && <div className="text-center text-faint text-sm py-8">No staff yet.</div>}
      </Card>

      <Card>
        <CardTitle>New staff</CardTitle>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Full name">
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className={inputCls}
              required
            />
          </Field>
          <Field label="Branch">
            <select
              value={form.branch_id}
              onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
              className={inputCls}
              required
            >
              <option value="">Select branch…</option>
              {data.branches.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <div className="flex flex-wrap gap-1.5">
              {STAFF_ROLES.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setForm({ ...form, role: r })}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-[11.5px] font-medium capitalize",
                    form.role === r ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border",
                  )}
                >
                  {r.replace("_", " ")}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputCls}
                placeholder="optional"
              />
            </Field>
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputCls + " font-mono"}
                placeholder="optional"
              />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Creates a staff profile. To let this person sign in, they still need to register with the same email — their
            login will then link to this profile.
          </p>
          <button
            type="submit"
            disabled={create.isPending}
            className="bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 mt-1"
          >
            {create.isPending ? "Adding…" : "Add staff"}
          </button>
        </form>
      </Card>
    </div>
  );
}

function ProductsTab() {
  const listFn = useServerFn(getAllLoanProducts);
  const { data: products } = useQuery({ queryKey: ["loan_products", "all"], queryFn: () => listFn() });
  const acctFn = useServerFn(getGlAccounts);
  const { data: accounts } = useQuery({ queryKey: ["gl_accounts"], queryFn: () => acctFn() });
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
    principalAcct: "",
    cashAcct: "",
    interestAcct: "",
    feeAcct: "",
  });

  const activeAccts = (accounts ?? []).filter((a: any) => a.is_active);
  const assetAccts = activeAccts.filter((a: any) => a.type === "asset");
  const incomeAccts = activeAccts.filter((a: any) => a.type === "income");


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
              className={inputCls}
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
                className={inputCls + " font-mono"}
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
                className={inputCls + " font-mono"}
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
                className={inputCls + " font-mono"}
                required
              />
            </Field>
            <Field label="Max term (months)">
              <input
                type="number"
                min={1}
                value={form.maxTerm}
                onChange={(e) => setForm({ ...form, maxTerm: e.target.value })}
                className={inputCls + " font-mono"}
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
                className={inputCls + " font-mono"}
                required
              />
            </Field>
            <Field label="Max principal (KES)">
              <input
                type="number"
                value={form.maxPrincipal}
                onChange={(e) => setForm({ ...form, maxPrincipal: e.target.value })}
                placeholder="optional"
                className={inputCls + " font-mono"}
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
              className={inputCls + " font-mono"}
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

function AccountsTab() {
  const listFn = useServerFn(getGlAccounts);
  const { data: accounts } = useQuery({ queryKey: ["gl_accounts"], queryFn: () => listFn() });
  const qc = useQueryClient();
  const createFn = useServerFn(createGlAccount);
  const toggleFn = useServerFn(toggleGlAccount);

  const [form, setForm] = useState<{ code: string; name: string; type: AccountType; normal_balance: 1 | -1 }>({
    code: "",
    name: "",
    type: "asset",
    normal_balance: 1,
  });

  const create = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Account created");
      qc.invalidateQueries({ queryKey: ["gl_accounts"] });
      setForm({ code: "", name: "", type: form.type, normal_balance: form.normal_balance });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: toggleFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gl_accounts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name required");
      return;
    }
    create.mutate({ data: form });
  }

  // Group by type for readability
  const grouped = ACCOUNT_TYPES.map((t) => ({
    type: t,
    rows: (accounts ?? []).filter((a: any) => a.type === t),
  }));

  return (
    <div className="grid grid-cols-[1.6fr_1fr] gap-5">
      <Card padded={false}>
        <div className="px-5 pt-4 pb-3 text-sm font-semibold flex items-center justify-between">
          <span>Chart of accounts</span>
          <span className="text-[11px] text-muted-foreground font-normal">{accounts?.length ?? 0} accounts</span>
        </div>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-y border-border bg-secondary/40"
          style={{ gridTemplateColumns: "0.6fr 1.8fr 0.8fr 0.7fr 0.5fr" }}
        >
          <div>Code</div>
          <div>Name</div>
          <div>Type</div>
          <div>Normal</div>
          <div className="text-right">Status</div>
        </div>
        {grouped.map((g) =>
          g.rows.length === 0 ? null : (
            <div key={g.type}>
              <div className="px-5 py-2 text-[10.5px] uppercase tracking-wider text-muted-foreground bg-secondary/20 font-semibold border-b border-border">
                {g.type}
              </div>
              {g.rows.map((a: any) => (
                <div
                  key={a.id}
                  className="grid items-center text-[12.5px] py-3 px-5 border-b border-row-divider last:border-b-0"
                  style={{ gridTemplateColumns: "0.6fr 1.8fr 0.8fr 0.7fr 0.5fr" }}
                >
                  <div className="font-mono font-semibold">{a.code}</div>
                  <div>{a.name}</div>
                  <div>
                    <span
                      className={cn(
                        "text-[10.5px] px-2 py-0.5 rounded-full border capitalize",
                        TYPE_TONE[a.type as AccountType],
                      )}
                    >
                      {a.type}
                    </span>
                  </div>
                  <div className="font-mono text-secondary-foreground">
                    {a.normal_balance === 1 ? "Debit" : "Credit"}
                  </div>
                  <div className="text-right">
                    <button
                      onClick={() => toggle.mutate({ data: { id: a.id, is_active: !a.is_active } })}
                      className={cn(
                        "text-[11px] px-2 py-0.5 rounded-full border",
                        a.is_active
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                          : "border-muted bg-muted text-muted-foreground",
                      )}
                    >
                      {a.is_active ? "Active" : "Off"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ),
        )}
        {(accounts ?? []).length === 0 && (
          <div className="text-center text-faint text-sm py-8">No accounts yet.</div>
        )}
      </Card>

      <Card>
        <CardTitle>New account</CardTitle>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-[0.5fr_1fr] gap-3">
            <Field label="Code">
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="1000"
                className={inputCls + " font-mono"}
                required
              />
            </Field>
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Cash on hand"
                className={inputCls}
                required
              />
            </Field>
          </div>
          <Field label="Type">
            <div className="flex flex-wrap gap-1.5">
              {ACCOUNT_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setForm({ ...form, type: t, normal_balance: DEFAULT_NORMAL_BALANCE[t] })}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-[11.5px] font-medium capitalize",
                    form.type === t ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Normal balance">
            <div className="flex gap-1.5">
              {([1, -1] as const).map((v) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setForm({ ...form, normal_balance: v })}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-[11.5px] font-medium",
                    form.normal_balance === v
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border",
                  )}
                >
                  {v === 1 ? "Debit" : "Credit"}
                </button>
              ))}
            </div>
          </Field>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Assets & expenses are normally debit; liabilities, equity & income are normally credit. The default is set
            when you pick a type.
          </p>
          <button
            type="submit"
            disabled={create.isPending}
            className="bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 mt-1"
          >
            {create.isPending ? "Creating…" : "Create account"}
          </button>
        </form>
      </Card>
    </div>
  );
}

const inputCls = "border border-input rounded-md px-2.5 py-1.5 text-sm bg-background";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">{label}</span>
      {children}
    </label>
  );
}
