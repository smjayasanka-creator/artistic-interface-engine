import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertPlatformAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "platform_admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: platform admin only");
}

export const listHardeningItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("hardening_checklist_item")
      .select("item_id, status, owner, note, updated_at, updated_by");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertHardeningItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { item_id: string; status?: "done" | "partial" | "missing"; owner?: string | null; note?: string | null }) =>
    z.object({
      item_id: z.string().min(1),
      status: z.enum(["done", "partial", "missing"]).optional(),
      owner: z.string().nullable().optional(),
      note: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const payload: Record<string, any> = {
      item_id: data.item_id,
      updated_by: context.userId,
    };
    if (data.status !== undefined) payload.status = data.status;
    if (data.owner !== undefined) payload.owner = data.owner;
    if (data.note !== undefined) payload.note = data.note;

    const { error } = await context.supabase
      .from("hardening_checklist_item")
      .upsert(payload, { onConflict: "item_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetHardeningItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("hardening_checklist_item")
      .delete()
      .not("item_id", "is", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type AutoCheckResult = {
  item_id: string;
  status: "done" | "partial" | "missing";
  evidence: string;
  check_sql: string;
  matches: Array<Record<string, string | number | boolean | null>>;
};

export const runHardeningAutocheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { apply?: boolean } | undefined) =>
    z.object({ apply: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { data: results, error } = await context.supabase.rpc("hardening_autocheck");
    if (error) throw new Error(error.message);
    const list = (results as AutoCheckResult[]) ?? [];

    if (data.apply && list.length > 0) {
      const rows = list.map((r) => ({
        item_id: r.item_id,
        status: r.status,
        note: `auto: ${r.evidence}`,
        owner: "system (auto-check)",
        updated_by: context.userId,
      }));
      const { error: upErr } = await context.supabase
        .from("hardening_checklist_item")
        .upsert(rows, { onConflict: "item_id" });
      if (upErr) throw new Error(upErr.message);
    }
    return list;
  });
