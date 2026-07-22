import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAYMENT_METHODS, assertPaymentMethod } from "@/lib/payment-methods";

// ─────────── Ledger kernel helper ───────────
// Resolves GL account ids from savings_product (preferred) or falls back
// to standard chart-of-accounts codes: 1000 cash, 2100 deposits liability,
// 4100 fee income, 5100 interest expense.
async function resolveSavingsAccounts(supabase: any, product: any) {
  const need: Record<string, { fromProduct: string | null; code: string }> = {
    cash: { fromProduct: product?.cash_account_id ?? null, code: "1000" },
    liab: { fromProduct: product?.deposit_liability_account_id ?? null, code: "2100" },
    fee: { fromProduct: product?.fee_income_account_id ?? null, code: "4100" },
    intr: { fromProduct: product?.interest_expense_account_id ?? null, code: "5100" },
  };
  const missingCodes = Object.values(need)
    .filter((n) => !n.fromProduct)
    .map((n) => n.code);
  let byCode: Record<string, string> = {};
  if (missingCodes.length) {
    const { data: accts } = await supabase
      .from("gl_account")
      .select("id, code")
      .in("code", missingCodes);
    byCode = Object.fromEntries((accts ?? []).map((a: any) => [a.code, a.id]));
  }
  const resolved: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(need)) resolved[k] = v.fromProduct ?? byCode[v.code] ?? null;
  return resolved as {
    cash: string | null;
    liab: string | null;
    fee: string | null;
    intr: string | null;
  };
}

// ─────────── Products ───────────
export const listSavingsProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) return [];
    const { data } = await (supabase as any)
      .from("savings_product")
      .select("*")
      .eq("company_id", cid)
      .order("name");
    return data ?? [];
  });

export const upsertSavingsProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      id?: string;
      code: string;
      name: string;
      currency?: string;
      interest_rate_pct?: number;
      min_opening_balance?: number;
      min_balance?: number;
      opening_fee?: number;
      closure_fee?: number;
      passbook_required?: boolean;
      passbook_series_prefix?: string | null;
      dormancy_days?: number;
      active?: boolean;
      cash_account_id?: string | null;
      deposit_liability_account_id?: string | null;
      fee_income_account_id?: string | null;
      interest_expense_account_id?: string | null;
      unclaimed_deposit_liability_account_id?: string | null;
      segment?: "normal" | "minor" | "senior" | "fixed" | "transaction";
    }) => i,
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No company");
    const row = { ...data, company_id: cid };
    const { data: out, error } = await (supabase as any)
      .from("savings_product")
      .upsert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const toggleSavingsProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; active: boolean }) => i)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await (supabase as any)
      .from("savings_product")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────── Charges ───────────
export const listSavingsCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) return [];
    const { data: charges, error } = await (supabase as any)
      .from("savings_charge")
      .select("id, name, amount, frequency, income_account_id, active, created_at")
      .eq("company_id", cid)
      .order("name");
    if (error) throw new Error(error.message);
    const ids = (charges ?? []).map((c: any) => c.id);
    let links: any[] = [];
    if (ids.length) {
      const { data: lk } = await (supabase as any)
        .from("savings_charge_product")
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

export const upsertSavingsCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      id?: string;
      name: string;
      amount: number;
      frequency: "one_time" | "monthly" | "annual";
      income_account_id: string;
      active?: boolean;
      product_ids: string[];
    }) => i,
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No company");
    const row = {
      id: data.id,
      company_id: cid,
      name: data.name,
      amount: data.amount,
      frequency: data.frequency,
      income_account_id: data.income_account_id,
      active: data.active ?? true,
    };
    const { data: out, error } = await (supabase as any)
      .from("savings_charge")
      .upsert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Reset product links
    await (supabase as any).from("savings_charge_product").delete().eq("charge_id", out.id);
    if (data.product_ids.length) {
      const rows = data.product_ids.map((pid) => ({ charge_id: out.id, product_id: pid }));
      const { error: linkErr } = await (supabase as any)
        .from("savings_charge_product")
        .insert(rows);
      if (linkErr) throw new Error(linkErr.message);
    }
    return out;
  });

export const toggleSavingsCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; active: boolean }) => i)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await (supabase as any)
      .from("savings_charge")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSavingsCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await (supabase as any).from("savings_charge").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────── Accounts ───────────
export const listSavingsAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { status?: "active" | "dormant" | "frozen" | "closed" | "all" }) => i)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) return [];
    let q = (supabase as any)
      .from("savings_account")
      .select(
        "id, account_no, status, balance, available_balance, currency, opened_on, closed_on, external_ref, client:client_id(id, full_name, phone), branch:branch_id(id, name), product:product_id(id, name, code, passbook_required, passbook_series_prefix)",
      )
      .eq("company_id", cid)
      .order("opened_on", { ascending: false });
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const createSavingsAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      client_id: string;
      branch_id: string;
      product_id: string;
      opening_deposit: number;
      channel?: "branch" | "atm" | "ceft" | "internet_banking" | "mobile" | "api" | "other";
      external_ref?: string | null;
      narration?: string | null;
      statement_preference?: "monthly" | "quarterly" | "on_demand" | "none" | null;
      communication_preference?: "email" | "sms" | "both" | "none" | null;
      special_instructions?: string | null;
      holders?: Array<{
        client_id?: string | null;
        role: "primary" | "joint" | "minor_guardian" | "trustee" | "power_of_attorney";
        ownership_pct?: number;
        full_name?: string | null;
        nic?: string | null;
        relation?: string | null;
        is_signatory?: boolean;
        signing_order?: number | null;
      }>;
      nominees?: Array<{
        full_name: string;
        nic?: string | null;
        relation?: string | null;
        percentage: number;
        contact?: string | null;
      }>;
      mandate?: {
        signing_rule: "single" | "any_one" | "jointly" | "any_two" | "custom";
        min_signatories?: number | null;
        rule_details?: unknown;
      } | null;
    }) =>
      z
        .object({
          client_id: z.string().uuid(),
          branch_id: z.string().uuid(),
          product_id: z.string().uuid(),
          opening_deposit: z.number().min(0),
          channel: z.string().optional(),
          external_ref: z.string().nullable().optional(),
          narration: z.string().nullable().optional(),
          statement_preference: z.string().nullable().optional(),
          communication_preference: z.string().nullable().optional(),
          special_instructions: z.string().nullable().optional(),
          holders: z
            .array(
              z.object({
                client_id: z.string().uuid().nullable().optional(),
                role: z.enum([
                  "primary",
                  "joint",
                  "minor_guardian",
                  "trustee",
                  "power_of_attorney",
                ]),
                ownership_pct: z.number().min(0).max(100).optional(),
                full_name: z.string().nullable().optional(),
                nic: z.string().nullable().optional(),
                relation: z.string().nullable().optional(),
                is_signatory: z.boolean().optional(),
                signing_order: z.number().int().nullable().optional(),
              }),
            )
            .optional(),
          nominees: z
            .array(
              z.object({
                full_name: z.string().min(1),
                nic: z.string().nullable().optional(),
                relation: z.string().nullable().optional(),
                percentage: z.number().min(0).max(100),
                contact: z.string().nullable().optional(),
              }),
            )
            .optional(),
          mandate: z
            .object({
              signing_rule: z.enum(["single", "any_one", "jointly", "any_two", "custom"]),
              min_signatories: z.number().int().min(1).nullable().optional(),
              rule_details: z.unknown().optional(),
            })
            .nullable()
            .optional(),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: acct, error } = await supabase.rpc(
      "open_savings_account" as any,
      {
        _client_id: data.client_id,
        _branch_id: data.branch_id,
        _product_id: data.product_id,
        _opening_deposit: Number(data.opening_deposit),
        _channel: data.channel ?? "branch",
        _external_ref: data.external_ref ?? null,
        _narration: data.narration ?? null,
        _statement_preference: data.statement_preference ?? null,
        _communication_preference: data.communication_preference ?? null,
        _special_instructions: data.special_instructions ?? null,
        _holders: (data.holders ?? []) as any,
        _nominees: (data.nominees ?? []) as any,
        _mandate: (data.mandate ?? null) as any,
        _idempotency_key: data.external_ref ?? null,
      } as any,
    );
    if (error) throw new Error(error.message);

    // Fan out savings.opened webhook — best effort.
    try {
      const acctId = (acct as any)?.account_id ?? (acct as any)?.id ?? null;
      if (acctId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enqueueWebhookForCompany } = await import("@/lib/webhooks.server");
        const { data: row } = await supabaseAdmin
          .from("savings_account")
          .select(
            "id, account_no, client_id, branch_id, product_id, currency, balance, available_balance, status, opened_on, company_id",
          )
          .eq("id", acctId)
          .maybeSingle();
        const companyId = (row as any)?.company_id as string | undefined;
        if (companyId && row) {
          const { company_id: _c, ...payload } = row as any;
          for (const env of ["sandbox", "production"] as const) {
            await enqueueWebhookForCompany(supabaseAdmin as any, {
              company_id: companyId,
              env,
              event_type: "savings.opened",
              event_id: acctId as string,
              payload: { event: "savings.opened", savings_account: payload },
            });
          }
        }
      }
    } catch {
      // dispatcher will retry any queued rows; opening stands
    }

    return acct;
  });

// Workflow-controlled account opening. Creates the account in pending_approval
// (or pending_funding when no workflow is configured) without moving any money.
// The opening deposit intent + payment method are stored on the account and
// picked up later at the funding step.
export const submitSavingsAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      client_id: string;
      branch_id: string;
      product_id: string;
      opening_deposit: number;
      payment_method?: (typeof PAYMENT_METHODS)[number] | null;
      payment_details?: Record<string, unknown> | null;
      channel?: "branch" | "atm" | "ceft" | "internet_banking" | "mobile" | "api" | "other";
      external_ref?: string | null;
      narration?: string | null;
      statement_preference?: "monthly" | "quarterly" | "on_demand" | "none" | null;
      communication_preference?: "email" | "sms" | "both" | "none" | null;
      special_instructions?: string | null;
      holders?: Array<{
        client_id?: string | null;
        role: "primary" | "joint" | "minor_guardian" | "trustee" | "power_of_attorney";
        ownership_pct?: number;
        full_name?: string | null;
        nic?: string | null;
        relation?: string | null;
        is_signatory?: boolean;
        signing_order?: number | null;
      }>;
      nominees?: Array<{
        full_name: string;
        nic?: string | null;
        relation?: string | null;
        percentage: number;
        contact?: string | null;
      }>;
      mandate?: {
        signing_rule: "single" | "any_one" | "jointly" | "any_two" | "custom";
        min_signatories?: number | null;
        rule_details?: unknown;
      } | null;
    }) =>
      z
        .object({
          client_id: z.string().uuid(),
          branch_id: z.string().uuid(),
          product_id: z.string().uuid(),
          opening_deposit: z.number().min(0),
          payment_method: z.string().nullable().optional(),
          payment_details: z.record(z.unknown()).nullable().optional(),
          channel: z.string().optional(),
          external_ref: z.string().nullable().optional(),
          narration: z.string().nullable().optional(),
          statement_preference: z.string().nullable().optional(),
          communication_preference: z.string().nullable().optional(),
          special_instructions: z.string().nullable().optional(),
          holders: z.array(z.any()).optional(),
          nominees: z.array(z.any()).optional(),
          mandate: z.any().nullable().optional(),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: acct, error } = await supabase.rpc(
      "submit_savings_account_opening" as any,
      {
        _client_id: data.client_id,
        _branch_id: data.branch_id,
        _product_id: data.product_id,
        _opening_deposit: Number(data.opening_deposit),
        _payment_method: data.payment_method ?? null,
        _payment_details: (data.payment_details ?? null) as any,
        _channel: data.channel ?? "branch",
        _external_ref: data.external_ref ?? null,
        _narration: data.narration ?? null,
        _statement_preference: data.statement_preference ?? null,
        _communication_preference: data.communication_preference ?? null,
        _special_instructions: data.special_instructions ?? null,
        _holders: (data.holders ?? []) as any,
        _nominees: (data.nominees ?? []) as any,
        _mandate: (data.mandate ?? null) as any,
        _idempotency_key: data.external_ref ?? null,
      } as any,
    );
    if (error) throw new Error(error.message);
    return acct;
  });

// Activate a pending_funding account with the initial deposit. GL accounts
// come from product setup; the RPC raises if any required mapping is missing.
export const activateSavingsAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      account_id: string;
      opening_deposit?: number | null;
      payment_method?: (typeof PAYMENT_METHODS)[number] | null;
      payment_details?: Record<string, unknown> | null;
      channel?: "branch" | "atm" | "ceft" | "internet_banking" | "mobile" | "api" | "other";
      external_ref?: string | null;
      idempotency_key?: string | null;
    }) =>
      z
        .object({
          account_id: z.string().uuid(),
          opening_deposit: z.number().positive().nullable().optional(),
          payment_method: z.string().nullable().optional(),
          payment_details: z.record(z.unknown()).nullable().optional(),
          channel: z.string().optional(),
          external_ref: z.string().nullable().optional(),
          idempotency_key: z.string().nullable().optional(),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: result, error } = await supabase.rpc(
      "activate_savings_account" as any,
      {
        _account_id: data.account_id,
        _opening_deposit: data.opening_deposit ?? null,
        _payment_method: data.payment_method ?? null,
        _payment_details: (data.payment_details ?? null) as any,
        _channel: data.channel ?? "branch",
        _external_ref: data.external_ref ?? null,
        _idempotency_key: data.idempotency_key ?? null,
      } as any,
    );
    if (error) throw new Error(error.message);
    return result;
  });

export const postSavingsTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      account_id: string;
      txn_type: "deposit" | "withdrawal" | "interest" | "fee" | "adjustment";
      amount: number;
      channel?: "branch" | "atm" | "ceft" | "internet_banking" | "mobile" | "api" | "other";
      reference?: string | null;
      external_ref?: string | null;
      narration?: string | null;
      idempotency_key?: string | null;
      payment_method?: (typeof PAYMENT_METHODS)[number];
      bank_account_id?: string | null;
      savings_account_id?: string | null;
    }) => i,
  )
  .handler(async ({ context, data }) => {
    // Server-side guard: withdrawals must use an allowed payment method.
    if (data.txn_type === "withdrawal") {
      if (!data.payment_method) throw new Error("Payment method is required for withdrawals");
      assertPaymentMethod("savings_withdrawal", {
        payment_method: data.payment_method,
        bank_account_id: data.bank_account_id ?? null,
        savings_account_id: data.savings_account_id ?? null,
        reference: data.reference ?? null,
      });
    }
    const { supabase } = context;

    // Delegate the entire deposit/withdrawal to the atomic RPC:
    //   * row-locks the account
    //   * subtracts active holds/liens from available balance
    //   * enforces block statuses (frozen / debit_blocked / credit_blocked / fully_blocked / closed)
    //   * dedupes on idempotency_key
    //   * posts the balanced GL entry
    const paymentDetails =
      data.payment_method || data.bank_account_id || data.savings_account_id
        ? {
            payment_method: data.payment_method ?? null,
            bank_account_id: data.bank_account_id ?? null,
            savings_account_id: data.savings_account_id ?? null,
          }
        : null;

    const { data: newTxnId, error: rpcErr } = await supabase.rpc("record_savings_txn", {
      _account_id: data.account_id,
      _txn_type: data.txn_type,
      _amount: Math.abs(data.amount),
      _channel: data.channel ?? "branch",
      _reference: data.reference ?? undefined,
      _external_ref: data.external_ref ?? undefined,
      _narration: data.narration ?? undefined,
      _payment_method: data.payment_method ?? undefined,
      _payment_details: paymentDetails as any,
      _idempotency_key: data.idempotency_key ?? undefined,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    const { data: txn } = await (supabase as any)
      .from("savings_transaction")
      .select("*")
      .eq("id", newTxnId)
      .single();
    return txn;
  });

export const reverseSavingsTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { txn_id: string; reason: string }) => i)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    if (!data.reason || data.reason.trim().length < 3)
      throw new Error("Reversal reason is required");
    const { data: newId, error } = await supabase.rpc("reverse_savings_txn", {
      _txn_id: data.txn_id,
      _reason: data.reason.trim(),
    });
    if (error) throw new Error(error.message);
    return { reversal_txn_id: newId };
  });

export const closeSavingsAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      account_id: string;
      reason: string;
      payout_channel?: "branch" | "atm" | "ceft" | "internet_banking" | "mobile" | "api" | "other";
      external_ref?: string | null;
    }) =>
      z
        .object({
          account_id: z.string().uuid(),
          reason: z.string().min(3),
          payout_channel: z.string().optional(),
          external_ref: z.string().nullable().optional(),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: closed, error } = await supabase.rpc(
      "close_savings_account" as any,
      {
        _account_id: data.account_id,
        _reason: data.reason,
        _payout_channel: data.payout_channel ?? "branch",
        _external_ref: data.external_ref ?? null,
        _idempotency_key: null,
      } as any,
    );
    if (error) throw new Error(error.message);
    return closed;
  });

export const listAccountTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { account_id: string }) =>
    z.object({ account_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows } = await (supabase as any)
      .from("savings_transaction")
      .select("*")
      .eq("account_id", data.account_id)
      .order("created_at", { ascending: false })
      .limit(100);
    return rows ?? [];
  });

// ─────────── Passbook ───────────
export const listPassbookStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) return [];
    const { data } = await (supabase as any)
      .from("passbook_stock")
      .select(
        "*, branch:branch_id(id, name), product:product_id(id, name, code, passbook_series_prefix)",
      )
      .eq("company_id", cid)
      .order("received_on", { ascending: false });
    return data ?? [];
  });

export const receivePassbookStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      branch_id: string;
      product_id?: string | null;
      series_prefix?: string | null;
      serial_from: number;
      serial_to: number;
      supplier?: string | null;
      notes?: string | null;
    }) => i,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No company");
    if (data.serial_to < data.serial_from) throw new Error("Serial-to must be >= serial-from");
    const qty = data.serial_to - data.serial_from + 1;
    const { data: staff } = await (supabase as any)
      .from("staff")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: out, error } = await (supabase as any)
      .from("passbook_stock")
      .insert({
        company_id: cid,
        branch_id: data.branch_id,
        product_id: data.product_id ?? null,
        series_prefix: data.series_prefix ?? null,
        serial_from: data.serial_from,
        serial_to: data.serial_to,
        quantity_received: qty,
        supplier: data.supplier ?? null,
        notes: data.notes ?? null,
        received_by: staff?.id ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const listPassbookIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) return [];
    const { data } = await (supabase as any)
      .from("passbook_issue")
      .select(
        "*, account:account_id(account_no, client:client_id(full_name)), stock:stock_id(series_prefix, branch:branch_id(name))",
      )
      .eq("company_id", cid)
      .order("issued_on", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const issuePassbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      stock_id: string;
      account_id: string;
      serial_no?: number | null;
      notes?: string | null;
    }) => i,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No company");
    const { data: staff } = await (supabase as any)
      .from("staff")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: stock, error: serr } = await (supabase as any)
      .from("passbook_stock")
      .select("*")
      .eq("id", data.stock_id)
      .single();
    if (serr) throw new Error(serr.message);
    if (stock.status === "exhausted" || stock.status === "void")
      throw new Error("This stock batch is not available");

    // Determine serial: use next available (serial_from + quantity_issued) if not provided
    const serial = data.serial_no ?? Number(stock.serial_from) + Number(stock.quantity_issued);
    if (serial < Number(stock.serial_from) || serial > Number(stock.serial_to))
      throw new Error("Serial is outside the batch range");

    // Ensure serial not already issued
    const { data: existing } = await (supabase as any)
      .from("passbook_issue")
      .select("id")
      .eq("stock_id", data.stock_id)
      .eq("serial_no", serial)
      .maybeSingle();
    if (existing) throw new Error(`Serial ${serial} is already issued`);

    const { data: issue, error: ierr } = await (supabase as any)
      .from("passbook_issue")
      .insert({
        company_id: cid,
        stock_id: data.stock_id,
        account_id: data.account_id,
        serial_no: serial,
        series_prefix: stock.series_prefix,
        issued_by: staff?.id ?? null,
        notes: data.notes ?? null,
      })
      .select()
      .single();
    if (ierr) throw new Error(ierr.message);

    const newIssued = Number(stock.quantity_issued) + 1;
    const newStatus =
      newIssued >= Number(stock.quantity_received)
        ? "exhausted"
        : newIssued > 0
          ? "partially_issued"
          : stock.status;
    await (supabase as any)
      .from("passbook_stock")
      .update({ quantity_issued: newIssued, status: newStatus })
      .eq("id", data.stock_id);
    return issue;
  });

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Holds / Blocks / Liens
// ─────────────────────────────────────────────────────────────────────────────

const HOLD_TYPES = [
  "debit_block",
  "credit_block",
  "full_block",
  "amount_hold",
  "lien",
  "legal",
  "aml",
  "deceased",
  "customer",
  "loan_lien",
  "administrative",
  "temporary",
] as const;

export const listSavingsHolds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        account_id: z.string().uuid().optional(),
        active_only: z.boolean().optional(),
      })
      .partial()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("savings_hold")
      .select(
        "id, account_id, hold_type, amount, reason_code, reason, doc_ref, effective_from, expires_at, active, approval_state, release_status, release_requested_at, release_requested_reason, release_workflow_instance_id, released_at, created_at, account:account_id(id, account_no, client:client_id(id, full_name))",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.account_id) q = q.eq("account_id", data.account_id);
    if (data.active_only) q = q.eq("active", true);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const createSavingsHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        account_id: z.string().uuid(),
        hold_type: z.enum(HOLD_TYPES),
        amount: z.number().nonnegative().default(0),
        reason: z.string().min(3),
        reason_code: z.string().optional().nullable(),
        doc_ref: z.string().optional().nullable(),
        expires_at: z.string().datetime().optional().nullable(),
        linked_loan_id: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: acct, error: aErr } = await supabase
      .from("savings_account")
      .select("id, company_id")
      .eq("id", data.account_id)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!acct) throw new Error("Account not found");
    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: hold, error } = await supabase
      .from("savings_hold")
      .insert({
        company_id: (acct as any).company_id,
        account_id: data.account_id,
        hold_type: data.hold_type,
        amount: data.amount,
        reason: data.reason,
        reason_code: data.reason_code ?? null,
        doc_ref: data.doc_ref ?? null,
        expires_at: data.expires_at ?? null,
        linked_loan_id: data.linked_loan_id ?? null,
        active: true,
        approval_state: "approved",
        created_by: staff?.id ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return hold;
  });

export const requestSavingsHoldRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hold_id: z.string().uuid(),
        reason: z.string().min(3),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Load hold to build reference label and confirm eligibility.
    const { data: hold, error: hErr } = await supabase
      .from("savings_hold")
      .select(
        "id, company_id, hold_type, amount, active, release_status, account:account_id(account_no, client:client_id(full_name))",
      )
      .eq("id", data.hold_id)
      .maybeSingle();
    if (hErr) throw hErr;
    if (!hold) throw new Error("Hold not found");
    if (!(hold as any).active) throw new Error("Hold already inactive");
    if (!["none", "rejected"].includes((hold as any).release_status))
      throw new Error("Release already in progress");

    // Find active workflow definition for this tx type in the company.
    const { data: wf, error: wErr } = await supabase
      .from("workflow_definition")
      .select("id, is_enabled")
      .eq("company_id", (hold as any).company_id)
      .eq("transaction_type", "savings_hold_release")
      .eq("is_enabled", true)
      .maybeSingle();
    if (wErr) throw wErr;
    if (!wf) throw new Error("No active workflow configured for Savings hold release");

    const acct: any = (hold as any).account;
    const refLabel = `Release ${(hold as any).hold_type} · ${acct?.account_no ?? "acct"}${
      acct?.client?.full_name ? " · " + acct.client.full_name : ""
    }`;
    const { data: inst, error: iErr } = await supabase
      .from("workflow_instance")
      .insert({
        workflow_id: (wf as any).id,
        company_id: (hold as any).company_id,
        transaction_type: "savings_hold_release",
        reference_id: data.hold_id,
        reference_label: refLabel,
        amount: Number((hold as any).amount ?? 0) || null,
        initiated_by: userId,
        current_step: 1,
      })
      .select("id")
      .single();
    if (iErr) throw iErr;

    const { error: rErr } = await supabase.rpc(
      "request_savings_hold_release" as any,
      {
        _hold_id: data.hold_id,
        _instance_id: (inst as any).id,
        _reason: data.reason,
      } as any,
    );
    if (rErr) throw new Error(rErr.message);
    return { ok: true, instance_id: (inst as any).id };
  });

// ─────────── Phase 5: Loan repayment mandates ───────────
export const listSavingsLoanMandates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        loan_id: z.string().uuid().optional(),
        savings_account_id: z.string().uuid().optional(),
        status: z.enum(["pending", "active", "suspended", "cancelled", "all"]).optional(),
      })
      .partial()
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    let q = (supabase as any)
      .from("savings_loan_mandate")
      .select(
        "*, savings_account:savings_account_id(id, account_no, balance, available_balance, status, client:client_id(id, full_name)), loan:loan_id(id, loan_no, principal, status, outstanding_principal)",
      )
      .order("created_at", { ascending: false });
    if (data.loan_id) q = q.eq("loan_id", data.loan_id);
    if (data.savings_account_id) q = q.eq("savings_account_id", data.savings_account_id);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const createSavingsLoanMandate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        savings_account_id: z.string().uuid(),
        loan_id: z.string().uuid(),
        mandate_type: z.enum(["arrears_only", "full_installment", "minimum_due", "fixed_amount"]),
        fixed_amount: z.number().nonnegative().optional().nullable(),
        max_amount_per_run: z.number().nonnegative().optional().nullable(),
        min_protected_balance: z.number().nonnegative().default(0),
        priority: z.number().int().min(1).max(999).default(100),
        morning_run: z.boolean().default(true),
        afternoon_run: z.boolean().default(true),
        allow_partial: z.boolean().default(true),
        ignore_debit_block: z.boolean().default(false),
        effective_from: z.string().optional().nullable(),
        effective_to: z.string().optional().nullable(),
        consent_reference: z.string().max(120).optional().nullable(),
        consent_date: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Resolve company + client from savings account & confirm the loan belongs to the same client
    const { data: acct, error: aErr } = await (supabase as any)
      .from("savings_account")
      .select("id, company_id, client_id")
      .eq("id", data.savings_account_id)
      .single();
    if (aErr) throw aErr;
    const { data: loan, error: lErr } = await (supabase as any)
      .from("loan")
      .select("id, client_id")
      .eq("id", data.loan_id)
      .single();
    if (lErr) throw lErr;
    if (loan.client_id !== acct.client_id) {
      throw new Error("Savings account and loan must belong to the same customer");
    }
    if (data.mandate_type === "fixed_amount" && !(Number(data.fixed_amount) > 0)) {
      throw new Error("Fixed amount is required for fixed-amount mandates");
    }

    const { data: staff } = await (supabase as any)
      .from("staff")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const insert = {
      company_id: acct.company_id,
      client_id: acct.client_id,
      savings_account_id: data.savings_account_id,
      loan_id: data.loan_id,
      mandate_type: data.mandate_type,
      fixed_amount: data.fixed_amount ?? null,
      max_amount_per_run: data.max_amount_per_run ?? null,
      min_protected_balance: data.min_protected_balance ?? 0,
      priority: data.priority ?? 100,
      morning_run: data.morning_run ?? true,
      afternoon_run: data.afternoon_run ?? true,
      allow_partial: data.allow_partial ?? true,
      ignore_debit_block: data.ignore_debit_block ?? false,
      effective_from: data.effective_from || new Date().toISOString().slice(0, 10),
      effective_to: data.effective_to || null,
      consent_reference: data.consent_reference ?? null,
      consent_date: data.consent_date ?? null,
      status: "pending",
      created_by: staff?.id ?? null,
    };
    const { data: row, error } = await (supabase as any)
      .from("savings_loan_mandate")
      .insert(insert)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const setSavingsLoanMandateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["activate", "suspend", "cancel"]),
        reason: z.string().max(400).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: staff } = await (supabase as any)
      .from("staff")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const patch: any = { updated_at: new Date().toISOString() };
    if (data.action === "activate") {
      patch.status = "active";
      patch.approved_by = staff?.id ?? null;
      patch.approved_at = new Date().toISOString();
    } else if (data.action === "suspend") {
      patch.status = "suspended";
      patch.suspended_at = new Date().toISOString();
      patch.suspended_reason = data.reason ?? null;
    } else {
      patch.status = "cancelled";
      patch.cancelled_at = new Date().toISOString();
      patch.cancelled_reason = data.reason ?? null;
    }
    const { data: row, error } = await (supabase as any)
      .from("savings_loan_mandate")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const listSavingsAutoCollectionRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ limit: z.number().int().min(1).max(200).optional() })
      .partial()
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await (supabase as any)
      .from("savings_auto_collection_run")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw error;
    return rows ?? [];
  });

export const listSavingsAutoCollectionResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ run_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await (supabase as any)
      .from("savings_auto_collection_result")
      .select(
        "*, savings_account:savings_account_id(account_no, client:client_id(full_name)), loan:loan_id(loan_no)",
      )
      .eq("run_id", data.run_id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

// Manual trigger — reuses the same server-role RPC; requires savings.automation.run permission
// enforced at the DB level (RPC checks) or via admin bypass. Here we simply invoke.
export const triggerSavingsAutoCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        window: z.enum(["morning", "afternoon", "manual"]).default("manual"),
        business_date: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: cid, error: cErr } = await supabase.rpc("current_company_id" as any);
    if (cErr) throw cErr;
    if (!cid) throw new Error("No active company");
    // Only company admin or automation.run permission may manually trigger.
    const { data: allowed } = await supabase.rpc(
      "has_permission" as any,
      {
        _user_id: (context as any).userId,
        _code: "savings.automation.run",
        _company_id: cid,
      } as any,
    );
    const { data: isAdmin } = await supabase.rpc(
      "is_company_admin" as any,
      {
        _company_id: cid,
      } as any,
    );
    if (!allowed && !isAdmin) throw new Error("Not authorized to run auto-collection");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("run_savings_auto_collection", {
      _company_id: cid,
      _window: data.window,
      _business_date: data.business_date ?? new Date().toISOString().slice(0, 10),
      _triggered_by: null,
    } as any);
    if (error) throw new Error(error.message);
    return result;
  });

// ─────────── Interest: accruals, postings & WHT rules ───────────
export const listSavingsAccruals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { account_id?: string; from?: string; to?: string; limit?: number } = {}) =>
    z
      .object({
        account_id: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("savings_interest_accrual")
      .select(
        "id, account_id, accrual_date, eligible_balance, rate_pct, day_count, gross_interest, created_at",
      )
      .order("accrual_date", { ascending: false })
      .limit(data.limit);
    if (data.account_id) q = q.eq("account_id", data.account_id);
    if (data.from) q = q.gte("accrual_date", data.from);
    if (data.to) q = q.lte("accrual_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listSavingsPostings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { account_id?: string; limit?: number } = {}) =>
    z
      .object({
        account_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("savings_interest_posting")
      .select(
        "id, account_id, period_start, period_end, gross_interest, wht_amount, net_interest, wht_rule_id, gl_entry_id, created_at",
      )
      .order("period_end", { ascending: false })
      .limit(data.limit);
    if (data.account_id) q = q.eq("account_id", data.account_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const runSavingsInterestAccrual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { business_date?: string } = {}) =>
    z.object({ business_date: z.string().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: cid } = await context.supabase.rpc("current_company_id" as any);
    if (!cid) throw new Error("No active company");
    const { data: allowed } = await context.supabase.rpc(
      "has_permission" as any,
      {
        _user_id: (context as any).userId,
        _code: "savings.automation.run",
        _company_id: cid,
      } as any,
    );
    const { data: isAdmin } = await context.supabase.rpc(
      "is_company_admin" as any,
      {
        _company_id: cid,
      } as any,
    );
    if (!allowed && !isAdmin) throw new Error("Not authorized");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc(
      "accrue_savings_interest_daily" as any,
      {
        _company_id: cid,
        _business_date: data.business_date ?? new Date().toISOString().slice(0, 10),
      } as any,
    );
    if (error) throw new Error(error.message);
    return result;
  });

export const runSavingsInterestCapitalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { period_end?: string; force?: boolean } = {}) =>
    z
      .object({
        period_end: z.string().optional(),
        force: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: cid } = await context.supabase.rpc("current_company_id" as any);
    if (!cid) throw new Error("No active company");
    const { data: allowed } = await context.supabase.rpc(
      "has_permission" as any,
      {
        _user_id: (context as any).userId,
        _code: "savings.automation.run",
        _company_id: cid,
      } as any,
    );
    const { data: isAdmin } = await context.supabase.rpc(
      "is_company_admin" as any,
      {
        _company_id: cid,
      } as any,
    );
    if (!allowed && !isAdmin) throw new Error("Not authorized");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc(
      "capitalize_savings_interest" as any,
      {
        _company_id: cid,
        _period_end: data.period_end ?? new Date().toISOString().slice(0, 10),
        _force: data.force,
      } as any,
    );
    if (error) throw new Error(error.message);
    return result;
  });

export const listSavingsWhtRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("savings_wht_rule")
      .select("*, product:product_id(id, code, name), wht_gl:wht_gl_account_id(id, code, name)")
      .order("effective_from", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const upsertSavingsWhtRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        id: z.string().uuid().optional(),
        jurisdiction: z.string().default("LK"),
        tax_type: z.string().default("wht"),
        residency: z.enum(["any", "resident", "non_resident"]).default("any"),
        entity_type: z.enum(["any", "individual", "entity"]).default("any"),
        product_id: z.string().uuid().nullable().optional(),
        effective_from: z.string(),
        effective_to: z.string().nullable().optional(),
        rate_pct: z.number().min(0).max(100),
        threshold: z.number().min(0).default(0),
        wht_gl_account_id: z.string().uuid(),
        active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: cid } = await context.supabase.rpc("current_company_id" as any);
    if (!cid) throw new Error("No active company");
    const payload = { ...data, company_id: cid, created_by: (context as any).userId };
    if (data.id) {
      const { error } = await context.supabase
        .from("savings_wht_rule")
        .update(payload)
        .eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("savings_wht_rule")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const toggleSavingsWhtRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; active: boolean }) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("savings_wht_rule")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ─────────── Phase 7: Transfers, adjustments, standing orders ───────────

export const postSavingsTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      from_account_id: string;
      to_account_id: string;
      amount: number;
      channel?: string;
      reference?: string | null;
      narration?: string | null;
      idempotency_key?: string | null;
    }) =>
      z
        .object({
          from_account_id: z.string().uuid(),
          to_account_id: z.string().uuid(),
          amount: z.number().positive(),
          channel: z.string().optional(),
          reference: z.string().nullable().optional(),
          narration: z.string().nullable().optional(),
          idempotency_key: z.string().nullable().optional(),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    if (data.from_account_id === data.to_account_id)
      throw new Error("From and to accounts must differ");
    const { data: res, error } = await context.supabase.rpc("post_savings_transfer", {
      _from_account_id: data.from_account_id,
      _to_account_id: data.to_account_id,
      _amount: data.amount,
      _channel: data.channel ?? "branch",
      _reference: data.reference ?? undefined,
      _narration: data.narration ?? undefined,
      _idempotency_key: data.idempotency_key ?? undefined,
    } as any);
    if (error) throw new Error(error.message);
    return res as { ok: boolean; out_txn_id: string; in_txn_id: string; reference: string };
  });

export const postSavingsAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      account_id: string;
      direction: "credit" | "debit";
      amount: number;
      reason: string;
      reference?: string | null;
      idempotency_key?: string | null;
    }) =>
      z
        .object({
          account_id: z.string().uuid(),
          direction: z.enum(["credit", "debit"]),
          amount: z.number().positive(),
          reason: z.string().min(3),
          reference: z.string().nullable().optional(),
          idempotency_key: z.string().nullable().optional(),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    // Adjustments are posted as signed 'adjustment' savings transactions via RPC.
    const signed = data.direction === "credit" ? data.amount : -data.amount;
    const { data: txnId, error } = await context.supabase.rpc("record_savings_txn", {
      _account_id: data.account_id,
      _txn_type: "adjustment",
      _amount: signed,
      _channel: "branch",
      _reference: data.reference ?? undefined,
      _narration: `Adjustment (${data.direction}): ${data.reason}`,
      _idempotency_key: data.idempotency_key ?? undefined,
    } as any);
    if (error) throw new Error(error.message);
    return { txn_id: txnId as string };
  });

export const listStandingOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { status?: "active" | "paused" | "cancelled" | "completed" | "all" }) => i)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) return [];
    let q = (supabase as any)
      .from("savings_standing_order")
      .select(
        "*, from_account:from_account_id(id, account_no, client:client_id(full_name)), to_account:to_account_id(id, account_no, client:client_id(full_name))",
      )
      .eq("company_id", cid)
      .order("next_run_date", { ascending: true });
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertStandingOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      id?: string;
      from_account_id: string;
      to_account_id: string;
      amount: number;
      frequency: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
      next_run_date: string;
      end_date?: string | null;
      max_runs?: number | null;
      narration?: string | null;
      reference_prefix?: string | null;
      consent_ref?: string | null;
    }) =>
      z
        .object({
          id: z.string().uuid().optional(),
          from_account_id: z.string().uuid(),
          to_account_id: z.string().uuid(),
          amount: z.number().positive(),
          frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]),
          next_run_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          end_date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable()
            .optional(),
          max_runs: z.number().int().positive().nullable().optional(),
          narration: z.string().nullable().optional(),
          reference_prefix: z.string().nullable().optional(),
          consent_ref: z.string().nullable().optional(),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.from_account_id === data.to_account_id)
      throw new Error("From and to accounts must differ");
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");
    const payload = {
      company_id: cid,
      from_account_id: data.from_account_id,
      to_account_id: data.to_account_id,
      amount: data.amount,
      frequency: data.frequency,
      next_run_date: data.next_run_date,
      end_date: data.end_date ?? null,
      max_runs: data.max_runs ?? null,
      narration: data.narration ?? null,
      reference_prefix: data.reference_prefix ?? null,
      consent_ref: data.consent_ref ?? null,
      created_by: userId,
    };
    if (data.id) {
      const { error } = await (supabase as any)
        .from("savings_standing_order")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (supabase as any)
      .from("savings_standing_order")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setStandingOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { id: string; status: "active" | "paused" | "cancelled"; reason?: string | null }) =>
      z
        .object({
          id: z.string().uuid(),
          status: z.enum(["active", "paused", "cancelled"]),
          reason: z.string().nullable().optional(),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patch: any = { status: data.status };
    if (data.status === "cancelled") {
      patch.cancelled_by = userId;
      patch.cancelled_at = new Date().toISOString();
      patch.cancel_reason = data.reason ?? null;
    }
    const { error } = await (supabase as any)
      .from("savings_standing_order")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runStandingOrderNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; business_date?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        business_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const biz = data.business_date ?? new Date().toISOString().slice(0, 10);
    const { data: res, error } = await context.supabase.rpc("execute_savings_standing_order", {
      _id: data.id,
      _business_date: biz,
    } as any);
    if (error) throw new Error(error.message);
    return res as any;
  });

export const listRecentSavingsTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { limit?: number; only_reversible?: boolean }) => i)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) return [];
    let q = (supabase as any)
      .from("savings_transaction")
      .select(
        "id, txn_type, amount, running_balance, reference, external_ref, narration, created_at, reversed_by_txn_id, reverses_txn_id, account:account_id(id, account_no, client:client_id(full_name))",
      )
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.only_reversible) q = q.is("reversed_by_txn_id", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ─────────── Phase 8: Account detail aggregate ───────────
export const getSavingsAccountDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: acct, error } = await (supabase as any)
      .from("savings_account")
      .select(
        "*, client:client_id(id, full_name, phone, email, nic), branch:branch_id(id, name), product:product_id(id, name, code, currency, interest_rate_pct, passbook_required)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!acct) throw new Error("Account not found");

    const [txns, holds, mandates, accruals, postings, holders, nominees, mandate] =
      await Promise.all([
        (supabase as any)
          .from("savings_transaction")
          .select(
            "id, txn_type, amount, running_balance, reference, external_ref, narration, created_at, reversed_by_txn_id, reverses_txn_id",
          )
          .eq("account_id", data.id)
          .order("created_at", { ascending: false })
          .limit(100),
        (supabase as any)
          .from("savings_hold")
          .select(
            "id, hold_type, amount, reason, reason_code, doc_ref, effective_from, expires_at, active, approval_state, release_status, created_at",
          )
          .eq("account_id", data.id)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("savings_loan_mandate")
          .select(
            "id, mandate_type, status, priority, fixed_amount, max_amount_per_run, min_protected_balance, morning_run, afternoon_run, loan:loan_id(id, loan_no, outstanding_principal)",
          )
          .eq("savings_account_id", data.id)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("savings_interest_accrual")
          .select("id, accrual_date, eligible_balance, rate_pct, gross_interest")
          .eq("account_id", data.id)
          .order("accrual_date", { ascending: false })
          .limit(60),
        (supabase as any)
          .from("savings_interest_posting")
          .select(
            "id, period_start, period_end, gross_interest, wht_amount, net_interest, created_at",
          )
          .eq("account_id", data.id)
          .order("period_end", { ascending: false })
          .limit(30),
        (supabase as any)
          .from("savings_account_holder")
          .select(
            "id, role, ownership_pct, full_name, nic, relation, is_signatory, signing_order, client:client_id(id, full_name)",
          )
          .eq("account_id", data.id),
        (supabase as any)
          .from("savings_account_nominee")
          .select("id, full_name, nic, relation, percentage, contact")
          .eq("account_id", data.id),
        (supabase as any)
          .from("savings_account_mandate")
          .select("id, signing_rule, min_signatories, rule_details")
          .eq("account_id", data.id)
          .maybeSingle(),
      ]);

    return {
      account: acct,
      transactions: txns.data ?? [],
      holds: holds.data ?? [],
      mandates: mandates.data ?? [],
      accruals: accruals.data ?? [],
      postings: postings.data ?? [],
      holders: holders.data ?? [],
      nominees: nominees.data ?? [],
      signing_mandate: mandate.data ?? null,
    };
  });
