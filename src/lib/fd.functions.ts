import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { serverNow, serverToday } from "@/lib/clock-server";
import { buildSchedule, dailyAccrual, addMonths, daysBetween, interestForPeriod } from "@/lib/fd-schedule";

// ─────────── Ledger kernel helper ───────────
// Resolves GL account ids from fd_product (preferred) or falls back to
// standard chart-of-accounts codes: 1000 cash, 2200 FD liability,
// 5200 interest expense, 2300 WHT liability.
async function resolveFdAccounts(supabase: any, product: any) {
  const need: Record<string, { fromProduct: string | null; code: string }> = {
    cash: { fromProduct: product?.cash_account_id ?? null, code: "1000" },
    liab: { fromProduct: product?.deposit_liability_account_id ?? null, code: "2200" },
    intr: { fromProduct: product?.interest_expense_account_id ?? null, code: "5200" },
    wht:  { fromProduct: product?.wht_liability_account_id ?? null, code: "2300" },
  };
  const missing = Object.values(need).filter((n) => !n.fromProduct).map((n) => n.code);
  let byCode: Record<string, string> = {};
  if (missing.length) {
    const { data: accts } = await supabase.from("gl_account").select("id, code").in("code", missing);
    byCode = Object.fromEntries((accts ?? []).map((a: any) => [a.code, a.id]));
  }
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(need)) out[k] = v.fromProduct ?? byCode[v.code] ?? null;
  return out as { cash: string | null; liab: string | null; intr: string | null; wht: string | null };
}


// ──────────────────────────────────────────────────────────────────────────
// PRODUCTS
// ──────────────────────────────────────────────────────────────────────────

export const listFdProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) return [];
    const { data, error } = await supabase
      .from("fd_product")
      .select("*, rate_tiers:fd_rate_tier(id,tenure_months,annual_rate,effective_from,effective_to)")
      .eq("company_id", cid)
      .order("code");
    if (error) throw error;
    return data ?? [];
  });

const productInput = z.object({
  code: z.string().trim().min(2).max(30),
  name: z.string().trim().min(2).max(120),
  min_amount: z.number().nonnegative(),
  max_amount: z.number().positive().nullable().optional(),
  allow_monthly: z.boolean(),
  allow_at_maturity: z.boolean(),
  penalty_type: z.enum(["rate_reduction", "reprice_minus_margin"]),
  penalty_value: z.number().min(0).max(100),
  wht_rate: z.number().min(0).max(100),
  auto_renewal_default: z.enum(["payout", "renew_principal", "renew_principal_interest"]),
  active: z.boolean(),
  capital_account_id: z.string().uuid().nullable().optional(),
  interest_payable_account_id: z.string().uuid().nullable().optional(),
  interest_expense_account_id: z.string().uuid().nullable().optional(),
  wht_payable_account_id: z.string().uuid().nullable().optional(),
  introducer_commission_account_id: z.string().uuid().nullable().optional(),
  marketing_incentive_account_id: z.string().uuid().nullable().optional(),
});

export const createFdProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof productInput>) => productInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");
    const { data: row, error } = await supabase
      .from("fd_product")
      .insert({ ...data, company_id: cid })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateFdProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; patch: Partial<z.infer<typeof productInput>> }) =>
    z.object({ id: z.string().uuid(), patch: productInput.partial() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("fd_product")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteFdProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("fd_product").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const rateInput = z.object({
  product_id: z.string().uuid(),
  tenure_months: z.number().int().positive(),
  annual_rate: z.number().min(0).max(100),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export const upsertFdRateTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id?: string } & z.infer<typeof rateInput>) =>
    z.object({ id: z.string().uuid().optional() }).merge(rateInput).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    if (data.id) {
      const { id, ...patch } = data;
      const { data: row, error } = await supabase.from("fd_rate_tier").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await supabase.from("fd_rate_tier").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const deleteFdRateTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("fd_rate_tier").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ──────────────────────────────────────────────────────────────────────────
// RATE LOOKUP
// ──────────────────────────────────────────────────────────────────────────

async function findApplicableRate(
  supabase: ReturnType<typeof requireSupabaseAuth extends never ? never : (arg: unknown) => unknown> extends never
    ? never
    : any, // eslint-disable-line @typescript-eslint/no-explicit-any
  productId: string,
  tenureMonths: number,
  onDate: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("fd_rate_tier")
    .select("annual_rate,effective_from,effective_to")
    .eq("product_id", productId)
    .eq("tenure_months", tenureMonths)
    .lte("effective_from", onDate)
    .order("effective_from", { ascending: false });
  const row = (data ?? []).find((r: { effective_to: string | null }) => !r.effective_to || r.effective_to >= onDate);
  return row ? Number(row.annual_rate) : null;
}

export const lookupFdRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { product_id: string; tenure_months: number; on_date: string }) =>
    z
      .object({
        product_id: z.string().uuid(),
        tenure_months: z.number().int().positive(),
        on_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const rate = await findApplicableRate(context.supabase, data.product_id, data.tenure_months, data.on_date);
    return { annual_rate: rate };
  });

// ──────────────────────────────────────────────────────────────────────────
// DEPOSITS
// ──────────────────────────────────────────────────────────────────────────

export const listFixedDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { status?: string; product_id?: string; from?: string; to?: string }) =>
    z
      .object({
        status: z.string().optional(),
        product_id: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    let q = supabase
      .from("fixed_deposit")
      .select(
        "id,certificate_no,status,principal,rate_at_booking,tenure_months,payout_option,value_date,maturity_date,client!fixed_deposit_client_id_fkey(id,full_name),product:product_id(id,code,name)",
      )
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status as "pending" | "active" | "matured" | "prematurely_closed" | "renewed");
    if (data.product_id) q = q.eq("product_id", data.product_id);
    if (data.from) q = q.gte("maturity_date", data.from);
    if (data.to) q = q.lte("maturity_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ──────────────────────────────────────────────────────────────────────────
// DEPOSIT RECEIPT / WITHDRAWAL (money movement transactions)
// ──────────────────────────────────────────────────────────────────────────

export const listActiveDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("fixed_deposit")
      .select("id,certificate_no,principal,client!fixed_deposit_client_id_fkey(id,full_name),product:product_id(id,code,name)")
      .eq("status", "active")
      .order("certificate_no");
    if (error) throw error;
    return data ?? [];
  });

const depositMovementInput = z.object({
  deposit_id: z.string().uuid(),
  amount: z.number().positive(),
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().max(120).optional().nullable(),
});

export const recordDepositReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof depositMovementInput>) => depositMovementInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: fd } = await supabase
      .from("fixed_deposit")
      .select("id,status,certificate_no")
      .eq("id", data.deposit_id)
      .maybeSingle();
    if (!fd) throw new Error("Deposit not found");
    if (fd.status !== "active") throw new Error("Only active deposits can accept receipts");
    const { data: row, error } = await supabase
      .from("fd_transaction")
      .insert({
        deposit_id: data.deposit_id,
        type: "deposit_receipt" as any,
        amount: data.amount,
        txn_date: data.txn_date,
        reference: data.reference ?? fd.certificate_no,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const recordDepositWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof depositMovementInput>) => depositMovementInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: fd } = await supabase
      .from("fixed_deposit")
      .select("id,status,certificate_no,principal")
      .eq("id", data.deposit_id)
      .maybeSingle();
    if (!fd) throw new Error("Deposit not found");
    if (fd.status !== "active") throw new Error("Only active deposits can be withdrawn from");
    if (data.amount > Number(fd.principal)) throw new Error("Withdrawal exceeds deposit principal");
    const { data: row, error } = await supabase
      .from("fd_transaction")
      .insert({
        deposit_id: data.deposit_id,
        type: "withdrawal" as any,
        amount: data.amount,
        txn_date: data.txn_date,
        reference: data.reference ?? fd.certificate_no,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });


export const getFdSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = serverToday();
    const monthStart = today.slice(0, 8) + "01";
    const monthEnd = addMonths(monthStart, 1);
    const [{ data: active }, { data: paidMtd }, { data: maturingMtd }] = await Promise.all([
      supabase.from("fixed_deposit").select("principal,rate_at_booking").eq("status", "active"),
      supabase
        .from("fd_transaction")
        .select("amount")
        .eq("type", "interest_payout")
        .gte("txn_date", monthStart)
        .lt("txn_date", monthEnd),
      supabase
        .from("fixed_deposit")
        .select("principal")
        .eq("status", "active")
        .gte("maturity_date", monthStart)
        .lt("maturity_date", monthEnd),
    ]);
    const rows = active ?? [];
    const total = rows.reduce((s, r) => s + Number(r.principal), 0);
    const weighted = total > 0 ? rows.reduce((s, r) => s + Number(r.principal) * Number(r.rate_at_booking), 0) / total : 0;
    return {
      portfolio_value: total,
      active_count: rows.length,
      weighted_avg_rate: Math.round(weighted * 10000) / 10000,
      interest_paid_mtd: (paidMtd ?? []).reduce((s, r) => s + Number(r.amount), 0),
      maturing_this_month: (maturingMtd ?? []).reduce((s, r) => s + Number(r.principal), 0),
      maturing_count: (maturingMtd ?? []).length,
    };
  });

export const getFixedDeposit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [{ data: fd, error }, { data: schedule }, { data: accruals }, { data: nominees }, { data: txns }] =
      await Promise.all([
        supabase
          .from("fixed_deposit")
          .select(
            "*, client!fixed_deposit_client_id_fkey(id,full_name,phone,national_id), product:product_id(id,code,name,penalty_type,penalty_value,wht_rate), branch:branch_id(id,code,name), settlement:settlement_account(id,code,name)",
          )
          .eq("id", data.id)
          .maybeSingle(),
        supabase.from("fd_interest_schedule").select("*").eq("deposit_id", data.id).order("seq"),
        supabase
          .from("fd_accrual")
          .select("accrual_date,daily_amount,cumulative_amount")
          .eq("deposit_id", data.id)
          .order("accrual_date", { ascending: false })
          .limit(60),
        supabase.from("fd_nominee").select("*").eq("deposit_id", data.id),
        supabase.from("fd_transaction").select("*").eq("deposit_id", data.id).order("txn_date", { ascending: false }),
      ]);
    if (error) throw error;
    return { fd, schedule: schedule ?? [], accruals: accruals ?? [], nominees: nominees ?? [], transactions: txns ?? [] };
  });

const nomineeSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(120),
  nic: z.string().trim().max(30).optional().nullable(),
  relationship: z.string().trim().max(60).optional().nullable(),
  percentage: z.number().positive().max(100),
});

const createDepositInput = z.object({
  client_id: z.string().uuid(),
  product_id: z.string().uuid(),
  tenure_months: z.number().int().positive(),
  principal: z.number().positive(),
  payout_option: z.enum(["monthly", "at_maturity"]),
  settlement_account: z.string().uuid().nullable().optional(),
  maturity_instruction: z.enum(["payout", "renew_principal", "renew_principal_interest"]),
  value_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nominees: z.array(nomineeSchema).min(1).max(5),
  dispatch_option: z.enum(["post", "branch", "digital"]).default("branch"),
  payout_bank_account_id: z.string().uuid().nullable().optional(),
  interest_payment_mode: z.enum(["bank_transfer", "credit_savings"]).default("credit_savings"),
  interest_savings_account_id: z.string().uuid().nullable().optional(),
  marketing_officer_id: z.string().uuid().nullable().optional(),
  introducer_id: z.string().uuid().nullable().optional(),
  introducer_commission_amount: z.number().nonnegative().nullable().optional(),
  introducer_commission_payment_mode: z.enum(["cash", "bank_transfer", "credit_savings"]).nullable().optional(),
});

export const createFixedDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof createDepositInput>) => createDepositInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");

    const { data: staff } = await supabase
      .from("staff")
      .select("branch_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!staff) throw new Error("No staff profile");

    const { data: product } = await supabase
      .from("fd_product")
      .select("id,min_amount,max_amount,allow_monthly,allow_at_maturity,wht_rate,active")
      .eq("id", data.product_id)
      .maybeSingle();
    if (!product || !product.active) throw new Error("Product unavailable");
    if (Number(data.principal) < Number(product.min_amount)) throw new Error("Amount below product minimum");
    if (product.max_amount != null && Number(data.principal) > Number(product.max_amount))
      throw new Error("Amount above product maximum");
    if (data.payout_option === "monthly" && !product.allow_monthly) throw new Error("Monthly payout not allowed");
    if (data.payout_option === "at_maturity" && !product.allow_at_maturity)
      throw new Error("At-maturity payout not allowed");

    const percentTotal = data.nominees.reduce((s, n) => s + n.percentage, 0);
    if (Math.abs(percentTotal - 100) > 0.01) throw new Error("Nominee percentages must total 100");

    if (data.maturity_instruction === "payout" && !data.payout_bank_account_id) {
      throw new Error("Select a bank account for pay-out at maturity");
    }
    if (data.interest_payment_mode === "credit_savings" && !data.interest_savings_account_id) {
      throw new Error("Select a savings account to credit interest");
    }
    if (data.interest_payment_mode === "bank_transfer" && !data.payout_bank_account_id) {
      throw new Error("Select a bank account for interest bank transfer");
    }

    const rate = await findApplicableRate(supabase, data.product_id, data.tenure_months, data.value_date);
    if (rate == null) throw new Error("No published rate for this product and tenure at value date");

    const { data: certNo, error: certErr } = await supabase.rpc("next_fd_certificate_no", { _company_id: cid });
    if (certErr) throw certErr;
    if (!certNo) throw new Error("Failed to allocate certificate number");

    const maturity_date = addMonths(data.value_date, data.tenure_months);

    const { data: fd, error } = await supabase
      .from("fixed_deposit")
      .insert({
        certificate_no: certNo,
        company_id: cid,
        branch_id: staff.branch_id,
        client_id: data.client_id,
        product_id: data.product_id,
        principal: data.principal,
        rate_at_booking: rate,
        wht_rate_at_booking: Number(product.wht_rate),
        tenure_months: data.tenure_months,
        payout_option: data.payout_option,
        settlement_account: data.settlement_account ?? null,
        maturity_instruction: data.maturity_instruction,
        value_date: data.value_date,
        maturity_date,
        status: "pending",
        created_by: userId,
        dispatch_option: data.dispatch_option,
        payout_bank_account_id: data.payout_bank_account_id ?? null,
        interest_payment_mode: data.interest_payment_mode,
        interest_savings_account_id: data.interest_savings_account_id ?? null,
        marketing_officer_id: data.marketing_officer_id ?? null,
        introducer_id: data.introducer_id ?? null,
        introducer_commission_amount: data.introducer_commission_amount ?? null,
        introducer_commission_payment_mode: data.introducer_commission_payment_mode ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    const nomineeRows = data.nominees.map((n) => ({
      deposit_id: fd.id,
      client_id: n.client_id ?? null,
      name: n.name,
      nic: n.nic ?? null,
      relationship: n.relationship ?? null,
      percentage: n.percentage,
    }));
    const { error: nerr } = await supabase.from("fd_nominee").insert(nomineeRows);
    if (nerr) throw nerr;

    return fd;
  });

// Lookups for the New FD form
export const listClientBankAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { client_id: string }) => z.object({ client_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("client_bank_account")
      .select("id, bank_name, branch_name, account_no, account_name, is_primary")
      .eq("client_id", data.client_id)
      .order("is_primary", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const listClientSavingsAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { client_id: string }) => z.object({ client_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("savings_account")
      .select("id, account_no, status, product:product_id(name)")
      .eq("client_id", data.client_id)
      .eq("status", "active")
      .order("account_no");
    if (error) throw error;
    return rows ?? [];
  });

export const listIntroducers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("client")
      .select("id, full_name, national_id, phone, default_commission_pct, default_commission_amount")
      .eq("is_introducer", true)
      .order("full_name");
    if (error) throw error;
    return data ?? [];
  });

export const listMarketingOfficers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("staff")
      .select("id, full_name, role")
      .eq("is_active", true)
      .order("full_name");
    if (error) throw error;
    return data ?? [];
  });

export const approveFixedDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");
    const { data: isAdmin } = await supabase.rpc("is_company_admin", { _company_id: cid });
    if (!isAdmin) throw new Error("Only approvers can activate deposits");

    const { data: fd } = await supabase
      .from("fixed_deposit")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!fd) throw new Error("Deposit not found");
    if (fd.status !== "pending") throw new Error("Only pending deposits can be approved");
    if (fd.created_by === userId) throw new Error("Maker cannot approve their own deposit");

    const rows = buildSchedule({
      principal: Number(fd.principal),
      annualRatePct: Number(fd.rate_at_booking),
      tenureMonths: fd.tenure_months,
      valueDate: fd.value_date,
      payoutOption: fd.payout_option,
      whtRatePct: Number(fd.wht_rate_at_booking),
    });
    const insert = rows.map((r) => ({ ...r, deposit_id: fd.id }));
    const { error: sErr } = await supabase.from("fd_interest_schedule").insert(insert);
    if (sErr) throw sErr;

    const { error: uErr } = await supabase
      .from("fixed_deposit")
      .update({ status: "active", approved_by: userId, approved_at: new Date().toISOString() })
      .eq("id", fd.id);
    if (uErr) throw uErr;

    await supabase.from("fd_transaction").insert({
      deposit_id: fd.id,
      type: "opening",
      amount: fd.principal,
      txn_date: fd.value_date,
      reference: fd.certificate_no,
      created_by: userId,
    });

    // Ledger posting via kernel — DR Cash / CR FD Liability
    const { data: fdProd } = await supabase
      .from("fd_product")
      .select("cash_account_id, deposit_liability_account_id, interest_expense_account_id, wht_liability_account_id")
      .eq("id", fd.product_id)
      .maybeSingle();
    const gl = await resolveFdAccounts(supabase, fdProd);
    if (gl.cash && gl.liab && Number(fd.principal) > 0) {
      await supabase.rpc("post_entry", {
        _entry_date: fd.value_date,
        _reference: `FD-OPEN-${fd.certificate_no}`,
        _description: `FD opening · ${fd.certificate_no}`,
        _lines: [
          { account_id: gl.cash, debit: Number(fd.principal), credit: 0 },
          { account_id: gl.liab, debit: 0, credit: Number(fd.principal) },
        ] as any,
        _branch_id: fd.branch_id,
        _source_module: "fd",
        _source_ref: fd.id,
        _idempotency_key: `fd:open:${fd.id}`,
      });
    }

    return { ok: true };
  });

// ──────────────────────────────────────────────────────────────────────────
// PREMATURE CLOSURE
// ──────────────────────────────────────────────────────────────────────────

async function computePrematureBreakdown(
  supabase: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  fdId: string,
  onDate: string,
) {
  const { data: fd } = await supabase
    .from("fixed_deposit")
    .select("*, product:product_id(penalty_type,penalty_value,wht_rate)")
    .eq("id", fdId)
    .maybeSingle();
  if (!fd) throw new Error("Deposit not found");
  if (fd.status !== "active") throw new Error("Only active deposits can be closed early");

  const totalDays = daysBetween(fd.value_date, onDate);
  if (totalDays <= 0) throw new Error("Closure date must be after value date");
  const monthsHeld = totalDays / 30.4375;
  const completeMonths = Math.floor(monthsHeld);
  const trailingDays = totalDays - completeMonths * Math.round(30.4375);

  // Find published rate for the shorter tenure (round down to complete months, min 1)
  const shorterTenure = Math.max(1, completeMonths);
  const publishedRate = await findApplicableRate(supabase, fd.product_id, shorterTenure, fd.value_date);
  const baseRate = publishedRate ?? Number(fd.rate_at_booking);
  const applicableRate = Math.max(0, baseRate - Number(fd.product.penalty_value));

  const grossEntitled = interestForPeriod(Number(fd.principal), applicableRate, monthsHeld);
  const whtRate = Number(fd.product.wht_rate);
  const whtEntitled = Math.round(grossEntitled * (whtRate / 100) * 100) / 100;
  const netEntitled = Math.round((grossEntitled - whtEntitled) * 100) / 100;

  const { data: paidRows } = await supabase
    .from("fd_interest_schedule")
    .select("net_interest,paid")
    .eq("deposit_id", fdId)
    .eq("paid", true);
  const alreadyPaidNet = (paidRows ?? []).reduce((s: number, r: { net_interest: number }) => s + Number(r.net_interest), 0);

  const excessPaid = Math.max(0, Math.round((alreadyPaidNet - netEntitled) * 100) / 100);
  const finalInterestPayable = Math.max(0, Math.round((netEntitled - alreadyPaidNet) * 100) / 100);
  const settlement = Math.round((Number(fd.principal) - excessPaid + finalInterestPayable) * 100) / 100;

  return {
    fd,
    totalDays,
    completeMonths,
    trailingDays,
    publishedRate: baseRate,
    applicableRate,
    grossEntitled,
    whtEntitled,
    netEntitled,
    alreadyPaidNet,
    excessPaid,
    finalInterestPayable,
    settlement,
  };
}

export const previewPrematureClosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; on_date: string }) =>
    z.object({ id: z.string().uuid(), on_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const r = await computePrematureBreakdown(context.supabase, data.id, data.on_date);
    // Don't leak internal fd shape
    const { fd, ...rest } = r;
    return { ...rest, certificate_no: fd.certificate_no };
  });

export const closePrematurely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; on_date: string; reason?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        on_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");
    const { data: isAdmin } = await supabase.rpc("is_company_admin", { _company_id: cid });
    if (!isAdmin) throw new Error("Only approvers can close deposits early");

    const r = await computePrematureBreakdown(supabase, data.id, data.on_date);

    // Cancel unpaid scheduled rows
    await supabase.from("fd_interest_schedule").delete().eq("deposit_id", data.id).eq("paid", false);

    await supabase
      .from("fixed_deposit")
      .update({
        status: "prematurely_closed",
        closed_at: new Date().toISOString(),
        close_reason: data.reason ?? null,
      })
      .eq("id", data.id);

    await supabase.from("fd_transaction").insert({
      deposit_id: data.id,
      type: "premature_closure",
      amount: r.settlement,
      txn_date: data.on_date,
      reference: `Applicable rate ${r.applicableRate.toFixed(3)}%`,
      created_by: userId,
    });

    // Ledger posting via kernel — DR FD Liability + Interest Expense / CR Cash
    const { data: fdProd2 } = await supabase
      .from("fd_product")
      .select("cash_account_id, deposit_liability_account_id, interest_expense_account_id, wht_liability_account_id")
      .eq("id", r.fd.product_id)
      .maybeSingle();
    const glp = await resolveFdAccounts(supabase, fdProd2);
    if (glp.cash && glp.liab && glp.intr && r.settlement > 0) {
      const principal = Number(r.fd.principal);
      const interestPart = Math.max(0, r.settlement - principal + r.excessPaid);
      await supabase.rpc("post_entry", {
        _entry_date: data.on_date,
        _reference: `FD-CLOSE-${r.fd.certificate_no}`,
        _description: `FD premature closure · ${r.fd.certificate_no}`,
        _lines: [
          { account_id: glp.liab, debit: principal, credit: 0 },
          ...(interestPart > 0 ? [{ account_id: glp.intr, debit: interestPart, credit: 0 }] : []),
          { account_id: glp.cash, debit: 0, credit: r.settlement },
          ...(r.excessPaid > 0 ? [{ account_id: glp.intr, debit: 0, credit: r.excessPaid }] : []),
        ] as any,
        _branch_id: r.fd.branch_id,
        _source_module: "fd",
        _source_ref: r.fd.id,
        _idempotency_key: `fd:close:${r.fd.id}`,
      });
    }

    return { ok: true, settlement: r.settlement };
  });

// ──────────────────────────────────────────────────────────────────────────
// MATURITY
// ──────────────────────────────────────────────────────────────────────────

export const listMaturingDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { window: 7 | 30 | 60 }) => z.object({ window: z.union([z.literal(7), z.literal(30), z.literal(60)]) }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const today = serverToday();
    const end = new Date(serverNow().getTime() + data.window * 86400000).toISOString().slice(0, 10);
    const { data: rows } = await supabase
      .from("fixed_deposit")
      .select(
        "id,certificate_no,principal,rate_at_booking,tenure_months,maturity_date,payout_option,maturity_instruction,client!fixed_deposit_client_id_fkey(id,full_name),product:product_id(id,code,name)",
      )
      .eq("status", "active")
      .lte("maturity_date", end)
      .gte("maturity_date", today)
      .order("maturity_date");
    return rows ?? [];
  });

export const processMaturity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; on_date?: string }) =>
    z.object({ id: z.string().uuid(), on_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");
    const { data: isAdmin } = await supabase.rpc("is_company_admin", { _company_id: cid });
    if (!isAdmin) throw new Error("Only approvers can process maturity");

    const onDate = data.on_date ?? serverToday();

    const { data: fd } = await supabase
      .from("fixed_deposit")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!fd) throw new Error("Deposit not found");
    if (fd.status !== "active") throw new Error("Only active deposits can be matured");

    // Mark unpaid scheduled rows as paid and total the net interest owed today
    const { data: sched } = await supabase
      .from("fd_interest_schedule")
      .select("id,net_interest,paid")
      .eq("deposit_id", data.id)
      .eq("paid", false);
    const owedNet = (sched ?? []).reduce((s, r) => s + Number(r.net_interest), 0);
    if ((sched ?? []).length) {
      await supabase
        .from("fd_interest_schedule")
        .update({ paid: true, paid_date: onDate })
        .in(
          "id",
          (sched ?? []).map((r) => r.id),
        );
    }

    if (fd.maturity_instruction === "payout") {
      const settlement = Math.round((Number(fd.principal) + owedNet) * 100) / 100;
      await supabase
        .from("fixed_deposit")
        .update({ status: "matured", closed_at: new Date().toISOString() })
        .eq("id", fd.id);
      await supabase.from("fd_transaction").insert({
        deposit_id: fd.id,
        type: "maturity_payout",
        amount: settlement,
        txn_date: onDate,
        reference: fd.certificate_no,
        created_by: userId,
      });
      return { ok: true, action: "payout", settlement };
    }

    // Renewals
    const newPrincipal =
      fd.maturity_instruction === "renew_principal_interest"
        ? Math.round((Number(fd.principal) + owedNet) * 100) / 100
        : Number(fd.principal);
    const newRate = await findApplicableRate(supabase, fd.product_id, fd.tenure_months, onDate);
    if (newRate == null) throw new Error("No published rate available for renewal");

    const { data: certNo } = await supabase.rpc("next_fd_certificate_no", { _company_id: fd.company_id });
    if (!certNo) throw new Error("Failed to allocate certificate number");
    const { data: product } = await supabase
      .from("fd_product")
      .select("wht_rate")
      .eq("id", fd.product_id)
      .maybeSingle();

    const newMaturity = addMonths(onDate, fd.tenure_months);
    const { data: newFd, error: nerr } = await supabase
      .from("fixed_deposit")
      .insert({
        certificate_no: certNo,
        company_id: fd.company_id,
        branch_id: fd.branch_id,
        client_id: fd.client_id,
        product_id: fd.product_id,
        principal: newPrincipal,
        rate_at_booking: newRate,
        wht_rate_at_booking: Number(product?.wht_rate ?? fd.wht_rate_at_booking),
        tenure_months: fd.tenure_months,
        payout_option: fd.payout_option,
        settlement_account: fd.settlement_account,
        maturity_instruction: fd.maturity_instruction,
        value_date: onDate,
        maturity_date: newMaturity,
        status: "active",
        parent_fd_id: fd.id,
        approved_by: userId,
        approved_at: new Date().toISOString(),
        created_by: userId,
      })
      .select()
      .single();
    if (nerr) throw nerr;

    // Generate schedule for renewal
    const rows = buildSchedule({
      principal: newPrincipal,
      annualRatePct: Number(newRate),
      tenureMonths: fd.tenure_months,
      valueDate: onDate,
      payoutOption: fd.payout_option,
      whtRatePct: Number(product?.wht_rate ?? fd.wht_rate_at_booking),
    });
    await supabase.from("fd_interest_schedule").insert(rows.map((r) => ({ ...r, deposit_id: newFd.id })));

    // Close old
    await supabase
      .from("fixed_deposit")
      .update({ status: "renewed", closed_at: new Date().toISOString() })
      .eq("id", fd.id);

    // Residual interest payout if principal-only renewal
    const residual =
      fd.maturity_instruction === "renew_principal" ? owedNet : 0;
    if (residual > 0) {
      await supabase.from("fd_transaction").insert({
        deposit_id: fd.id,
        type: "interest_payout",
        amount: residual,
        txn_date: onDate,
        reference: "Residual interest at renewal",
        created_by: userId,
      });
    }
    await supabase.from("fd_transaction").insert({
      deposit_id: fd.id,
      type: "renewal",
      amount: newPrincipal,
      txn_date: onDate,
      reference: `Renewed as ${certNo}`,
      created_by: userId,
    });

    return { ok: true, action: "renewed", new_id: newFd.id, new_certificate: certNo };
  });

// ──────────────────────────────────────────────────────────────────────────
// DAILY MAINTENANCE (manually triggered from UI; wire cron later)
// ──────────────────────────────────────────────────────────────────────────

export const runFdDailyAccrual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = serverToday();
    const { data: active } = await supabase
      .from("fixed_deposit")
      .select("id,principal,rate_at_booking")
      .eq("status", "active");
    let inserted = 0;
    for (const fd of active ?? []) {
      const { data: last } = await supabase
        .from("fd_accrual")
        .select("cumulative_amount")
        .eq("deposit_id", fd.id)
        .order("accrual_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const daily = dailyAccrual(Number(fd.principal), Number(fd.rate_at_booking));
      const cum = Number(last?.cumulative_amount ?? 0) + daily;
      const { error } = await supabase.from("fd_accrual").insert({
        deposit_id: fd.id,
        accrual_date: today,
        daily_amount: daily,
        cumulative_amount: cum,
      });
      if (!error) inserted++;
    }
    return { inserted };
  });

export const runFdInterestPayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = serverToday();
    const { data: due } = await supabase
      .from("fd_interest_schedule")
      .select("id,deposit_id,net_interest,due_date")
      .eq("paid", false)
      .lte("due_date", today);
    let paid = 0;
    for (const row of due ?? []) {
      const { data: fd } = await supabase
        .from("fixed_deposit")
        .select("status,certificate_no,payout_option")
        .eq("id", row.deposit_id)
        .maybeSingle();
      if (!fd || fd.status !== "active" || fd.payout_option !== "monthly") continue;
      await supabase.from("fd_interest_schedule").update({ paid: true, paid_date: today }).eq("id", row.id);
      await supabase.from("fd_transaction").insert({
        deposit_id: row.deposit_id,
        type: "interest_payout",
        amount: row.net_interest,
        txn_date: today,
        reference: `${fd.certificate_no} interest`,
        created_by: userId,
      });
      paid++;
    }
    return { paid };
  });
