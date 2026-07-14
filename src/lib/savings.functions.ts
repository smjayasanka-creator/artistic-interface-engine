import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  const missingCodes = Object.values(need).filter((n) => !n.fromProduct).map((n) => n.code);
  let byCode: Record<string, string> = {};
  if (missingCodes.length) {
    const { data: accts } = await supabase.from("gl_account").select("id, code").in("code", missingCodes);
    byCode = Object.fromEntries((accts ?? []).map((a: any) => [a.code, a.id]));
  }
  const resolved: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(need)) resolved[k] = v.fromProduct ?? byCode[v.code] ?? null;
  return resolved as { cash: string | null; liab: string | null; fee: string | null; intr: string | null };
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

    const { data: acctNo, error: nerr } = await supabase.rpc("next_savings_account_no", {
      _company_id: cid,
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
        external_ref: data.external_ref ?? null,
      })
      .select()
      .single();
    if (aerr) throw new Error(aerr.message);

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

    // Ledger postings via kernel (best-effort — skip silently if COA not configured)
    const gl = await resolveSavingsAccounts(supabase, product);
    const today = new Date().toISOString().slice(0, 10);
    const fee = Number(product.opening_fee ?? 0);
    if (gl.cash && gl.liab && Number(data.opening_deposit) > 0) {
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
    if (fee > 0 && gl.liab && gl.fee) {
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

    const { data: acct, error } = await (supabase as any)
      .from("savings_account")
      .select("id, account_no, branch_id, balance, available_balance, status, product:product_id(min_balance, cash_account_id, deposit_liability_account_id, fee_income_account_id, interest_expense_account_id)")
      .eq("id", data.account_id)
      .single();
    if (error) throw new Error(error.message);
    if (acct.status !== "active")
      throw new Error(`Account is ${acct.status}, cannot post transactions`);

    const signed =
      data.txn_type === "withdrawal" || data.txn_type === "fee"
        ? -Math.abs(data.amount)
        : Math.abs(data.amount);
    const newBal = Number(acct.balance) + signed;
    if (newBal < Number(acct.product?.min_balance ?? 0)) {
      throw new Error("Balance would fall below product minimum");
    }

    const { data: txn, error: terr } = await (supabase as any)
      .from("savings_transaction")
      .insert({
        company_id: cid,
        account_id: data.account_id,
        txn_type: data.txn_type,
        channel: data.channel ?? "branch",
        amount: signed,
        running_balance: newBal,
        reference: data.reference ?? null,
        external_ref: data.external_ref ?? null,
        narration: data.narration ?? null,
        performed_by: staff?.id ?? null,
        idempotency_key: data.idempotency_key ?? null,
      })
      .select()
      .single();
    if (terr) throw new Error(terr.message);

    await (supabase as any)
      .from("savings_account")
      .update({ balance: newBal, available_balance: newBal, last_txn_at: new Date().toISOString() })
      .eq("id", data.account_id);

    // Ledger posting via kernel
    const gl = await resolveSavingsAccounts(supabase, acct.product);
    const amt = Math.abs(data.amount);
    const today = new Date().toISOString().slice(0, 10);
    let lines: Array<{ account_id: string; debit: number; credit: number }> | null = null;
    let refPrefix = "";
    if (data.txn_type === "deposit" && gl.cash && gl.liab) {
      refPrefix = "SAV-DEP";
      lines = [
        { account_id: gl.cash, debit: amt, credit: 0 },
        { account_id: gl.liab, debit: 0, credit: amt },
      ];
    } else if (data.txn_type === "withdrawal" && gl.cash && gl.liab) {
      refPrefix = "SAV-WD";
      lines = [
        { account_id: gl.liab, debit: amt, credit: 0 },
        { account_id: gl.cash, debit: 0, credit: amt },
      ];
    } else if (data.txn_type === "fee" && gl.liab && gl.fee) {
      refPrefix = "SAV-FEE";
      lines = [
        { account_id: gl.liab, debit: amt, credit: 0 },
        { account_id: gl.fee, debit: 0, credit: amt },
      ];
    } else if (data.txn_type === "interest" && gl.liab && gl.intr) {
      refPrefix = "SAV-INT";
      lines = [
        { account_id: gl.intr, debit: amt, credit: 0 },
        { account_id: gl.liab, debit: 0, credit: amt },
      ];
    }
    if (lines) {
      const idem = data.idempotency_key ?? `savings:${data.txn_type}:${txn.id}`;
      await supabase.rpc("post_entry", {
        _entry_date: today,
        _reference: `${refPrefix}-${acct.account_no}`,
        _description: data.narration ?? `${data.txn_type} · ${acct.account_no}`,
        _lines: lines as any,
        _branch_id: acct.branch_id,
        _source_module: "savings",
        _source_ref: txn.id,
        _idempotency_key: `savings:txn:${idem}`,
      });
    }
    return txn;
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
      .select("id, account_no, branch_id, balance, status, product:product_id(closure_fee, cash_account_id, deposit_liability_account_id, fee_income_account_id, interest_expense_account_id)")
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
    if (fee > 0 && gl.liab && gl.fee) {
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
    if (balAfterFee > 0 && gl.cash && gl.liab) {
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
  .inputValidator((i: { account_id: string }) => z.object({ account_id: z.string().uuid() }).parse(i))
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
    (i: { stock_id: string; account_id: string; serial_no?: number | null; notes?: string | null }) =>
      i,
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
    let serial = data.serial_no ?? Number(stock.serial_from) + Number(stock.quantity_issued);
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
