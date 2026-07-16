import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LoanChargeOrigin = "inhouse" | "outside";
export type LoanChargeType = "fixed" | "variable";

export const listLoanCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) return [];
    const { data: charges, error } = await (supabase as any)
      .from("loan_charge")
      .select("id, name, origin, charge_type, amount, receivable_account_id, credit_account_id, capitalize, capitalized_receivable_account_id, active, created_at")
      .eq("company_id", cid)
      .order("name");
    if (error) throw new Error(error.message);
    const ids = (charges ?? []).map((c: any) => c.id);
    let links: any[] = [];
    if (ids.length) {
      const { data: lk } = await (supabase as any)
        .from("loan_charge_product")
        .select("charge_id, product_id")
        .in("charge_id", ids);
      links = lk ?? [];
    }
    const byCharge = new Map<string, string[]>();
    for (const l of links) {
      const arr = byCharge.get(l.charge_id) ?? [];
      arr.push(l.product_id);
      byCharge.set(l.charge_id, arr);
    }
    return (charges ?? []).map((c: any) => ({ ...c, product_ids: byCharge.get(c.id) ?? [] }));
  });

export const upsertLoanCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      id?: string;
      name: string;
      origin: LoanChargeOrigin;
      charge_type: LoanChargeType;
      amount: number;
      receivable_account_id: string;
      credit_account_id: string;
      capitalize?: boolean;
      capitalized_receivable_account_id?: string | null;
      active?: boolean;
      product_ids: string[];
    }) => i,
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No company");
    const cap = !!data.capitalize;
    if (cap && !data.capitalized_receivable_account_id) {
      throw new Error("Capitalized-charges receivable ledger is required when capitalize is on");
    }
    const row: any = {
      company_id: cid,
      name: data.name,
      origin: data.origin,
      charge_type: data.charge_type,
      amount: data.amount,
      receivable_account_id: data.receivable_account_id,
      credit_account_id: data.credit_account_id,
      capitalize: cap,
      capitalized_receivable_account_id: cap ? data.capitalized_receivable_account_id : null,
      active: data.active ?? true,
    };
    if (data.id) row.id = data.id;
    const { data: out, error } = await (supabase as any)
      .from("loan_charge")
      .upsert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await (supabase as any).from("loan_charge_product").delete().eq("charge_id", out.id);
    if (data.product_ids.length) {
      const rows = data.product_ids.map((pid) => ({ charge_id: out.id, product_id: pid }));
      const { error: linkErr } = await (supabase as any).from("loan_charge_product").insert(rows);
      if (linkErr) throw new Error(linkErr.message);
    }
    return out;
  });

export const toggleLoanCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; active: boolean }) => i)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await (supabase as any)
      .from("loan_charge")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLoanCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await (supabase as any).from("loan_charge").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
