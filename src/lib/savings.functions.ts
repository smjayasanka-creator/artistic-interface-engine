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
    const { supabase, userId } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No company");
    const { data: staff } = await (supabase as any)
      .from("staff")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: product, error: perr } = await (supabase as any)
      .from("savings_product")
      .select("*")
      .eq("id", data.product_id)
      .single();
    if (perr) throw new Error(perr.message);
    if (data.opening_deposit < Number(product.min_opening_balance ?? 0)) {
      throw new Error(
        `Opening deposit must be at least ${product.min_opening_balance} ${product.currency}`,
      );
    }

    if (data.nominees && data.nominees.length > 0) {
      const total = data.nominees.reduce((s, n) => s + Number(n.percentage || 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        throw new Error(`Nominee percentages must sum to 100 (got ${total.toFixed(2)})`);
      }
    }
    if (data.holders && data.holders.length > 0) {
      const total = data.holders.reduce((s, h) => s + Number(h.ownership_pct ?? 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        throw new Error(`Holder ownership must sum to 100% (got ${total.toFixed(2)})`);
      }
    }

    const { data: acctNo, error: nerr } = await supabase.rpc("next_contract_no", {
      _company_id: cid,
      _branch_id: data.branch_id,
      _product_id: data.product_id,
      _segment: 1,
    });
    if (nerr) throw new Error(nerr.message);

    const openingBalance = Number(data.opening_deposit) - Number(product.opening_fee ?? 0);

    const { data: acct, error: aerr } = await (supabase as any)
      .from("savings_account")
      .insert({
        company_id: cid,
        branch_id: data.branch_id,
        product_id: data.product_id,
        client_id: data.client_id,
        account_no: acctNo,
        currency: product.currency,
        balance: openingBalance,
        available_balance: openingBalance,
        status: "active",
        opened_by: staff?.id ?? null,
        opened_via: data.channel ?? "branch",
        approved_by: staff?.id ?? null,
        approved_at: new Date().toISOString(),
        statement_preference: data.statement_preference ?? null,
        communication_preference: data.communication_preference ?? null,
        special_instructions: data.special_instructions ?? null,
        product_snapshot: product,
        external_ref: data.external_ref ?? null,
      })
      .select()
      .single();
    if (aerr) throw new Error(aerr.message);

    // Holders — always ensure a primary holder exists
    const holders =
      data.holders && data.holders.length > 0
        ? data.holders
        : [
            {
              client_id: data.client_id,
              role: "primary" as const,
              ownership_pct: 100,
              is_signatory: true,
              signing_order: 1,
            },
          ];
    const { error: herr } = await (supabase as any).from("savings_account_holder").insert(
      holders.map((h) => ({
        company_id: cid,
        account_id: acct.id,
        client_id: h.client_id ?? null,
        role: h.role,
        ownership_pct: h.ownership_pct ?? 0,
        full_name: h.full_name ?? null,
        nic: h.nic ?? null,
        relation: h.relation ?? null,
        is_signatory: h.is_signatory ?? true,
        signing_order: h.signing_order ?? null,
      })),
    );
    if (herr) throw new Error(`Holders: ${herr.message}`);

    if (data.nominees && data.nominees.length > 0) {
      const { error: nomerr } = await (supabase as any).from("savings_account_nominee").insert(
        data.nominees.map((n) => ({
          company_id: cid,
          account_id: acct.id,
          full_name: n.full_name,
          nic: n.nic ?? null,
          relation: n.relation ?? null,
          percentage: n.percentage,
          contact: n.contact ?? null,
        })),
      );
      if (nomerr) throw new Error(`Nominees: ${nomerr.message}`);
    }

    if (data.mandate) {
      const { error: merr } = await (supabase as any).from("savings_account_mandate").insert({
        company_id: cid,
        account_id: acct.id,
        signing_rule: data.mandate.signing_rule,
        min_signatories: data.mandate.min_signatories ?? null,
        rule_details: (data.mandate.rule_details as any) ?? null,
        effective_from: new Date().toISOString().slice(0, 10),
        active: true,
        created_by: staff?.id ?? null,
        approved_by: staff?.id ?? null,
        approved_at: new Date().toISOString(),
      });
      if (merr) throw new Error(`Mandate: ${merr.message}`);
    }

    const txnRows: any[] = [];
    if (Number(product.opening_fee ?? 0) > 0) {
      txnRows.push({
        company_id: cid,
        account_id: acct.id,
        txn_type: "fee",
        channel: data.channel ?? "branch",
        amount: -Number(product.opening_fee),
        running_balance: Number(data.opening_deposit) - Number(product.opening_fee),
        reference: "OPENING-FEE",
        narration: "Account opening fee",
        performed_by: staff?.id ?? null,
      });
    }
    txnRows.unshift({
      company_id: cid,
      account_id: acct.id,
      txn_type: "opening",
      channel: data.channel ?? "branch",
      amount: Number(data.opening_deposit),
      running_balance: Number(data.opening_deposit),
      reference: "OPENING-DEPOSIT",
      external_ref: data.external_ref ?? null,
      narration: data.narration ?? "Account opening deposit",
      performed_by: staff?.id ?? null,
    });
    await (supabase as any).from("savings_transaction").insert(txnRows);

    // Ledger postings via kernel — required. Missing GL mapping is a hard error
    // so no sub-ledger row exists without a matching GL entry.
    const gl = await resolveSavingsAccounts(supabase, product);
    const today = new Date().toISOString().slice(0, 10);
    const fee = Number(product.opening_fee ?? 0);
    if (Number(data.opening_deposit) > 0) {
      if (!gl.cash || !gl.liab) {
        throw new Error(
          "Savings product is missing GL mapping (cash and deposit-liability accounts). Set them under Admin → Savings products before opening accounts.",
        );
      }
      await supabase.rpc("post_entry", {
        _entry_date: today,
        _reference: `SAV-OPEN-${acct.account_no}`,
        _description: `Savings opening deposit · ${acct.account_no}`,
        _lines: [
          { account_id: gl.cash, debit: Number(data.opening_deposit), credit: 0 },
          { account_id: gl.liab, debit: 0, credit: Number(data.opening_deposit) },
        ] as any,
        _branch_id: data.branch_id,
        _source_module: "savings",
        _source_ref: acct.id,
        _idempotency_key: `savings:open:${acct.id}`,
      });
    }
    if (fee > 0) {
      if (!gl.liab || !gl.fee) {
        throw new Error(
          "Savings product is missing GL mapping (deposit-liability and fee-income accounts) required to charge the opening fee.",
        );
      }
      await supabase.rpc("post_entry", {
        _entry_date: today,
        _reference: `SAV-FEE-${acct.account_no}`,
        _description: `Savings opening fee · ${acct.account_no}`,
        _lines: [
          { account_id: gl.liab, debit: fee, credit: 0 },
          { account_id: gl.fee, debit: 0, credit: fee },
        ] as any,
        _branch_id: data.branch_id,
        _source_module: "savings",
        _source_ref: acct.id,
        _idempotency_key: `savings:open-fee:${acct.id}`,
      });
    }
    return acct;
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
    const { supabase, userId } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No company");
    const { data: staff } = await (supabase as any)
      .from("staff")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: acct, error } = await (supabase as any)
      .from("savings_account")
      .select(
        "id, account_no, branch_id, balance, status, product:product_id(closure_fee, cash_account_id, deposit_liability_account_id, fee_income_account_id, interest_expense_account_id)",
      )
      .eq("id", data.account_id)
      .single();
    if (error) throw new Error(error.message);
    if (acct.status === "closed") throw new Error("Account is already closed");

    const fee = Number(acct.product?.closure_fee ?? 0);
    const balAfterFee = Number(acct.balance) - fee;

    const rows: any[] = [];
    if (fee > 0) {
      rows.push({
        company_id: cid,
        account_id: data.account_id,
        txn_type: "fee",
        channel: data.payout_channel ?? "branch",
        amount: -fee,
        running_balance: balAfterFee,
        reference: "CLOSURE-FEE",
        narration: "Account closure fee",
        performed_by: staff?.id ?? null,
      });
    }
    if (balAfterFee > 0) {
      rows.push({
        company_id: cid,
        account_id: data.account_id,
        txn_type: "closure",
        channel: data.payout_channel ?? "branch",
        amount: -balAfterFee,
        running_balance: 0,
        reference: "CLOSURE-PAYOUT",
        external_ref: data.external_ref ?? null,
        narration: "Final balance payout on closure",
        performed_by: staff?.id ?? null,
      });
    }
    if (rows.length) await (supabase as any).from("savings_transaction").insert(rows);

    // Ledger postings via kernel
    const gl = await resolveSavingsAccounts(supabase, acct.product);
    const today = new Date().toISOString().slice(0, 10);
    if (fee > 0) {
      if (!gl.liab || !gl.fee) {
        throw new Error(
          "Savings product is missing GL mapping (deposit-liability and fee-income accounts) required to post the closure fee.",
        );
      }
      await supabase.rpc("post_entry", {
        _entry_date: today,
        _reference: `SAV-CLOSE-FEE-${acct.account_no}`,
        _description: `Savings closure fee · ${acct.account_no}`,
        _lines: [
          { account_id: gl.liab, debit: fee, credit: 0 },
          { account_id: gl.fee, debit: 0, credit: fee },
        ] as any,
        _branch_id: acct.branch_id,
        _source_module: "savings",
        _source_ref: acct.id,
        _idempotency_key: `savings:close-fee:${acct.id}`,
      });
    }
    if (balAfterFee > 0) {
      if (!gl.cash || !gl.liab) {
        throw new Error(
          "Savings product is missing GL mapping (cash and deposit-liability accounts) required to pay out on closure.",
        );
      }
      await supabase.rpc("post_entry", {
        _entry_date: today,
        _reference: `SAV-CLOSE-${acct.account_no}`,
        _description: `Savings closure payout · ${acct.account_no}`,
        _lines: [
          { account_id: gl.liab, debit: balAfterFee, credit: 0 },
          { account_id: gl.cash, debit: 0, credit: balAfterFee },
        ] as any,
        _branch_id: acct.branch_id,
        _source_module: "savings",
        _source_ref: acct.id,
        _idempotency_key: `savings:close:${acct.id}`,
      });
    }

    const { data: closed, error: cerr } = await (supabase as any)
      .from("savings_account")
      .update({
        status: "closed",
        balance: 0,
        available_balance: 0,
        closed_on: new Date().toISOString().slice(0, 10),
        closed_by: staff?.id ?? null,
        closure_reason: data.reason,
      })
      .eq("id", data.account_id)
      .select()
      .single();
    if (cerr) throw new Error(cerr.message);
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
