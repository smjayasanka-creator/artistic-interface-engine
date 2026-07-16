import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import {
  listWorkflows,
  upsertWorkflow,
  toggleWorkflow,
  deleteWorkflow,
  CANONICAL_TX_TYPES,
  APPROVER_KINDS,
  SLA_ACTIONS,
  STAFF_ROLES,
} from "@/lib/workflow.functions";
import { listCustomRoles } from "@/lib/roles.functions";
import { getAdmin, listTeam } from "@/lib/mzizi.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { inputCls, selectCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";

type Mode = "list" | "edit";
type StepDraft = {
  id?: string;
  step_order: number;
  name: string;
  approver_kind: (typeof APPROVER_KINDS)[number];
  role: string | null;
  custom_role_id: string | null;
  branch_id: string | null;
  user_id: string | null;
  required_approvals: number;
  sla_hours: number | null;
  sla_action: (typeof SLA_ACTIONS)[number];
  escalation_role: string | null;
  escalation_custom_role_id: string | null;
};

function emptyStep(order: number): StepDraft {
  return {
    step_order: order,
    name: `Step ${order}`,
    approver_kind: "role",
    role: null,
    custom_role_id: null,
    branch_id: null,
    user_id: null,
    required_approvals: 1,
    sla_hours: 24,
    sla_action: "flag",
    escalation_role: null,
    escalation_custom_role_id: null,
  };
}

export function WorkflowsTab() {
  const [mode, setMode] = useState<Mode>("list");
  const [editing, setEditing] = useState<any | null>(null);
  const listFn = useServerFn(listWorkflows);
  const { data: workflows = [] } = useQuery({ queryKey: ["workflows"], queryFn: () => listFn() });
  const qc = useQueryClient();
  const toggleFn = useServerFn(toggleWorkflow);
  const delFn = useServerFn(deleteWorkflow);
  const toggle = useMutation({
    mutationFn: toggleFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: delFn,
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["workflows"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (mode === "edit") {
    return (
      <WorkflowEditor
        initial={editing}
        onDone={() => { setMode("list"); setEditing(null); qc.invalidateQueries({ queryKey: ["workflows"] }); }}
        onCancel={() => { setMode("list"); setEditing(null); }}
      />
    );
  }

  return (
    <div className="space-y-4 animate-fadein">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Approval workflows</h2>
          <p className="text-[12.5px] text-faint mt-0.5">Route any transaction type through multi-step approvals with SLAs.</p>
        </div>
        <button className={btnPrimaryCls} onClick={() => { setEditing(null); setMode("edit"); }}>
          <Plus size={14} className="inline mr-1.5" /> New workflow
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid gap-4 text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
             style={{ gridTemplateColumns: "1.4fr 1.4fr 0.6fr 0.6fr 0.7fr 0.9fr" }}>
          <div>Name</div><div>Transaction</div><div>Steps</div><div>Joint</div><div>Enabled</div><div className="text-right">Actions</div>
        </div>
        {workflows.length === 0 && <div className="text-center text-faint text-sm py-10">No workflows yet.</div>}
        {workflows.map((w: any) => {
          const joint = (w.steps ?? []).some((s: any) => (s.required_approvals ?? 1) > 1);
          const label = CANONICAL_TX_TYPES.find((t) => t.code === w.transaction_type)?.label ?? w.transaction_type;
          return (
            <div key={w.id} className="grid gap-4 items-center text-[12.5px] py-3 px-5 border-b border-row-divider last:border-b-0 hover:bg-row-hover"
                 style={{ gridTemplateColumns: "1.4fr 1.4fr 0.6fr 0.6fr 0.7fr 0.9fr" }}>
              <div className="font-semibold">{w.name}</div>
              <div className="text-secondary-foreground">
                <div>{label}</div>
                <div className="text-[10.5px] text-faint font-mono">{w.transaction_type}</div>
              </div>
              <div className="font-mono">{w.steps?.length ?? 0}</div>
              <div>{joint ? <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-700 border border-violet-500/30">Joint</span> : <span className="text-[10.5px] text-faint">Sequential</span>}</div>
              <div>
                <button
                  onClick={() => toggle.mutate({ data: { id: w.id, is_enabled: !w.is_enabled } })}
                  className={cn("text-[10.5px] px-2 py-0.5 rounded border", w.is_enabled ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-muted text-faint border-border")}
                >
                  {w.is_enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
              <div className="flex gap-2 justify-end">
                <button className="text-[11.5px] text-muted-foreground hover:text-foreground" onClick={() => { setEditing(w); setMode("edit"); }}>
                  <Pencil size={13} className="inline mr-1" />Edit
                </button>
                <button className="text-[11.5px] text-muted-foreground hover:text-destructive"
                        onClick={() => { if (confirm(`Delete workflow "${w.name}"?`)) del.mutate({ data: { id: w.id } }); }}>
                  <Trash2 size={13} className="inline mr-1" />Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkflowEditor({ initial, onDone, onCancel }: { initial: any | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [txType, setTxType] = useState<string>(initial?.transaction_type ?? "loan_approval");
  const [customTx, setCustomTx] = useState(initial && !CANONICAL_TX_TYPES.some((t) => t.code === initial.transaction_type) ? initial.transaction_type : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [enabled, setEnabled] = useState<boolean>(initial?.is_enabled ?? true);
  const [steps, setSteps] = useState<StepDraft[]>(
    initial?.steps?.length
      ? initial.steps.map((s: any) => ({ ...s, role: s.role ?? null, custom_role_id: s.custom_role_id ?? null, branch_id: s.branch_id ?? null, user_id: s.user_id ?? null, escalation_role: s.escalation_role ?? null, escalation_custom_role_id: s.escalation_custom_role_id ?? null }))
      : [emptyStep(1)],
  );

  const adminFn = useServerFn(getAdmin);
  const { data: admin } = useQuery({ queryKey: ["admin"], queryFn: () => adminFn() });
  const teamFn = useServerFn(listTeam);
  const { data: team } = useQuery({ queryKey: ["team"], queryFn: () => teamFn() });
  const rolesFn = useServerFn(listCustomRoles);
  const { data: customRoles = [] } = useQuery({ queryKey: ["custom-roles"], queryFn: () => rolesFn() });
  const branches = admin?.branches ?? [];
  const members = team?.members ?? [];
  const activeRoles = (customRoles as any[]).filter((r) => r.active !== false);

  const upsertFn = useServerFn(upsertWorkflow);
  const save = useMutation({
    mutationFn: upsertFn,
    onSuccess: () => { toast.success("Saved"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateStep(i: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  function addStep() { setSteps((p) => [...p, emptyStep(p.length + 1)]); }
  function removeStep(i: number) {
    setSteps((p) => p.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_order: idx + 1 })));
  }

  function submit() {
    const resolvedTx = txType === "__custom" ? customTx.trim() : txType;
    if (!name.trim()) return toast.error("Name is required");
    if (!resolvedTx) return toast.error("Transaction type is required");
    save.mutate({
      data: {
        id: initial?.id ?? null,
        name: name.trim(),
        transaction_type: resolvedTx,
        description: description.trim() || null,
        is_enabled: enabled,
        steps: steps.map((s) => ({
          step_order: s.step_order,
          name: s.name,
          approver_kind: s.approver_kind,
          role: s.role,
          custom_role_id: s.custom_role_id,
          branch_id: s.branch_id,
          user_id: s.user_id,
          required_approvals: s.required_approvals,
          sla_hours: s.sla_hours,
          sla_action: s.sla_action,
          escalation_role: s.escalation_role,
          escalation_custom_role_id: s.escalation_custom_role_id,
        })),
      },
    });
  }

  return (
    <div className="space-y-5 animate-fadein">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{initial ? "Edit workflow" : "New workflow"}</h2>
          <p className="text-[12.5px] text-faint mt-0.5">Define ordered steps, joint approvers and SLAs.</p>
        </div>
        <div className="flex gap-2">
          <button className={btnSecondaryCls} onClick={onCancel}>Cancel</button>
          <button className={btnPrimaryCls} onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save workflow"}</button>
        </div>
      </div>

      <Card>
        <CardTitle>Definition</CardTitle>
        <div className="grid grid-cols-2 gap-4">
          <label className="text-[12px] font-medium text-secondary-foreground space-y-1">
            <span>Workflow name</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Loan approval > 100K" />
          </label>
          <label className="text-[12px] font-medium text-secondary-foreground space-y-1">
            <span>Transaction type</span>
            <select className={selectCls} value={txType} onChange={(e) => setTxType(e.target.value)}>
              {CANONICAL_TX_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label} ({t.code})</option>)}
              <option value="__custom">Custom…</option>
            </select>
          </label>
          {txType === "__custom" && (
            <label className="text-[12px] font-medium text-secondary-foreground space-y-1">
              <span>Custom code</span>
              <input className={inputCls} value={customTx} onChange={(e) => setCustomTx(e.target.value)} placeholder="e.g. wire_transfer" />
            </label>
          )}
          <label className="text-[12px] font-medium text-secondary-foreground space-y-1 col-span-2">
            <span>Description (optional)</span>
            <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="text-[12px] font-medium text-secondary-foreground flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Workflow enabled
          </label>
        </div>
      </Card>

      <Card>
        <CardTitle>
          <div className="flex items-center justify-between w-full">
            <span>Steps</span>
            <button className={btnSecondaryCls} onClick={addStep}><Plus size={13} className="inline mr-1" />Add step</button>
          </div>
        </CardTitle>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="border border-border rounded-lg p-3 space-y-3 bg-secondary/30">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold text-foreground">Step {s.step_order}</div>
                {steps.length > 1 && (
                  <button className="text-[11.5px] text-destructive hover:underline" onClick={() => removeStep(i)}>
                    <Trash2 size={13} className="inline mr-1" />Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="text-[11.5px] font-medium text-secondary-foreground space-y-1">
                  <span>Step name</span>
                  <input className={inputCls} value={s.name} onChange={(e) => updateStep(i, { name: e.target.value })} />
                </label>
                <label className="text-[11.5px] font-medium text-secondary-foreground space-y-1">
                  <span>Approver kind</span>
                  <select className={selectCls} value={s.approver_kind} onChange={(e) => updateStep(i, { approver_kind: e.target.value as any })}>
                    <option value="role">Role</option>
                    <option value="branch_role">Role in branch</option>
                    <option value="user">Specific user</option>
                  </select>
                </label>
                <label className="text-[11.5px] font-medium text-secondary-foreground space-y-1">
                  <span>Required approvals (joint)</span>
                  <input type="number" min={1} className={inputCls} value={s.required_approvals}
                         onChange={(e) => updateStep(i, { required_approvals: Math.max(1, parseInt(e.target.value || "1", 10)) })} />
                </label>

                {s.approver_kind !== "user" && (
                  <label className="text-[11.5px] font-medium text-secondary-foreground space-y-1">
                    <span>Role</span>
                    <select
                      className={selectCls}
                      value={s.custom_role_id ? `c:${s.custom_role_id}` : s.role ? `s:${s.role}` : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v.startsWith("c:")) updateStep(i, { custom_role_id: v.slice(2), role: null });
                        else if (v.startsWith("s:")) updateStep(i, { role: v.slice(2), custom_role_id: null });
                        else updateStep(i, { role: null, custom_role_id: null });
                      }}
                    >
                      <option value="">Select role…</option>
                      {activeRoles.length > 0 && (
                        <optgroup label="Custom roles">
                          {activeRoles.map((r: any) => <option key={r.id} value={`c:${r.id}`}>{r.name}</option>)}
                        </optgroup>
                      )}
                      <optgroup label="Built-in staff roles">
                        {STAFF_ROLES.map((r) => <option key={r} value={`s:${r}`}>{r.replace("_", " ")}</option>)}
                      </optgroup>
                    </select>
                  </label>
                )}
                {s.approver_kind === "branch_role" && (
                  <label className="text-[11.5px] font-medium text-secondary-foreground space-y-1">
                    <span>Branch</span>
                    <select className={selectCls} value={s.branch_id ?? ""} onChange={(e) => updateStep(i, { branch_id: e.target.value || null })}>
                      <option value="">Select branch…</option>
                      {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </label>
                )}
                {s.approver_kind === "user" && (
                  <label className="text-[11.5px] font-medium text-secondary-foreground space-y-1 col-span-2">
                    <span>User</span>
                    <select className={selectCls} value={s.user_id ?? ""} onChange={(e) => updateStep(i, { user_id: e.target.value || null })}>
                      <option value="">Select user…</option>
                      {members.filter((m: any) => m.user_id).map((m: any) => <option key={m.user_id} value={m.user_id}>{m.full_name} ({m.role})</option>)}
                    </select>
                  </label>
                )}

                <label className="text-[11.5px] font-medium text-secondary-foreground space-y-1">
                  <span>SLA (hours)</span>
                  <input type="number" min={0} className={inputCls} value={s.sla_hours ?? ""} placeholder="none"
                         onChange={(e) => updateStep(i, { sla_hours: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10)) })} />
                </label>
                <label className="text-[11.5px] font-medium text-secondary-foreground space-y-1">
                  <span>On SLA breach</span>
                  <select className={selectCls} value={s.sla_action} onChange={(e) => updateStep(i, { sla_action: e.target.value as any })}>
                    <option value="flag">Flag overdue</option>
                    <option value="escalate">Auto-escalate to role</option>
                  </select>
                </label>
                {s.sla_action === "escalate" && (
                  <label className="text-[11.5px] font-medium text-secondary-foreground space-y-1">
                    <span>Escalation role</span>
                    <select
                      className={selectCls}
                      value={s.escalation_custom_role_id ? `c:${s.escalation_custom_role_id}` : s.escalation_role ? `s:${s.escalation_role}` : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v.startsWith("c:")) updateStep(i, { escalation_custom_role_id: v.slice(2), escalation_role: null });
                        else if (v.startsWith("s:")) updateStep(i, { escalation_role: v.slice(2), escalation_custom_role_id: null });
                        else updateStep(i, { escalation_role: null, escalation_custom_role_id: null });
                      }}
                    >
                      <option value="">Select role…</option>
                      {activeRoles.length > 0 && (
                        <optgroup label="Custom roles">
                          {activeRoles.map((r: any) => <option key={r.id} value={`c:${r.id}`}>{r.name}</option>)}
                        </optgroup>
                      )}
                      <optgroup label="Built-in staff roles">
                        {STAFF_ROLES.map((r) => <option key={r} value={`s:${r}`}>{r.replace("_", " ")}</option>)}
                      </optgroup>
                    </select>
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
