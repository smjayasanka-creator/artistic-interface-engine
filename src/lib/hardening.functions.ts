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
