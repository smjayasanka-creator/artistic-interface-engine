import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Trash2, Users2, Pencil, Check } from "lucide-react";
import { Card, CardTitle } from "./Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "./FormGrid";
import { cn } from "@/lib/utils";
import {
  listPermissions,
  listCustomRoles,
  upsertCustomRole,
  deleteCustomRole,
  setRoleAssignees,
} from "@/lib/roles.functions";
import { listTeam } from "@/lib/mzizi.functions";

type Mode = "list" | "create" | "edit";

type RoleForm = {
  id?: string;
  name: string;
  description: string;
  active: boolean;
  permissions: Set<string>;
};

const emptyForm = (): RoleForm => ({
  name: "",
  description: "",
  active: true,
  permissions: new Set(),
});

export function UserRolesTab() {
  const qc = useQueryClient();
  const rolesFn = useServerFn(listCustomRoles);
  const permsFn = useServerFn(listPermissions);
  const teamFn = useServerFn(listTeam);
  const upsertFn = useServerFn(upsertCustomRole);
  const deleteFn = useServerFn(deleteCustomRole);
  const assignFn = useServerFn(setRoleAssignees);

  const { data: roles } = useQuery({ queryKey: ["custom_roles"], queryFn: () => rolesFn() });
  const { data: perms } = useQuery({ queryKey: ["permissions"], queryFn: () => permsFn() });
  const { data: team } = useQuery({ queryKey: ["team"], queryFn: () => teamFn() });

  const [mode, setMode] = useState<Mode>("list");
  const [form, setForm] = useState<RoleForm>(emptyForm());
  const [assignRoleId, setAssignRoleId] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map = new Map<string, typeof perms>();
    for (const p of perms ?? []) {
      if (!map.has(p.module)) map.set(p.module, []);
      map.get(p.module)!.push(p);
    }
    return Array.from(map.entries());
  }, [perms]);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: form.id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          active: form.active,
          permissions: Array.from(form.permissions),
        },
      }),
    onSuccess: () => {
      toast.success(form.id ? "Role updated" : "Role created");
      qc.invalidateQueries({ queryKey: ["custom_roles"] });
      setMode("list");
      setForm(emptyForm());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Role deleted");
      qc.invalidateQueries({ queryKey: ["custom_roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: () =>
      assignFn({
        data: { role_id: assignRoleId!, staff_ids: Array.from(selectedStaff) },
      }),
    onSuccess: () => {
      toast.success("Assignments saved");
      qc.invalidateQueries({ queryKey: ["custom_roles"] });
      setAssignRoleId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(r: any) {
    setForm({
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      active: r.active,
      permissions: new Set(r.permissions),
    });
    setMode("edit");
  }

  function openAssign(r: any) {
    setAssignRoleId(r.id);
    setSelectedStaff(new Set(r.assignees.map((a: any) => a.staff_id)));
  }

  function togglePerm(code: string) {
    const next = new Set(form.permissions);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setForm({ ...form, permissions: next });
  }

  function toggleModule(mod: string, allCodes: string[]) {
    const next = new Set(form.permissions);
    const allSelected = allCodes.every((c) => next.has(c));
    if (allSelected) allCodes.forEach((c) => next.delete(c));
    else allCodes.forEach((c) => next.add(c));
    setForm({ ...form, permissions: next });
  }

  if (mode === "create" || mode === "edit") {
    return (
      <Card>
        <CardTitle>{form.id ? "Edit role" : "New role"}</CardTitle>
        <p className="text-[12px] text-muted-foreground -mt-1 mb-3">
          Give the role a name, then pick which actions it grants. Assign staff after saving.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) return toast.error("Name required");
            save.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <FormGrid>
            <FormField label="Role name" required span={4}>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
                required
                minLength={2}
                maxLength={60}
              />
            </FormField>
            <FormField label="Description" span={6}>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={inputCls}
                maxLength={400}
              />
            </FormField>
            <FormField label="Status" span={2}>
              <label className="flex items-center gap-2 text-[12px] pt-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Active
              </label>
            </FormField>
          </FormGrid>

          <div className="flex flex-col gap-3">
            <div className="text-[12px] font-semibold">
              Permissions{" "}
              <span className="text-muted-foreground font-normal">
                ({form.permissions.size} selected)
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {grouped.map(([mod, list]) => {
                const codes = (list ?? []).map((p) => p.code);
                const allOn = codes.every((c) => form.permissions.has(c));
                const someOn = codes.some((c) => form.permissions.has(c));
                return (
                  <div key={mod} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[12px] font-semibold">{mod}</div>
                      <button
                        type="button"
                        onClick={() => toggleModule(mod, codes)}
                        className={cn(
                          "text-[10.5px] px-2 py-0.5 rounded border transition-colors",
                          allOn
                            ? "border-primary bg-primary/10 text-primary"
                            : someOn
                              ? "border-primary/40 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {allOn ? "All selected" : someOn ? "Select all" : "Select all"}
                      </button>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {(list ?? []).map((p) => (
                        <label
                          key={p.code}
                          className="flex items-start gap-2 text-[12px] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={form.permissions.has(p.code)}
                            onChange={() => togglePerm(p.code)}
                            className="mt-0.5"
                          />
                          <span className="flex-1">
                            <span className="font-medium">{p.label}</span>
                            {p.description && (
                              <span className="text-muted-foreground text-[11px] block leading-tight">
                                {p.description}
                              </span>
                            )}
                            <span className="font-mono text-[10px] text-faint">{p.code}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <FormActions>
            <button
              type="button"
              onClick={() => {
                setMode("list");
                setForm(emptyForm());
              }}
              className={btnSecondaryCls}
            >
              Cancel
            </button>
            <button type="submit" disabled={save.isPending} className={btnPrimaryCls}>
              {save.isPending ? "Saving…" : form.id ? "Save role" : "Create role"}
            </button>
          </FormActions>
        </form>
      </Card>
    );
  }

  const assignRole = roles?.find((r: any) => r.id === assignRoleId);

  return (
    <div className="flex flex-col gap-5">
      <Card padded={false}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <div className="text-[13px] font-semibold flex items-center gap-2">
              <KeyRound size={14} /> User roles
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              Custom roles with specific actions your team can perform.
            </div>
          </div>
          <button
            onClick={() => {
              setForm(emptyForm());
              setMode("create");
            }}
            className={btnPrimaryCls}
          >
            New role
          </button>
        </div>
        {(roles ?? []).length === 0 && (
          <div className="text-center text-faint text-sm py-8">
            No custom roles yet. Create one to grant specific actions.
          </div>
        )}
        <div className="divide-y divide-border">
          {(roles ?? []).map((r: any) => (
            <div key={r.id} className="px-5 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-[13px] font-semibold">{r.name}</div>
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full border",
                        r.active
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                          : "border-muted bg-muted text-muted-foreground",
                      )}
                    >
                      {r.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {r.description && (
                    <div className="text-[11.5px] text-muted-foreground">{r.description}</div>
                  )}
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"} ·{" "}
                    {r.assignees.length} staff assigned
                  </div>
                  {r.assignees.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.assignees.slice(0, 6).map((a: any) => (
                        <span
                          key={a.staff_id}
                          className="text-[10.5px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
                        >
                          {a.full_name}
                        </span>
                      ))}
                      {r.assignees.length > 6 && (
                        <span className="text-[10.5px] text-muted-foreground">
                          +{r.assignees.length - 6} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openAssign(r)}
                    className="text-[11px] px-2 py-1 rounded border border-border hover:border-primary hover:text-primary flex items-center gap-1"
                  >
                    <Users2 size={12} /> Assign
                  </button>
                  <button
                    onClick={() => startEdit(r)}
                    className="text-[11px] px-2 py-1 rounded border border-border hover:border-primary hover:text-primary flex items-center gap-1"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete role "${r.name}"?`)) remove.mutate(r.id);
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-border hover:border-rose-500 hover:text-rose-600 flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {assignRoleId && assignRole && (
        <Card>
          <CardTitle>Assign staff — {assignRole.name}</CardTitle>
          <p className="text-[12px] text-muted-foreground -mt-1 mb-3">
            Pick which staff members are granted this role.
          </p>
          <div className="flex flex-col gap-1.5 max-h-80 overflow-auto border border-border rounded-lg p-2">
            {(team?.members ?? []).map((s: any) => (
              <label
                key={s.id}
                className="flex items-center gap-2 text-[12px] px-2 py-1 rounded hover:bg-secondary/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedStaff.has(s.id)}
                  onChange={(e) => {
                    const next = new Set(selectedStaff);
                    e.target.checked ? next.add(s.id) : next.delete(s.id);
                    setSelectedStaff(next);
                  }}
                />
                <span className="flex-1">
                  <span className="font-medium">{s.full_name}</span>
                  <span className="text-muted-foreground ml-2 text-[11px]">{s.email ?? ""}</span>
                </span>
                <span className="text-[10.5px] text-muted-foreground capitalize">
                  {String(s.role ?? "").replace("_", " ")}
                </span>
              </label>
            ))}
            {(team?.members ?? []).length === 0 && (
              <div className="text-[12px] text-muted-foreground text-center py-4">
                No staff yet.
              </div>
            )}
          </div>
          <FormActions>
            <button onClick={() => setAssignRoleId(null)} className={btnSecondaryCls}>
              Cancel
            </button>
            <button
              onClick={() => assign.mutate()}
              disabled={assign.isPending}
              className={btnPrimaryCls}
            >
              <Check size={14} className="inline -mt-0.5 mr-1" />
              {assign.isPending ? "Saving…" : "Save assignments"}
            </button>
          </FormActions>
        </Card>
      )}
    </div>
  );
}
