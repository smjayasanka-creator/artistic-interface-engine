import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Users, Wallet, PiggyBank, BookOpen, Settings2, Clock, ArrowRight, ArrowLeft } from "lucide-react";
import {
  getAdmin,
  getAllLoanProducts,
  createLoanProduct,
  toggleLoanProduct,
  updateLoanProduct,
  createBranch,
  updateBranch,
  createStaff,
  toggleStaff,
  updateStaff,
  getGlAccounts,
  createGlAccount,
  toggleGlAccount,
  updateGlAccount,
  getCompany,
  updateCompany,
  listTeam,
  inviteMember,
  revokeInvite,
} from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Avatar } from "@/components/mzizi/Avatar";
import { FormGrid, FormField, FormActions, inputCls, selectCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FREQ_META, type Frequency, type InterestMethod } from "@/lib/loan-schedule";
import { FdProductsTab } from "@/components/mzizi/FdProductsTab";
import { TimeTravelTab } from "@/components/mzizi/TimeTravelTab";

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
});

type Tab = "settings" | "branches" | "staff" | "products" | "fd_products" | "accounts" | "time_travel";
type Mode = "list" | "create" | "edit";

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

type Section = { id: Tab; label: string; desc: string; icon: React.ComponentType<{ size?: number }>; accent: string };
const SECTIONS: Section[] = [
  { id: "settings",    label: "Company settings",  desc: "Workspace defaults, currency & fiscal year",       icon: Settings2, accent: "from-slate-500/15 to-slate-500/0 text-slate-600" },
  { id: "branches",    label: "Branches",          desc: "Locations, regions & operating currency",          icon: Building2, accent: "from-sky-500/15 to-sky-500/0 text-sky-600" },
  { id: "staff",       label: "Staff",             desc: "Employees, roles & invitations",                   icon: Users,     accent: "from-emerald-500/15 to-emerald-500/0 text-emerald-600" },
  { id: "products",    label: "Loan products",     desc: "Interest methods, terms & pricing",                icon: Wallet,    accent: "from-amber-500/15 to-amber-500/0 text-amber-600" },
  { id: "fd_products", label: "FD products",       desc: "Fixed deposit tenors & rates",                     icon: PiggyBank, accent: "from-teal-500/15 to-teal-500/0 text-teal-600" },
  { id: "accounts",    label: "Chart of accounts", desc: "General ledger accounts & posting rules",          icon: BookOpen,  accent: "from-violet-500/15 to-violet-500/0 text-violet-600" },
  { id: "time_travel", label: "Time travel",       desc: "Simulate a different date for testing (dev only)", icon: Clock,     accent: "from-amber-500/15 to-amber-500/0 text-amber-600" },
];

function Admin() {
  const [tab, setTab] = useState<Tab | null>(null);

  if (!tab) {
    return (
      <div className="animate-fadein flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold">Administration</h1>
          <p className="text-sm text-muted-foreground mt-1">Workspace configuration, staff & accounting setup.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button key={s.id} onClick={() => setTab(s.id)} className="text-left group">
                <Card className="p-3.5 hover:border-primary/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0 ${s.accent}`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[14px] truncate">{s.label}</div>
                      <div className="text-[11.5px] text-muted-foreground truncate">{s.desc}</div>
                    </div>
                    <ArrowRight size={16} className="text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const current = SECTIONS.find((s) => s.id === tab)!;
  const Icon = current.icon;
  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setTab(null)} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5">
          <ArrowLeft size={14} /> Administration
        </button>
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center ${current.accent}`}>
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-[14px] leading-tight">{current.label}</div>
          <div className="text-[11.5px] text-muted-foreground leading-tight">{current.desc}</div>
        </div>
      </div>
      {tab === "settings" && <SettingsTab />}
      {tab === "branches" && <BranchesTab />}
      {tab === "staff" && <StaffTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "fd_products" && <FdProductsTab />}
      {tab === "accounts" && <AccountsTab />}
      {tab === "time_travel" && <TimeTravelTab />}
    </div>
  );
}

/* ---------------- Company settings (workspace) ---------------- */

const CURRENCIES = ["KES", "UGX", "TZS", "RWF", "LKR", "USD", "EUR", "GBP"] as const;
const COUNTRIES = ["Kenya", "Uganda", "Tanzania", "Rwanda", "Burundi", "South Sudan", "Ethiopia", "Sri Lanka", "United States", "United Kingdom"] as const;
const TIMEZONES = ["Africa/Nairobi", "Africa/Kampala", "Africa/Dar_es_Salaam", "Africa/Kigali", "Africa/Addis_Ababa", "Asia/Colombo", "UTC", "Europe/London", "America/New_York"] as const;
const FY_MONTHS = [
  [1, "January"], [2, "February"], [3, "March"], [4, "April"],
  [5, "May"], [6, "June"], [7, "July"], [8, "August"],
  [9, "September"], [10, "October"], [11, "November"], [12, "December"],
] as const;

function SettingsTab() {
  const qc = useQueryClient();
  const getFn = useServerFn(getCompany);
  const updFn = useServerFn(updateCompany);
  const { data: company, isLoading } = useQuery({ queryKey: ["company"], queryFn: () => getFn() });

  const [form, setForm] = useState<{ name: string; currency: string; country: string; fy_end_month: number; fy_end_day: number; timezone: string } | null>(null);

  if (!form && company) {
    setForm({
      name: company.name,
      currency: company.currency,
      country: company.country,
      fy_end_month: company.fy_end_month,
      fy_end_day: company.fy_end_day,
      timezone: company.timezone,
    });
  }

  const save = useMutation({
    mutationFn: (v: NonNullable<typeof form>) => updFn({ data: v }),
    onSuccess: () => {
      toast.success("Company settings saved");
      qc.invalidateQueries({ queryKey: ["company"] });
      qc.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !form) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <Card>
      <CardTitle>Company settings</CardTitle>
      <p className="text-[12px] text-muted-foreground -mt-1 mb-3">
        Workspace-wide defaults used across reports, formatting, and the ledger.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const day = Math.max(1, Math.min(31, Number(form.fy_end_day) || 31));
          save.mutate({ ...form, fy_end_day: day });
        }}
        className="flex flex-col gap-3"
      >
        <FormGrid>
          <FormField label="Company name" required span={6}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required minLength={2} />
          </FormField>
          <FormField label="Timezone" required span={6}>
            <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className={selectCls}>
              {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Currency" required span={4} hint="Default reporting currency">
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={selectCls + " font-mono"}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="Country" required span={4}>
            <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={selectCls}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="Financial year end" required span={4} hint="Month and day the fiscal year closes">
            <div className="flex gap-2">
              <select value={form.fy_end_month} onChange={(e) => setForm({ ...form, fy_end_month: Number(e.target.value) })} className={selectCls + " flex-1"}>
                {FY_MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input type="number" min={1} max={31} value={form.fy_end_day} onChange={(e) => setForm({ ...form, fy_end_day: Number(e.target.value) })} className={inputCls + " w-20 font-mono"} />
            </div>
          </FormField>
        </FormGrid>
        <FormActions>
          <button type="submit" disabled={save.isPending} className={btnPrimaryCls}>{save.isPending ? "Saving…" : "Save settings"}</button>
        </FormActions>
      </form>
    </Card>
  );
}

/* ---------------- Staff invites (email invites + pending list) ---------------- */

const INVITE_ROLES = ["loan_officer", "branch_manager", "teller", "operations", "admin"] as const;

function InviteSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTeam);
  const inviteFn = useServerFn(inviteMember);
  const revokeFn = useServerFn(revokeInvite);
  const { data, isLoading } = useQuery({ queryKey: ["team"], queryFn: () => listFn() });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INVITE_ROLES)[number]>("loan_officer");

  const invite = useMutation({
    mutationFn: (v: { email: string; role: (typeof INVITE_ROLES)[number] }) => inviteFn({ data: v }),
    onSuccess: () => {
      toast.success("Invite created");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Invite revoked");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return null;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardTitle>Invite staff by email</CardTitle>
        <p className="text-[12px] text-muted-foreground -mt-1 mb-3">
          They join automatically when they sign up with this email.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            invite.mutate({ email: email.trim(), role });
          }}
          className="flex flex-col gap-3"
        >
          <FormGrid>
            <FormField label="Email" required span={7}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} placeholder="teammate@company.com" />
            </FormField>
            <FormField label="Role" required span={3}>
              <select value={role} onChange={(e) => setRole(e.target.value as (typeof INVITE_ROLES)[number])} className={selectCls}>
                {INVITE_ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
              </select>
            </FormField>
            <FormField label="" span={2}>
              <button type="submit" disabled={invite.isPending} className={btnPrimaryCls + " w-full"}>
                {invite.isPending ? "…" : "Send invite"}
              </button>
            </FormField>
          </FormGrid>
        </form>
      </Card>

      <Card>
        <div className="px-5 pt-4 pb-2 text-sm font-semibold">
          Pending invites <span className="text-[11px] text-muted-foreground font-normal ml-1">{data.invites.filter((i: any) => !i.accepted_at).length} pending</span>
        </div>
        <div className="divide-y divide-border">
          {data.invites.map((i: any) => (
            <div key={i.id} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-foreground truncate">{i.email}</div>
                <div className="text-[11.5px] text-muted-foreground truncate">
                  role: {String(i.role).replace("_", " ")} · invited {shortDate(i.created_at)} · {i.accepted_at ? `accepted ${shortDate(i.accepted_at)}` : `expires ${shortDate(i.expires_at)}`}
                </div>
              </div>
              {!i.accepted_at && (
                <button onClick={() => revoke.mutate(i.id)} className="text-[11.5px] text-rose-600 hover:underline">
                  Revoke
                </button>
              )}
            </div>
          ))}
          {data.invites.length === 0 && <div className="px-5 py-4 text-[12px] text-muted-foreground">No invites yet.</div>}
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Shared UI ---------------- */

function ListHeader({
  title,
  count,
  onNew,
  newLabel = "New",
}: {
  title: string;
  count: number;
  onNew: () => void;
  newLabel?: string;
}) {
  return (
    <div className="px-5 pt-4 pb-3 text-sm font-semibold flex items-center justify-between">
      <span>
        {title} <span className="text-[11px] text-muted-foreground font-normal ml-1">{count} total</span>
      </span>
      <button
        onClick={onNew}
        className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-[12px] font-semibold hover:bg-primary-hover"
      >
        + {newLabel}
      </button>
    </div>
  );
}

function FormHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <CardTitle>{title}</CardTitle>
      <button
        onClick={onBack}
        className="text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5"
      >
        ← Back to list
      </button>
    </div>
  );
}

/* ---------------- Branches ---------------- */

function BranchesTab() {
  const [mode, setMode] = useState<Mode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const fn = useServerFn(getAdmin);
  const { data } = useQuery({ queryKey: ["admin"], queryFn: () => fn() });
  const qc = useQueryClient();
  const createFn = useServerFn(createBranch);
  const updateFn = useServerFn(updateBranch);

  const emptyForm = { code: "", name: "", region: "", currency: "KES", opened_on: "", branch_prefix: "", savings_prefix: "", fd_prefix: "", loan_prefix: "" };
  const [form, setForm] = useState(emptyForm);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
    setMode("list");
  };

  const create = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Branch created");
      qc.invalidateQueries({ queryKey: ["admin"] });
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      toast.success("Branch updated");
      qc.invalidateQueries({ queryKey: ["admin"] });
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  function startEdit(b: any) {
    setForm({
      code: b.code ?? "",
      name: b.name ?? "",
      region: b.region ?? "",
      currency: b.currency ?? "KES",
      opened_on: b.opened_on ?? "",
      branch_prefix: b.branch_prefix ?? "",
      savings_prefix: b.savings_prefix ?? "",
      fd_prefix: b.fd_prefix ?? "",
      loan_prefix: b.loan_prefix ?? "",
    });
    setEditingId(b.id);
    setMode("edit");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name required");
      return;
    }
    if (mode === "edit" && editingId) {
      update.mutate({ data: { id: editingId, ...form } });
    } else {
      create.mutate({ data: form });
    }
  }

  if (mode === "create" || mode === "edit") {
    const isEdit = mode === "edit";
    return (
      <Card>
        <FormHeader title={isEdit ? "Edit branch" : "New branch"} onBack={reset} />
        <form onSubmit={submit} className="flex flex-col gap-3 mt-4">
          <FormGrid>
            <FormField label="Code" required span={2}>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="NRB" className={inputCls + " font-mono"} required />
            </FormField>
            <FormField label="Name" required span={6}>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nairobi Branch" className={inputCls} required />
            </FormField>
            <FormField label="Currency" span={2}>
              <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} className={inputCls + " font-mono"} />
            </FormField>
            <FormField label="Opened on" span={2}>
              <input type="date" value={form.opened_on} onChange={(e) => setForm({ ...form, opened_on: e.target.value })} className={inputCls + " font-mono"} />
            </FormField>
            <FormField label="Region" span={12} hint="Optional">
              <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="Branch prefix" span={3} hint="Used in transaction numbers">
              <input value={form.branch_prefix} onChange={(e) => setForm({ ...form, branch_prefix: e.target.value.toUpperCase() })} maxLength={6} placeholder="NRB" className={inputCls + " font-mono"} />
            </FormField>
            <FormField label="Savings prefix" span={3}>
              <input value={form.savings_prefix} onChange={(e) => setForm({ ...form, savings_prefix: e.target.value.toUpperCase() })} maxLength={6} placeholder="SAV" className={inputCls + " font-mono"} />
            </FormField>
            <FormField label="Fixed Deposit prefix" span={3}>
              <input value={form.fd_prefix} onChange={(e) => setForm({ ...form, fd_prefix: e.target.value.toUpperCase() })} maxLength={6} placeholder="FD" className={inputCls + " font-mono"} />
            </FormField>
            <FormField label="Loan prefix" span={3}>
              <input value={form.loan_prefix} onChange={(e) => setForm({ ...form, loan_prefix: e.target.value.toUpperCase() })} maxLength={6} placeholder="LN" className={inputCls + " font-mono"} />
            </FormField>
          </FormGrid>
          <FormActions>
            <button type="button" onClick={reset} className={btnSecondaryCls}>Cancel</button>
            <button type="submit" disabled={create.isPending || update.isPending} className={btnPrimaryCls}>
              {isEdit ? (update.isPending ? "Saving…" : "Save changes") : (create.isPending ? "Creating…" : "Create branch")}
            </button>
          </FormActions>
        </form>
      </Card>
    );
  }

  const GRID = "0.55fr 1.5fr 1fr 0.5fr 0.7fr 0.4fr";
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

      <Card padded={false}>
        <ListHeader title="Branches" count={data.branches.length} onNew={() => setMode("create")} newLabel="New branch" />
        <div
          className="grid text-[10px] uppercase tracking-wider text-faint font-semibold py-2 px-5 border-y border-border bg-secondary/40"
          style={{ gridTemplateColumns: GRID }}
        >
          <div>Code</div>
          <div>Name</div>
          <div>Region</div>
          <div>Currency</div>
          <div>Opened</div>
          <div className="text-right">Edit</div>
        </div>
        {data.branches.map((b: any) => (
          <div
            key={b.id}
            className="grid items-center text-[12px] py-1.5 px-5 border-b border-row-divider last:border-b-0"
            style={{ gridTemplateColumns: GRID }}
          >
            <div className="font-mono font-medium text-[11.5px]">{b.code}</div>
            <div className="truncate font-medium" title={b.name}>{b.name}</div>
            <div className="text-muted-foreground truncate">{b.region ?? "—"}</div>
            <div className="font-mono text-[11px]">{b.currency}</div>
            <div className="text-muted-foreground text-[11px]">{shortDate(b.opened_on)}</div>
            <div className="text-right">
              <button
                onClick={() => startEdit(b)}
                className="text-[10.5px] px-2 py-0.5 rounded border border-border hover:border-primary hover:text-primary transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        ))}
        {data.branches.length === 0 && (
          <div className="text-center text-faint text-sm py-8">No branches yet.</div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Staff ---------------- */

function StaffTab() {
  const [mode, setMode] = useState<Mode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const fn = useServerFn(getAdmin);
  const { data } = useQuery({ queryKey: ["admin"], queryFn: () => fn() });
  const qc = useQueryClient();
  const createFn = useServerFn(createStaff);
  const updateFn = useServerFn(updateStaff);
  const toggleFn = useServerFn(toggleStaff);

  const emptyForm = { full_name: "", role: "loan_officer" as StaffRole, branch_id: "", email: "", phone: "" };
  const [form, setForm] = useState(emptyForm);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
    setMode("list");
  };

  const create = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Staff added");
      qc.invalidateQueries({ queryKey: ["admin"] });
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      toast.success("Staff updated");
      qc.invalidateQueries({ queryKey: ["admin"] });
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: toggleFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  function startEdit(s: any) {
    setForm({
      full_name: s.full_name ?? "",
      role: (s.role as StaffRole) ?? "loan_officer",
      branch_id: s.branch_id ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
    });
    setEditingId(s.id);
    setMode("edit");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.branch_id) {
      toast.error("Name and branch required");
      return;
    }
    if (mode === "edit" && editingId) {
      update.mutate({ data: { id: editingId, ...form } });
    } else {
      create.mutate({ data: form });
    }
  }

  if (mode === "create" || mode === "edit") {
    const isEdit = mode === "edit";
    return (
      <Card>
        <FormHeader title={isEdit ? "Edit staff" : "New staff"} onBack={reset} />
        <form onSubmit={submit} className="flex flex-col gap-3 mt-4">
          <FormGrid>
            <FormField label="Full name" required span={6}>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} required />
            </FormField>
            <FormField label="Branch" required span={6}>
              <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} className={selectCls} required>
                <option value="">Select branch…</option>
                {data.branches.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Role" required span={5}>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })} className={selectCls + " capitalize"}>
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>{r.replace("_", " ")}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Email" span={4}>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} placeholder="optional" />
            </FormField>
            <FormField label="Phone" span={3}>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls + " font-mono"} placeholder="optional" />
            </FormField>
          </FormGrid>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Creates a staff profile. To let this person sign in, they still need to register with the same email — their login will then link to this profile.
          </p>
          <FormActions>
            <button type="button" onClick={reset} className={btnSecondaryCls}>Cancel</button>
            <button type="submit" disabled={create.isPending || update.isPending} className={btnPrimaryCls}>
              {isEdit ? (update.isPending ? "Saving…" : "Save changes") : (create.isPending ? "Adding…" : "Add staff")}
            </button>
          </FormActions>
        </form>
      </Card>
    );
  }

  const GRID = "1.6fr .9fr 1fr 1.3fr .5fr .4fr";
  return (
    <div className="flex flex-col gap-5">
      <Card padded={false}>
        <ListHeader title="Staff" count={data.staff.length} onNew={() => setMode("create")} newLabel="New staff" />
        <div
          className="grid text-[10px] uppercase tracking-wider text-faint font-semibold py-2 px-5 border-y border-border bg-secondary/40"
          style={{ gridTemplateColumns: GRID }}
        >
          <div>Name</div>
          <div>Role</div>
          <div>Branch</div>
          <div>Contact</div>
          <div className="text-right">Status</div>
          <div className="text-right">Edit</div>
        </div>
        {data.staff.map((s: any) => (
          <div
            key={s.id}
            className="grid items-center text-[12px] py-1.5 px-5 border-b border-row-divider last:border-b-0"
            style={{ gridTemplateColumns: GRID }}
          >
            <div className="flex items-center gap-2 font-medium truncate" title={s.full_name}>
              <Avatar name={s.full_name} />
              <span className="truncate">{s.full_name}</span>
            </div>
            <div className="capitalize text-muted-foreground truncate">{(s.role ?? "").replace("_", " ")}</div>
            <div className="text-muted-foreground truncate">{s.branch?.name ?? "—"}</div>
            <div className="text-muted-foreground text-[11px] truncate">
              <div className="truncate">{s.email ?? "—"}</div>
              {s.phone && <div className="font-mono">{s.phone}</div>}
            </div>
            <div className="text-right">
              <button
                onClick={() => toggle.mutate({ data: { id: s.id, is_active: !s.is_active } })}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border",
                  s.is_active ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-muted bg-muted text-muted-foreground",
                )}
              >
                {s.is_active ? "Active" : "Off"}
              </button>
            </div>
            <div className="text-right">
              <button
                onClick={() => startEdit(s)}
                className="text-[10.5px] px-2 py-0.5 rounded border border-border hover:border-primary hover:text-primary transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        ))}
        {data.staff.length === 0 && <div className="text-center text-faint text-sm py-8">No staff yet.</div>}
      </Card>
      <InviteSection />
    </div>
  );
}

/* ---------------- Products ---------------- */

function ProductsTab() {
  const [mode, setMode] = useState<Mode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const listFn = useServerFn(getAllLoanProducts);
  const { data: products } = useQuery({ queryKey: ["loan_products", "all"], queryFn: () => listFn() });
  const acctFn = useServerFn(getGlAccounts);
  const { data: accounts } = useQuery({ queryKey: ["gl_accounts"], queryFn: () => acctFn() });
  const qc = useQueryClient();
  const createFn = useServerFn(createLoanProduct);
  const updateFn = useServerFn(updateLoanProduct);
  const toggleFn = useServerFn(toggleLoanProduct);

  const emptyForm = {
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
    terminationFee: "0",
    terminationFeePct: "0",
    principalAcct: "",
    cashAcct: "",
    interestAcct: "",
    feeAcct: "",
    requiredDocs: [] as string[],
  };

  const [form, setForm] = useState(emptyForm);

  const activeAccts = (accounts ?? []).filter((a: any) => a.is_active);
  const assetAccts = activeAccts.filter((a: any) => a.type === "asset");
  const incomeAccts = activeAccts.filter((a: any) => a.type === "income");

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
    setMode("list");
  };

  const create = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Product created");
      qc.invalidateQueries({ queryKey: ["loan_products", "all"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      toast.success("Product updated");
      qc.invalidateQueries({ queryKey: ["loan_products", "all"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      reset();
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

  function startEdit(p: any) {
    setForm({
      name: p.name ?? "",
      minRate: String(p.annual_rate_pct ?? ""),
      maxRate: p.max_annual_rate_pct != null ? String(p.max_annual_rate_pct) : "",
      minTerm: String(p.min_term_months ?? 1),
      maxTerm: String(p.max_term_months ?? 12),
      minPrincipal: String(p.min_principal ?? 0),
      maxPrincipal: p.max_principal != null ? String(p.max_principal) : "",
      frequency: (p.frequency as Frequency) ?? "monthly",
      method: (p.interest_method as InterestMethod) ?? "flat",
      processingFee: String(p.processing_fee_pct ?? 0),
      terminationFee: String(p.termination_fee ?? 0),
      terminationFeePct: String(p.termination_fee_pct ?? 0),
      principalAcct: p.principal_account_id ?? "",
      cashAcct: p.cash_account_id ?? "",
      interestAcct: p.interest_income_account_id ?? "",
      feeAcct: p.fee_income_account_id ?? "",
      requiredDocs: Array.isArray(p.required_documents) ? [...p.required_documents] : [],
    });

    setEditingId(p.id);
    setMode("edit");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const minRate = Number(form.minRate);
    const maxRate = form.maxRate ? Number(form.maxRate) : undefined;
    if (!form.name.trim() || !minRate) {
      toast.error("Name and min rate required");
      return;
    }
    const payload = {
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
      termination_fee: Number(form.terminationFee || 0),
      termination_fee_pct: Number(form.terminationFeePct || 0),
      principal_account_id: form.principalAcct || null,
      cash_account_id: form.cashAcct || null,
      interest_income_account_id: form.interestAcct || null,
      fee_income_account_id: form.feeAcct || null,
      required_documents: form.requiredDocs.map((s) => s.trim()).filter(Boolean),
    };

    if (mode === "edit" && editingId) {
      update.mutate({ data: { id: editingId, ...payload } });
    } else {
      create.mutate({ data: payload });
    }
  }

  if (mode === "create" || mode === "edit") {
    const isEdit = mode === "edit";
    return (
      <Card>
        <FormHeader title={isEdit ? "Edit loan product" : "New loan product"} onBack={reset} />
        <form onSubmit={submit} className="flex flex-col gap-4 mt-4 text-[12.5px]">
          <FormGrid>
            <FormField label="Product name" required span={6}>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kilimo Boost" className={inputCls} required />
            </FormField>
            <FormField label="Processing fee (%)" span={2}>
              <input type="number" step="0.01" value={form.processingFee} onChange={(e) => setForm({ ...form, processingFee: e.target.value })} className={inputCls + " font-mono"} />
            </FormField>
            <FormField label="Min rate (%/yr)" required span={2}>
              <input type="number" step="0.01" value={form.minRate} onChange={(e) => setForm({ ...form, minRate: e.target.value })} className={inputCls + " font-mono"} required />
            </FormField>
            <FormField label="Max rate (%/yr)" span={2}>
              <input type="number" step="0.01" value={form.maxRate} onChange={(e) => setForm({ ...form, maxRate: e.target.value })} placeholder="optional" className={inputCls + " font-mono"} />
            </FormField>
            <FormField label="Min term (months)" required span={3}>
              <input type="number" min={1} value={form.minTerm} onChange={(e) => setForm({ ...form, minTerm: e.target.value })} className={inputCls + " font-mono"} required />
            </FormField>
            <FormField label="Max term (months)" required span={3}>
              <input type="number" min={1} value={form.maxTerm} onChange={(e) => setForm({ ...form, maxTerm: e.target.value })} className={inputCls + " font-mono"} required />
            </FormField>
            <FormField label="Min principal (KES)" required span={3}>
              <input type="number" value={form.minPrincipal} onChange={(e) => setForm({ ...form, minPrincipal: e.target.value })} className={inputCls + " font-mono"} required />
            </FormField>
            <FormField label="Max principal (KES)" span={3}>
              <input type="number" value={form.maxPrincipal} onChange={(e) => setForm({ ...form, maxPrincipal: e.target.value })} placeholder="optional" className={inputCls + " font-mono"} />
            </FormField>
            <FormField label="Repayment frequency" span={7}>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })} className={selectCls}>
                {(Object.keys(FREQ_META) as Frequency[]).map((f) => (
                  <option key={f} value={f}>{FREQ_META[f].label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Interest method" span={5}>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as InterestMethod })} className={selectCls + " capitalize"}>
                {(["flat", "declining_balance"] as InterestMethod[]).map((m) => (
                  <option key={m} value={m}>{m.replace("_", " ")}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Termination fee (KES)" span={6} hint="Flat charge on early termination">
              <input type="number" step="0.01" min={0} value={form.terminationFee} onChange={(e) => setForm({ ...form, terminationFee: e.target.value })} className={inputCls + " font-mono"} />
            </FormField>
            <FormField label="Termination fee (%)" span={6} hint="% of outstanding principal charged on termination">
              <input type="number" step="0.01" min={0} max={100} value={form.terminationFeePct} onChange={(e) => setForm({ ...form, terminationFeePct: e.target.value })} className={inputCls + " font-mono"} />
            </FormField>
            <FormField label="Required documents" span={12} hint="Applicants must upload each of these before submitting a loan application">
              <RequiredDocsEditor
                items={form.requiredDocs}
                onChange={(next) => setForm({ ...form, requiredDocs: next })}
              />
            </FormField>
          </FormGrid>


          <div className="pt-3 border-t border-border">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-3">Ledger accounts (auto-posting)</div>
            <FormGrid>
              <FormField label="Loans receivable (DR on disburse)" span={6}>
                <select value={form.principalAcct} onChange={(e) => setForm({ ...form, principalAcct: e.target.value })} className={selectCls}>
                  <option value="">— default 1100 —</option>
                  {assetAccts.map((a: any) => (<option key={a.id} value={a.id}>{a.code} · {a.name}</option>))}
                </select>
              </FormField>
              <FormField label="Cash / bank (CR on disburse)" span={6}>
                <select value={form.cashAcct} onChange={(e) => setForm({ ...form, cashAcct: e.target.value })} className={selectCls}>
                  <option value="">— default 1000 —</option>
                  {assetAccts.map((a: any) => (<option key={a.id} value={a.id}>{a.code} · {a.name}</option>))}
                </select>
              </FormField>
              <FormField label="Interest income (CR on repayment)" span={6}>
                <select value={form.interestAcct} onChange={(e) => setForm({ ...form, interestAcct: e.target.value })} className={selectCls}>
                  <option value="">— default 4000 —</option>
                  {incomeAccts.map((a: any) => (<option key={a.id} value={a.id}>{a.code} · {a.name}</option>))}
                </select>
              </FormField>
              <FormField label="Fee income (optional)" span={6}>
                <select value={form.feeAcct} onChange={(e) => setForm({ ...form, feeAcct: e.target.value })} className={selectCls}>
                  <option value="">— none —</option>
                  {incomeAccts.map((a: any) => (<option key={a.id} value={a.id}>{a.code} · {a.name}</option>))}
                </select>
              </FormField>
            </FormGrid>
          </div>

          <FormActions>
            <button type="button" onClick={reset} className={btnSecondaryCls}>Cancel</button>
            <button type="submit" disabled={create.isPending || update.isPending} className={btnPrimaryCls}>
              {isEdit ? (update.isPending ? "Saving…" : "Save changes") : (create.isPending ? "Creating…" : "Create product")}
            </button>
          </FormActions>
        </form>
      </Card>
    );
  }

  const GRID = "1.4fr .55fr .8fr 1fr .8fr .55fr .45fr .4fr";
  return (
    <Card padded={false}>
      <ListHeader title="Loan products" count={products?.length ?? 0} onNew={() => setMode("create")} newLabel="New product" />
      <div
        className="grid text-[10px] uppercase tracking-wider text-faint font-semibold py-2 px-5 border-y border-border bg-secondary/40"
        style={{ gridTemplateColumns: GRID }}
      >
        <div>Name</div>
        <div>Rate</div>
        <div>Term</div>
        <div>Principal</div>
        <div>Frequency</div>
        <div>Method</div>
        <div className="text-right">Status</div>
        <div className="text-right">Edit</div>
      </div>
      {(products ?? []).map((p: any) => (
        <div
          key={p.id}
          className="grid items-center text-[12px] py-1.5 px-5 border-b border-row-divider last:border-b-0"
          style={{ gridTemplateColumns: GRID }}
        >
          <div className="font-medium flex items-center gap-2 truncate" title={p.name}>
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: p.color ?? "#0f766e" }} />
            <span className="truncate">{p.name}</span>
          </div>
          <div className="font-mono text-[11.5px]">{p.annual_rate_pct}%</div>
          <div className="font-mono text-[11px] text-muted-foreground">{p.min_term_months}–{p.max_term_months} mo</div>
          <div className="font-mono text-[11px] text-muted-foreground truncate">
            {money(p.min_principal)}–{p.max_principal ? money(p.max_principal) : "∞"}
          </div>
          <div className="capitalize text-muted-foreground truncate">
            {FREQ_META[p.frequency as Frequency]?.label ?? p.frequency}
          </div>
          <div className="capitalize text-muted-foreground text-[11px] truncate">
            {(p.interest_method ?? "flat").replace("_", " ")}
          </div>
          <div className="text-right">
            <button
              onClick={() => toggle.mutate({ data: { id: p.id, is_active: !p.is_active } })}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border",
                p.is_active ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-muted bg-muted text-muted-foreground",
              )}
            >
              {p.is_active ? "Active" : "Off"}
            </button>
          </div>
          <div className="text-right">
            <button
              onClick={() => startEdit(p)}
              className="text-[10.5px] px-2 py-0.5 rounded border border-border hover:border-primary hover:text-primary transition-colors"
            >
              Edit
            </button>
          </div>
        </div>
      ))}
      {(products ?? []).length === 0 && (
        <div className="text-center text-faint text-sm py-8">No products yet.</div>
      )}
    </Card>
  );
}

/* ---------------- Accounts ---------------- */

const SUBCATEGORIES: Record<AccountType, string[]> = {
  asset: ["Cash & Cash Equivalents", "Investments", "Loan and Receivables", "Fixed Assets", "Other Assets"],
  liability: ["Bank Borrowings", "Customer Deposits", "Financial Liabilities", "Other Liabilities", "Tax Liability"],
  equity: ["Share Capital", "Reserves", "Retaining Earning"],
  income: ["Interest Income", "Fees and Other Income"],
  expense: [
    "Interest Expenses",
    "Personal Expenses",
    "Operating Expenses",
    "Marketing Expenses",
    "Travelling and Running Expenses",
  ],
};

function AccountsTab() {
  const [mode, setMode] = useState<Mode | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const listFn = useServerFn(getGlAccounts);
  const { data: accounts } = useQuery({ queryKey: ["gl_accounts"], queryFn: () => listFn() });
  const adminFn = useServerFn(getAdmin);
  const { data: adminData } = useQuery({ queryKey: ["admin"], queryFn: () => adminFn() });
  const branches: Array<{ id: string; name: string; code: string }> = adminData?.branches ?? [];
  const branchNameById = new Map(branches.map((b) => [b.id, b.name] as const));
  const qc = useQueryClient();
  const createFn = useServerFn(createGlAccount);
  const toggleFn = useServerFn(toggleGlAccount);
  const updateFn = useServerFn(updateGlAccount);

  const emptyForm = {
    code: "",
    name: "",
    type: "asset" as AccountType,
    subcategory: SUBCATEGORIES.asset[0],
    normal_balance: 1 as 1 | -1,
    branch_ids: [] as string[],
  };
  const [form, setForm] = useState<{
    code: string;
    name: string;
    type: AccountType;
    subcategory: string;
    normal_balance: 1 | -1;
    branch_ids: string[]; // empty = all branches
  }>(emptyForm);

  const resetForm = () => setForm(emptyForm);

  const create = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Account created");
      qc.invalidateQueries({ queryKey: ["gl_accounts"] });
      resetForm();
      setMode("list");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      toast.success("Account updated");
      qc.invalidateQueries({ queryKey: ["gl_accounts"] });
      resetForm();
      setEditingId(null);
      setMode("list");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: toggleFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gl_accounts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(a: any) {
    const type = a.type as AccountType;
    setForm({
      code: a.code ?? "",
      name: a.name ?? "",
      type,
      subcategory: a.subcategory || SUBCATEGORIES[type][0],
      normal_balance: (Number(a.normal_balance) === -1 ? -1 : 1) as 1 | -1,
      branch_ids: Array.isArray(a.branch_ids) ? a.branch_ids : [],
    });
    setEditingId(a.id);
    setMode("edit");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name required");
      return;
    }
    const payload = {
      code: form.code,
      name: form.name,
      type: form.type,
      normal_balance: form.normal_balance,
      subcategory: form.subcategory || null,
      branch_ids: form.branch_ids.length > 0 ? form.branch_ids : null,
    };
    if (mode === "edit" && editingId) {
      update.mutate({ data: { id: editingId, ...payload } });
    } else {
      create.mutate({ data: payload });
    }
  }

  const grouped = ACCOUNT_TYPES.map((t) => ({
    type: t,
    rows: (accounts ?? []).filter((a: any) => a.type === t),
  }));

  const allBranchesSelected = form.branch_ids.length === 0 || form.branch_ids.length === branches.length;

  if (mode === "create" || mode === "edit") {
    const isEdit = mode === "edit";
    return (
      <Card>
        <FormHeader title={isEdit ? "Edit account" : "New account"} onBack={() => { setMode("list"); setEditingId(null); resetForm(); }} />
        <form onSubmit={submit} className="flex flex-col gap-3 mt-4">
          <FormGrid>
            <FormField label="Code" required span={2}>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="1000"
                className={inputCls + " font-mono"}
                required
              />
            </FormField>
            <FormField label="Name" required span={7}>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Cash on hand"
                className={inputCls}
                required
              />
            </FormField>
            <FormField label="Normal balance" span={3}>
              <select
                value={form.normal_balance}
                onChange={(e) => setForm({ ...form, normal_balance: Number(e.target.value) as 1 | -1 })}
                className={selectCls}
              >
                <option value={1}>Debit</option>
                <option value={-1}>Credit</option>
              </select>
            </FormField>
            <FormField label="Type" required span={6}>
              <select
                value={form.type}
                onChange={(e) => {
                  const t = e.target.value as AccountType;
                  setForm({
                    ...form,
                    type: t,
                    subcategory: SUBCATEGORIES[t][0],
                    normal_balance: DEFAULT_NORMAL_BALANCE[t],
                  });
                }}
                className={selectCls + " capitalize"}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t} className="capitalize">
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Sub-category" required span={6}>
              <select
                value={form.subcategory}
                onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                className={selectCls}
              >
                {SUBCATEGORIES[form.type].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Branches" span={12} hint="Leave 'All branches' checked to apply this account to every branch.">
              <div className="border border-input rounded-md bg-background p-2.5 flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-[12.5px] font-medium pb-1.5 border-b border-border">
                  <input
                    type="checkbox"
                    checked={allBranchesSelected}
                    onChange={(e) => setForm({ ...form, branch_ids: e.target.checked ? [] : branches.map((b) => b.id) })}
                  />
                  <span>Select all branches</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                  {branches.map((b) => {
                    const checked = allBranchesSelected || form.branch_ids.includes(b.id);
                    return (
                      <label key={b.id} className="flex items-center gap-2 text-[12.5px]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const base = allBranchesSelected ? branches.map((x) => x.id) : form.branch_ids;
                            const next = e.target.checked
                              ? Array.from(new Set([...base, b.id]))
                              : base.filter((id) => id !== b.id);
                            setForm({ ...form, branch_ids: next.length === branches.length ? [] : next });
                          }}
                        />
                        <span className="font-mono text-faint">{b.code}</span>
                        <span className="truncate">{b.name}</span>
                      </label>
                    );
                  })}
                  {branches.length === 0 && (
                    <div className="text-[12px] text-muted-foreground col-span-full">No branches yet.</div>
                  )}
                </div>
              </div>
            </FormField>
          </FormGrid>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Assets & expenses are normally debit; liabilities, equity & income are normally credit. The default is set
            when you pick a type.
          </p>
          <FormActions>
            <button type="button" onClick={() => { setMode("list"); setEditingId(null); resetForm(); }} className={btnSecondaryCls}>
              Cancel
            </button>
            <button type="submit" disabled={create.isPending || update.isPending} className={btnPrimaryCls}>
              {isEdit
                ? (update.isPending ? "Saving…" : "Save changes")
                : (create.isPending ? "Creating…" : "Create account")}
            </button>
          </FormActions>
        </form>
      </Card>
    );
  }

  const sortedAccounts = (accounts ?? []).slice().sort((a: any, b: any) => {
    const typeOrder = ACCOUNT_TYPES.indexOf(a.type) - ACCOUNT_TYPES.indexOf(b.type);
    if (typeOrder !== 0) return typeOrder;
    return a.code.localeCompare(b.code);
  });

  return (
    <Card padded={false}>
      <ListHeader
        title="Chart of accounts"
        count={accounts?.length ?? 0}
        onNew={() => setMode("create")}
        newLabel="New account"
      />
      <div
        className="grid text-[10px] uppercase tracking-wider text-faint font-semibold py-2 px-5 border-y border-border bg-secondary/40"
        style={{ gridTemplateColumns: "0.5fr 1.4fr 1fr 1fr 0.95fr 0.55fr 0.5fr 0.4fr" }}
      >
        <div>Code</div>
        <div>Name</div>
        <div>Category</div>
        <div>Sub-category</div>
        <div>Branches</div>
        <div>Normal</div>
        <div className="text-right">Status</div>
        <div className="text-right">Edit</div>
      </div>
      {sortedAccounts.map((a: any) => {
        const bids: string[] = Array.isArray(a.branch_ids) ? a.branch_ids : [];
        const branchLabel =
          bids.length === 0
            ? "All branches"
            : bids.map((id) => branchNameById.get(id) ?? "—").join(", ");
        return (
          <div
            key={a.id}
            className="grid items-center text-[12px] py-1.5 px-5 border-b border-row-divider last:border-b-0"
            style={{ gridTemplateColumns: "0.5fr 1.4fr 1fr 1fr 0.95fr 0.55fr 0.5fr 0.4fr" }}
          >
            <div className="font-mono font-medium text-[11.5px]">{a.code}</div>
            <div className="truncate" title={a.name}>{a.name}</div>
            <div>
              <span
                className={cn(
                  "inline-flex px-1.5 py-0.5 rounded border capitalize text-[10px]",
                  TYPE_TONE[a.type as AccountType],
                )}
              >
                {a.type}
              </span>
            </div>
            <div className="text-muted-foreground truncate" title={a.subcategory ?? undefined}>
              {a.subcategory ?? "—"}
            </div>
            <div className="text-muted-foreground truncate" title={branchLabel}>
              {branchLabel}
            </div>
            <div className="font-mono text-[11px] text-secondary-foreground">
              {a.normal_balance === 1 ? "Dr" : "Cr"}
            </div>
            <div className="text-right">
              <button
                onClick={() => toggle.mutate({ data: { id: a.id, is_active: !a.is_active } })}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border",
                  a.is_active
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                    : "border-muted bg-muted text-muted-foreground",
                )}
              >
                {a.is_active ? "Active" : "Off"}
              </button>
            </div>
            <div className="text-right">
              <button
                onClick={() => startEdit(a)}
                className="text-[10.5px] px-2 py-0.5 rounded border border-border hover:border-primary hover:text-primary transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        );
      })}
      {(accounts ?? []).length === 0 && (
        <div className="text-center text-faint text-sm py-8">No accounts yet.</div>
      )}
    </Card>
  );
}


