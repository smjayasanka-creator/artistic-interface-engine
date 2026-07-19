import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";
import {
  listAuthorities,
  upsertAuthority,
  deleteAuthority,
  addAuthorityMember,
  removeAuthorityMember,
  listRules,
  upsertRule,
  deleteRule,
  listDelegationLookups,
  upsertDelegate,
  deleteDelegate,
} from "@/lib/delegation.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  selectCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";

type TabKey = "authorities" | "rules" | "delegates";

export function DelegationAuthorityTab() {
  const [tab, setTab] = useState<TabKey>("authorities");
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 border-b border-border">
        {(
          [
            ["authorities", "Authorities"],
            ["rules", "Rules"],
            ["delegates", "Absence delegates"],
          ] as [TabKey, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-[12px] font-semibold border-b-2 -mb-px ${
              tab === k
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "authorities" && <AuthoritiesPanel />}
      {tab === "rules" && <RulesPanel />}
      {tab === "delegates" && <DelegatesPanel />}
    </div>
  );
}

/* ============================================================ AUTHORITIES */

type AuthForm = {
  id?: string;
  code: string;
  name: string;
  description: string;
  level: number;
  effective_from: string;
  effective_to: string;
  status: "active" | "inactive";
};
const EMPTY_AUTH: AuthForm = {
  code: "",
  name: "",
  description: "",
  level: 1,
  effective_from: new Date().toISOString().slice(0, 10),
  effective_to: "",
  status: "active",
};

function AuthoritiesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAuthorities);
  const lookupsFn = useServerFn(listDelegationLookups);
  const upsertFn = useServerFn(upsertAuthority);
  const delFn = useServerFn(deleteAuthority);
  const addMem = useServerFn(addAuthorityMember);
  const rmMem = useServerFn(removeAuthorityMember);

  const { data: items } = useQuery({ queryKey: ["deleg-authorities"], queryFn: () => listFn() });
  const { data: lookups } = useQuery({ queryKey: ["deleg-lookups"], queryFn: () => lookupsFn() });

  const [mode, setMode] = useState<"list" | "form">("list");
  const [form, setForm] = useState<AuthForm>(EMPTY_AUTH);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newMember, setNewMember] = useState<{
    member_type: "user" | "custom_role" | "staff_role";
    member_ref: string;
  }>({
    member_type: "staff_role",
    member_ref: "",
  });

  const save = useMutation({
    mutationFn: (v: AuthForm) =>
      upsertFn({
        data: {
          ...v,
          description: v.description || null,
          effective_to: v.effective_to || null,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Authority saved");
      qc.invalidateQueries({ queryKey: ["deleg-authorities"] });
      setMode("list");
      setForm(EMPTY_AUTH);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["deleg-authorities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addM = useMutation({
    mutationFn: (v: any) => addMem({ data: v }),
    onSuccess: () => {
      toast.success("Member added");
      qc.invalidateQueries({ queryKey: ["deleg-authorities"] });
      setNewMember({ member_type: "staff_role", member_ref: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rmM = useMutation({
    mutationFn: (id: string) => rmMem({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deleg-authorities"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (mode === "form") {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>{form.id ? "Edit authority" : "New authority"}</CardTitle>
          <button
            onClick={() => {
              setMode("list");
              setForm(EMPTY_AUTH);
            }}
            className={btnSecondaryCls}
          >
            ← Back
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form);
          }}
          className="flex flex-col gap-4 mt-2"
        >
          <FormGrid>
            <FormField label="Authority code" required span={3}>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                required
                minLength={1}
                maxLength={30}
                placeholder="e.g. L1, BM, CC"
                className={inputCls}
              />
            </FormField>
            <FormField label="Authority name" required span={6}>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
                maxLength={120}
                placeholder="e.g. Branch Manager"
                className={inputCls}
              />
            </FormField>
            <FormField label="Level" required span={3}>
              <input
                type="number"
                min={1}
                max={99}
                value={form.level}
                onChange={(e) => setForm({ ...form, level: Number(e.target.value) })}
                className={inputCls}
              />
            </FormField>
            <FormField label="Description" span={12}>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={inputCls}
              />
            </FormField>
            <FormField label="Effective from" required span={4}>
              <input
                type="date"
                value={form.effective_from}
                onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                required
                className={inputCls}
              />
            </FormField>
            <FormField label="Expiry date" span={4}>
              <input
                type="date"
                value={form.effective_to}
                onChange={(e) => setForm({ ...form, effective_to: e.target.value })}
                className={inputCls}
              />
            </FormField>
            <FormField label="Status" required span={4}>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                className={selectCls}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FormField>
          </FormGrid>
          <FormActions>
            <button
              type="button"
              onClick={() => {
                setMode("list");
                setForm(EMPTY_AUTH);
              }}
              className={btnSecondaryCls}
            >
              Cancel
            </button>
            <button type="submit" disabled={save.isPending} className={btnPrimaryCls}>
              {save.isPending ? "Saving…" : "Save authority"}
            </button>
          </FormActions>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <div className="px-1 pb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">
          Authorities{" "}
          <span className="text-[11px] text-muted-foreground font-normal ml-1">
            {items?.length ?? 0} total
          </span>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY_AUTH);
            setMode("form");
          }}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-[12px] font-semibold hover:bg-primary-hover inline-flex items-center gap-1"
        >
          <Plus size={14} /> New authority
        </button>
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {(items ?? []).map((it: any) => {
          const open = expanded === it.id;
          return (
            <div key={it.id}>
              <div className="px-3 py-2.5 flex items-center gap-3">
                <button
                  onClick={() => setExpanded(open ? null : it.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight
                    size={14}
                    className={open ? "rotate-90 transition-transform" : "transition-transform"}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate">
                    <span className="font-mono text-primary mr-2">{it.code}</span>
                    {it.name}{" "}
                    <span className="ml-2 text-[11px] text-muted-foreground">L{it.level}</span>
                  </div>
                  <div className="text-[11.5px] text-muted-foreground truncate">
                    {it.description ?? "—"} · effective {it.effective_from}
                    {it.effective_to ? ` → ${it.effective_to}` : ""}
                  </div>
                </div>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full border ${it.status === "active" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-muted text-muted-foreground border-border"}`}
                >
                  {it.status}
                </span>
                <button
                  onClick={() => {
                    setForm({
                      id: it.id,
                      code: it.code,
                      name: it.name,
                      description: it.description ?? "",
                      level: it.level,
                      effective_from: it.effective_from,
                      effective_to: it.effective_to ?? "",
                      status: it.status,
                    });
                    setMode("form");
                  }}
                  className="text-[11.5px] text-primary hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${it.name}"?`)) del.mutate(it.id);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {open && (
                <div className="bg-muted/20 px-6 py-3 space-y-2 border-t border-border">
                  <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
                    Who can approve as this authority
                  </div>
                  <div className="flex flex-col gap-1">
                    {(it.members ?? []).length === 0 && (
                      <div className="text-[11.5px] text-muted-foreground">No members yet.</div>
                    )}
                    {(it.members ?? []).map((m: any) => (
                      <div key={m.id} className="flex items-center gap-2 text-[12px]">
                        <span className="px-1.5 py-0.5 rounded bg-secondary text-[10px] font-semibold">
                          {m.member_type}
                        </span>
                        <span className="flex-1 truncate">
                          {m.member_type === "user"
                            ? (lookups?.staff.find((s: any) => s.user_id === m.member_ref)
                                ?.full_name ?? m.member_ref)
                            : m.member_type === "custom_role"
                              ? (lookups?.roles.find((r: any) => r.id === m.member_ref)?.name ??
                                m.member_ref)
                              : m.member_ref}
                        </span>
                        <button
                          onClick={() => rmM.mutate(m.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-end gap-2 pt-2 border-t border-border">
                    <div className="flex-1">
                      <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold mb-1">
                        Add member
                      </div>
                      <div className="flex gap-2">
                        <select
                          className={selectCls + " flex-none w-40"}
                          value={newMember.member_type}
                          onChange={(e) =>
                            setNewMember({ member_type: e.target.value as any, member_ref: "" })
                          }
                        >
                          <option value="staff_role">Staff role</option>
                          <option value="custom_role">Custom role</option>
                          <option value="user">Specific user</option>
                        </select>
                        <select
                          className={selectCls + " flex-1"}
                          value={newMember.member_ref}
                          onChange={(e) =>
                            setNewMember({ ...newMember, member_ref: e.target.value })
                          }
                        >
                          <option value="">Select…</option>
                          {newMember.member_type === "staff_role" &&
                            (lookups?.staffRoles ?? []).map((r: string) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          {newMember.member_type === "custom_role" &&
                            (lookups?.roles ?? []).map((r: any) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          {newMember.member_type === "user" &&
                            (lookups?.staff ?? [])
                              .filter((s: any) => s.user_id)
                              .map((s: any) => (
                                <option key={s.id} value={s.user_id}>
                                  {s.full_name} ({s.email})
                                </option>
                              ))}
                        </select>
                      </div>
                    </div>
                    <button
                      disabled={!newMember.member_ref}
                      onClick={() =>
                        addM.mutate({ authority_id: it.id, ...newMember, is_backup: false })
                      }
                      className={btnPrimaryCls}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {(items?.length ?? 0) === 0 && (
          <div className="px-3 py-6 text-[12px] text-muted-foreground text-center">
            No authorities yet. Start by creating levels like L1, BM, Credit Committee.
          </div>
        )}
      </div>
    </Card>
  );
}

/* ============================================================ RULES */

type RuleStep = {
  seq: number;
  authority_id: string;
  mode: "sequential" | "parallel";
  required_approvals: number;
  sla_hours: number | null;
  escalate_to_authority_id: string | null;
};
type RuleForm = {
  id?: string;
  name: string;
  active: boolean;
  priority: number;
  rule_scope: "user" | "branch" | "region" | "product" | "default";
  user_id: string;
  custom_role_id: string;
  branch_id: string;
  region: string;
  product_id: string;
  security_type_id: string;
  amount_min: string;
  amount_max: string;
  rate_min: string;
  rate_max: string;
  risk_grade: string;
  effective_from: string;
  effective_to: string;
  steps: RuleStep[];
};
const EMPTY_RULE: RuleForm = {
  name: "",
  active: true,
  priority: 100,
  rule_scope: "default",
  user_id: "",
  custom_role_id: "",
  branch_id: "",
  region: "",
  product_id: "",
  security_type_id: "",
  amount_min: "",
  amount_max: "",
  rate_min: "",
  rate_max: "",
  risk_grade: "",
  effective_from: new Date().toISOString().slice(0, 10),
  effective_to: "",
  steps: [],
};

function numOrNull(s: string) {
  return s === "" ? null : Number(s);
}
function strOrNull(s: string) {
  return s === "" ? null : s;
}

function RulesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRules);
  const upsertFn = useServerFn(upsertRule);
  const delFn = useServerFn(deleteRule);
  const lookupsFn = useServerFn(listDelegationLookups);
  const authListFn = useServerFn(listAuthorities);

  const { data: rules } = useQuery({ queryKey: ["deleg-rules"], queryFn: () => listFn() });
  const { data: lookups } = useQuery({ queryKey: ["deleg-lookups"], queryFn: () => lookupsFn() });
  const { data: authorities } = useQuery({
    queryKey: ["deleg-authorities"],
    queryFn: () => authListFn(),
  });

  const [mode, setMode] = useState<"list" | "form">("list");
  const [form, setForm] = useState<RuleForm>(EMPTY_RULE);

  const activeAuthorities = useMemo(
    () => (authorities ?? []).filter((a: any) => a.status === "active"),
    [authorities],
  );

  const save = useMutation({
    mutationFn: (v: RuleForm) =>
      upsertFn({
        data: {
          id: v.id,
          name: v.name,
          active: v.active,
          priority: v.priority,
          rule_scope: v.rule_scope,
          user_id: strOrNull(v.user_id),
          custom_role_id: strOrNull(v.custom_role_id),
          branch_id: strOrNull(v.branch_id),
          region: strOrNull(v.region),
          product_id: strOrNull(v.product_id),
          security_type_id: strOrNull(v.security_type_id),
          amount_min: numOrNull(v.amount_min),
          amount_max: numOrNull(v.amount_max),
          rate_min: numOrNull(v.rate_min),
          rate_max: numOrNull(v.rate_max),
          risk_grade: strOrNull(v.risk_grade),
          effective_from: v.effective_from,
          effective_to: strOrNull(v.effective_to),
          steps: v.steps.map((s, i) => ({ ...s, seq: i + 1 })),
        } as any,
      }),
    onSuccess: () => {
      toast.success("Rule saved");
      qc.invalidateQueries({ queryKey: ["deleg-rules"] });
      setMode("list");
      setForm(EMPTY_RULE);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Rule removed");
      qc.invalidateQueries({ queryKey: ["deleg-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addStep = () =>
    setForm({
      ...form,
      steps: [
        ...form.steps,
        {
          seq: form.steps.length + 1,
          authority_id: activeAuthorities[0]?.id ?? "",
          mode: "sequential",
          required_approvals: 1,
          sla_hours: null,
          escalate_to_authority_id: null,
        },
      ],
    });
  const moveStep = (idx: number, dir: -1 | 1) => {
    const next = [...form.steps];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setForm({ ...form, steps: next });
  };
  const removeStep = (idx: number) =>
    setForm({ ...form, steps: form.steps.filter((_, i) => i !== idx) });

  if (mode === "form") {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>{form.id ? "Edit rule" : "New rule"}</CardTitle>
          <button
            onClick={() => {
              setMode("list");
              setForm(EMPTY_RULE);
            }}
            className={btnSecondaryCls}
          >
            ← Back
          </button>
        </div>
        {activeAuthorities.length === 0 && (
          <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800">
            Create at least one active authority before defining rules.
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.steps.length === 0) {
              toast.error("Add at least one approval step");
              return;
            }
            save.mutate(form);
          }}
          className="flex flex-col gap-4 mt-2"
        >
          <FormGrid>
            <FormField label="Rule name" required span={6}>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
                maxLength={120}
                className={inputCls}
              />
            </FormField>
            <FormField label="Scope" required span={3}>
              <select
                value={form.rule_scope}
                onChange={(e) => setForm({ ...form, rule_scope: e.target.value as any })}
                className={selectCls}
              >
                <option value="user">User specific</option>
                <option value="branch">Branch</option>
                <option value="region">Region</option>
                <option value="product">Product</option>
                <option value="default">Default</option>
              </select>
            </FormField>
            <FormField label="Priority" required span={3}>
              <input
                type="number"
                min={1}
                max={9999}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className={inputCls}
              />
            </FormField>
          </FormGrid>

          <div className="rounded-lg border border-border p-3 bg-muted/20">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-2">
              Matcher filters (leave blank = wildcard)
            </div>
            <FormGrid>
              <FormField label="User" span={6}>
                <select
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  className={selectCls}
                >
                  <option value="">— any —</option>
                  {(lookups?.staff ?? [])
                    .filter((s: any) => s.user_id)
                    .map((s: any) => (
                      <option key={s.id} value={s.user_id}>
                        {s.full_name}
                      </option>
                    ))}
                </select>
              </FormField>
              <FormField label="Custom role" span={6}>
                <select
                  value={form.custom_role_id}
                  onChange={(e) => setForm({ ...form, custom_role_id: e.target.value })}
                  className={selectCls}
                >
                  <option value="">— any —</option>
                  {(lookups?.roles ?? []).map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Branch" span={4}>
                <select
                  value={form.branch_id}
                  onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                  className={selectCls}
                >
                  <option value="">— any —</option>
                  {(lookups?.branches ?? []).map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Region" span={4}>
                <input
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Loan product" span={4}>
                <select
                  value={form.product_id}
                  onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                  className={selectCls}
                >
                  <option value="">— any —</option>
                  {(lookups?.products ?? []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Equipment / security type" span={6}>
                <select
                  value={form.security_type_id}
                  onChange={(e) => setForm({ ...form, security_type_id: e.target.value })}
                  className={selectCls}
                >
                  <option value="">— any —</option>
                  {(lookups?.securityTypes ?? []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Risk category" span={6}>
                <input
                  value={form.risk_grade}
                  onChange={(e) => setForm({ ...form, risk_grade: e.target.value })}
                  placeholder="e.g. Low, Medium, High"
                  className={inputCls}
                />
              </FormField>
              <FormField label="Amount from" span={3}>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount_min}
                  onChange={(e) => setForm({ ...form, amount_min: e.target.value })}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Amount to" span={3}>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount_max}
                  onChange={(e) => setForm({ ...form, amount_max: e.target.value })}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Rate from %" span={3}>
                <input
                  type="number"
                  step="0.001"
                  value={form.rate_min}
                  onChange={(e) => setForm({ ...form, rate_min: e.target.value })}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Rate to %" span={3}>
                <input
                  type="number"
                  step="0.001"
                  value={form.rate_max}
                  onChange={(e) => setForm({ ...form, rate_max: e.target.value })}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Effective from" required span={4}>
                <input
                  type="date"
                  value={form.effective_from}
                  onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                  required
                  className={inputCls}
                />
              </FormField>
              <FormField label="Effective to" span={4}>
                <input
                  type="date"
                  value={form.effective_to}
                  onChange={(e) => setForm({ ...form, effective_to: e.target.value })}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Status" span={4}>
                <select
                  value={form.active ? "1" : "0"}
                  onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}
                  className={selectCls}
                >
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </FormField>
            </FormGrid>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
                Approval chain
              </div>
              <button
                type="button"
                onClick={addStep}
                disabled={activeAuthorities.length === 0}
                className="text-[11.5px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Plus size={13} /> Add step
              </button>
            </div>
            {form.steps.length === 0 && (
              <div className="text-[12px] text-muted-foreground py-2">
                Add at least one approval step.
              </div>
            )}
            <div className="space-y-2">
              {form.steps.map((s, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 items-center border border-border rounded-md p-2 bg-secondary/30"
                >
                  <div className="col-span-1 text-[12px] font-mono text-center">#{i + 1}</div>
                  <select
                    className={selectCls + " col-span-4"}
                    value={s.authority_id}
                    onChange={(e) => {
                      const next = [...form.steps];
                      next[i] = { ...s, authority_id: e.target.value };
                      setForm({ ...form, steps: next });
                    }}
                  >
                    {activeAuthorities.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name} (L{a.level})
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectCls + " col-span-2"}
                    value={s.mode}
                    onChange={(e) => {
                      const next = [...form.steps];
                      next[i] = { ...s, mode: e.target.value as any };
                      setForm({ ...form, steps: next });
                    }}
                  >
                    <option value="sequential">Sequential</option>
                    <option value="parallel">Parallel</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    className={inputCls + " col-span-1"}
                    value={s.required_approvals}
                    onChange={(e) => {
                      const next = [...form.steps];
                      next[i] = { ...s, required_approvals: Number(e.target.value) };
                      setForm({ ...form, steps: next });
                    }}
                    title="Required approvals"
                  />
                  <input
                    type="number"
                    min={0}
                    className={inputCls + " col-span-1"}
                    value={s.sla_hours ?? ""}
                    placeholder="SLA h"
                    onChange={(e) => {
                      const next = [...form.steps];
                      next[i] = {
                        ...s,
                        sla_hours: e.target.value === "" ? null : Number(e.target.value),
                      };
                      setForm({ ...form, steps: next });
                    }}
                  />
                  <select
                    className={selectCls + " col-span-2"}
                    value={s.escalate_to_authority_id ?? ""}
                    onChange={(e) => {
                      const next = [...form.steps];
                      next[i] = { ...s, escalate_to_authority_id: e.target.value || null };
                      setForm({ ...form, steps: next });
                    }}
                  >
                    <option value="">Escalate to…</option>
                    {activeAuthorities.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.code}
                      </option>
                    ))}
                  </select>
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => moveStep(i, -1)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(i, 1)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <FormActions>
            <button
              type="button"
              onClick={() => {
                setMode("list");
                setForm(EMPTY_RULE);
              }}
              className={btnSecondaryCls}
            >
              Cancel
            </button>
            <button type="submit" disabled={save.isPending} className={btnPrimaryCls}>
              {save.isPending ? "Saving…" : "Save rule"}
            </button>
          </FormActions>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <div className="px-1 pb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">
          Rules{" "}
          <span className="text-[11px] text-muted-foreground font-normal ml-1">
            {rules?.length ?? 0} total
          </span>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY_RULE);
            setMode("form");
          }}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-[12px] font-semibold hover:bg-primary-hover inline-flex items-center gap-1"
        >
          <Plus size={14} /> New rule
        </button>
      </div>
      <div className="text-[11px] text-muted-foreground px-1 pb-2">
        Priority order: <b>user</b> → <b>branch</b> → <b>region</b> → <b>product</b> →{" "}
        <b>default</b>. Within the same scope, the rule with the lowest priority number and
        most-specific filters wins.
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {(rules ?? []).map((r: any) => (
          <div key={r.id} className="px-3 py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate">
                  {r.name}
                  <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                    {r.rule_scope}
                  </span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    priority {r.priority}
                  </span>
                </div>
                <div className="text-[11.5px] text-muted-foreground truncate">
                  {(r.steps ?? [])
                    .sort((a: any, b: any) => a.seq - b.seq)
                    .map((s: any) => s.authority?.code ?? "?")
                    .join(" → ")}
                </div>
              </div>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full border ${r.active ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-muted text-muted-foreground border-border"}`}
              >
                {r.active ? "active" : "inactive"}
              </span>
              <button
                onClick={() => {
                  const steps: RuleStep[] = (r.steps ?? [])
                    .sort((a: any, b: any) => a.seq - b.seq)
                    .map((s: any) => ({
                      seq: s.seq,
                      authority_id: s.authority_id,
                      mode: s.mode,
                      required_approvals: s.required_approvals,
                      sla_hours: s.sla_hours,
                      escalate_to_authority_id: s.escalate_to_authority_id,
                    }));
                  setForm({
                    id: r.id,
                    name: r.name,
                    active: r.active,
                    priority: r.priority,
                    rule_scope: r.rule_scope,
                    user_id: r.user_id ?? "",
                    custom_role_id: r.custom_role_id ?? "",
                    branch_id: r.branch_id ?? "",
                    region: r.region ?? "",
                    product_id: r.product_id ?? "",
                    security_type_id: r.security_type_id ?? "",
                    amount_min: r.amount_min == null ? "" : String(r.amount_min),
                    amount_max: r.amount_max == null ? "" : String(r.amount_max),
                    rate_min: r.rate_min == null ? "" : String(r.rate_min),
                    rate_max: r.rate_max == null ? "" : String(r.rate_max),
                    risk_grade: r.risk_grade ?? "",
                    effective_from: r.effective_from,
                    effective_to: r.effective_to ?? "",
                    steps,
                  });
                  setMode("form");
                }}
                className="text-[11.5px] text-primary hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${r.name}"?`)) del.mutate(r.id);
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {(rules?.length ?? 0) === 0 && (
          <div className="px-3 py-6 text-[12px] text-muted-foreground text-center">
            No rules yet.
          </div>
        )}
      </div>
    </Card>
  );
}

/* ============================================================ DELEGATES */

type DelForm = {
  id?: string;
  authority_id: string;
  from_user_id: string;
  to_user_id: string;
  from_date: string;
  to_date: string;
  reason: string;
};
const EMPTY_DEL: DelForm = {
  authority_id: "",
  from_user_id: "",
  to_user_id: "",
  from_date: new Date().toISOString().slice(0, 10),
  to_date: new Date().toISOString().slice(0, 10),
  reason: "",
};

function DelegatesPanel() {
  const qc = useQueryClient();
  const authFn = useServerFn(listAuthorities);
  const lookupsFn = useServerFn(listDelegationLookups);
  const upsertFn = useServerFn(upsertDelegate);
  const delFn = useServerFn(deleteDelegate);

  const { data: authorities } = useQuery({
    queryKey: ["deleg-authorities"],
    queryFn: () => authFn(),
  });
  const { data: lookups } = useQuery({ queryKey: ["deleg-lookups"], queryFn: () => lookupsFn() });

  const [form, setForm] = useState<DelForm>(EMPTY_DEL);

  const allDelegates = useMemo(() => {
    const rows: any[] = [];
    (authorities ?? []).forEach((a: any) =>
      (a.delegates ?? []).forEach((d: any) => rows.push({ ...d, authority: a })),
    );
    return rows;
  }, [authorities]);

  const save = useMutation({
    mutationFn: (v: DelForm) => upsertFn({ data: { ...v, reason: v.reason || null } as any }),
    onSuccess: () => {
      toast.success("Delegate saved");
      qc.invalidateQueries({ queryKey: ["deleg-authorities"] });
      setForm(EMPTY_DEL);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deleg-authorities"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const staff = (lookups?.staff ?? []).filter((s: any) => s.user_id);

  return (
    <Card>
      <CardTitle>Absence delegates</CardTitle>
      <div className="text-[11.5px] text-muted-foreground mb-3">
        Temporarily grant an authority to another user while the primary is unavailable.
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
        className="border border-border rounded-md p-3 bg-muted/20 mb-4"
      >
        <FormGrid>
          <FormField label="Authority" required span={4}>
            <select
              value={form.authority_id}
              onChange={(e) => setForm({ ...form, authority_id: e.target.value })}
              required
              className={selectCls}
            >
              <option value="">Select…</option>
              {(authorities ?? []).map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="From user" required span={4}>
            <select
              value={form.from_user_id}
              onChange={(e) => setForm({ ...form, from_user_id: e.target.value })}
              required
              className={selectCls}
            >
              <option value="">Select…</option>
              {staff.map((s: any) => (
                <option key={s.id} value={s.user_id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Delegate to" required span={4}>
            <select
              value={form.to_user_id}
              onChange={(e) => setForm({ ...form, to_user_id: e.target.value })}
              required
              className={selectCls}
            >
              <option value="">Select…</option>
              {staff.map((s: any) => (
                <option key={s.id} value={s.user_id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="From date" required span={3}>
            <input
              type="date"
              value={form.from_date}
              onChange={(e) => setForm({ ...form, from_date: e.target.value })}
              required
              className={inputCls}
            />
          </FormField>
          <FormField label="To date" required span={3}>
            <input
              type="date"
              value={form.to_date}
              onChange={(e) => setForm({ ...form, to_date: e.target.value })}
              required
              className={inputCls}
            />
          </FormField>
          <FormField label="Reason" span={6}>
            <input
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className={inputCls}
            />
          </FormField>
        </FormGrid>
        <FormActions>
          <button type="submit" disabled={save.isPending} className={btnPrimaryCls}>
            {save.isPending ? "Saving…" : "Add delegate"}
          </button>
        </FormActions>
      </form>

      <div className="divide-y divide-border rounded-md border border-border">
        {allDelegates.length === 0 && (
          <div className="px-3 py-6 text-[12px] text-muted-foreground text-center">
            No active delegates.
          </div>
        )}
        {allDelegates.map((d: any) => (
          <div key={d.id} className="px-3 py-2 flex items-center gap-3 text-[12px]">
            <div className="flex-1">
              <div className="font-semibold">
                <span className="font-mono text-primary mr-2">{d.authority?.code}</span>
                {staff.find((s: any) => s.user_id === d.from_user_id)?.full_name ?? d.from_user_id}
                {" → "}
                <b>
                  {staff.find((s: any) => s.user_id === d.to_user_id)?.full_name ?? d.to_user_id}
                </b>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {d.from_date} → {d.to_date}
                {d.reason ? ` · ${d.reason}` : ""}
              </div>
            </div>
            <button
              onClick={() => del.mutate(d.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
