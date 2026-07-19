import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Bank = {
  id: string;
  code: string;
  name: string;
  cefts_enabled: boolean;
  slips_enabled: boolean;
  active: boolean;
};

export type BankBranch = {
  id: string;
  bank_id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  active: boolean;
};

export const listBanks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Bank[]> => {
    const { data, error } = await context.supabase
      .from("bank")
      .select("id, code, name, cefts_enabled, slips_enabled, active")
      .order("code");
    if (error) throw new Error(error.message);
    return (data ?? []) as Bank[];
  });

export const upsertBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string | null;
      code: string;
      name: string;
      cefts_enabled: boolean;
      slips_enabled: boolean;
      active: boolean;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const payload = {
      code: data.code.trim(),
      name: data.name.trim(),
      cefts_enabled: data.cefts_enabled,
      slips_enabled: data.slips_enabled,
      active: data.active,
    };
    if (data.id) {
      const { error } = await context.supabase.from("bank").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("bank")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string };
  });

export const deleteBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bank").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listBankBranches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bank_id: string }) => d)
  .handler(async ({ data, context }): Promise<BankBranch[]> => {
    const { data: rows, error } = await context.supabase
      .from("bank_branch")
      .select("id, bank_id, code, name, address, city, active")
      .eq("bank_id", data.bank_id)
      .order("code");
    if (error) throw new Error(error.message);
    return (rows ?? []) as BankBranch[];
  });

export const upsertBankBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string | null;
      bank_id: string;
      code: string;
      name: string;
      address: string | null;
      city: string | null;
      active: boolean;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const payload = {
      bank_id: data.bank_id,
      code: data.code.trim(),
      name: data.name.trim(),
      address: data.address?.trim() || null,
      city: data.city?.trim() || null,
      active: data.active,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("bank_branch")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("bank_branch")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string };
  });

export const deleteBankBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bank_branch").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
