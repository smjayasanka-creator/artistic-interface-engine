import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function currentCompanyId(supabase: any) {
  const { data, error } = await supabase.rpc("current_company_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No company for current user");
  return data as string;
}

export const listPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("permission")
      .select("code, module, label, description, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      code: string;
      module: string;
      label: string;
      description: string | null;
      sort_order: number;
    }>;
  });

export const listCustomRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const company_id = await currentCompanyId(context.supabase);
    const { data: roles, error } = await (context.supabase as any)
      .from("custom_role")
      .select("id, name, description, active, created_at")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (roles ?? []).map((r: any) => r.id);
    let perms: any[] = [];
    let assigns: any[] = [];
    if (ids.length) {
      const [{ data: p }, { data: a }] = await Promise.all([
        (context.supabase as any)
          .from("custom_role_permission")
          .select("role_id, permission_code")
          .in("role_id", ids),
        (context.supabase as any)
          .from("user_custom_role")
          .select("role_id, staff_id, staff:staff_id(id, full_name, email)")
          .in("role_id", ids),
      ]);
      perms = p ?? [];
      assigns = a ?? [];
    }
    return (roles ?? []).map((r: any) => ({
      ...r,
      permissions: perms.filter((x) => x.role_id === r.id).map((x) => x.permission_code),
      assignees: assigns
        .filter((x) => x.role_id === r.id)
        .map((x) => ({
          staff_id: x.staff_id,
          full_name: x.staff?.full_name ?? "—",
          email: x.staff?.email ?? null,
        })),
    }));
  });

const UpsertRole = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(60),
  description: z.string().max(400).nullable().optional(),
  active: z.boolean().optional(),
  permissions: z.array(z.string()).default([]),
});

export const upsertCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertRole.parse(d))
  .handler(async ({ data, context }) => {
    const company_id = await currentCompanyId(context.supabase);
    let roleId = data.id;

    if (roleId) {
      const { error } = await (context.supabase as any)
        .from("custom_role")
        .update({
          name: data.name,
          description: data.description ?? null,
          active: data.active ?? true,
        })
        .eq("id", roleId)
        .eq("company_id", company_id);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await (context.supabase as any)
        .from("custom_role")
        .insert({
          company_id,
          name: data.name,
          description: data.description ?? null,
          active: data.active ?? true,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      roleId = ins.id;
    }

    // Sync permissions: delete all + insert current
    const { error: delErr } = await (context.supabase as any)
      .from("custom_role_permission")
      .delete()
      .eq("role_id", roleId);
    if (delErr) throw new Error(delErr.message);

    if (data.permissions.length) {
      const rows = data.permissions.map((code) => ({ role_id: roleId, permission_code: code }));
      const { error: insErr } = await (context.supabase as any)
        .from("custom_role_permission")
        .insert(rows);
      if (insErr) throw new Error(insErr.message);
    }
    return { id: roleId };
  });

export const deleteCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("custom_role")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AssignInput = z.object({
  role_id: z.string().uuid(),
  staff_ids: z.array(z.string().uuid()),
});

export const setRoleAssignees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignInput.parse(d))
  .handler(async ({ data, context }) => {
    // Replace assignments for this role
    const { error: delErr } = await (context.supabase as any)
      .from("user_custom_role")
      .delete()
      .eq("role_id", data.role_id);
    if (delErr) throw new Error(delErr.message);

    if (data.staff_ids.length) {
      const rows = data.staff_ids.map((sid) => ({
        role_id: data.role_id,
        staff_id: sid,
        assigned_by: context.userId,
      }));
      const { error } = await (context.supabase as any).from("user_custom_role").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
