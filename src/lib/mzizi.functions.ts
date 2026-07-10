import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateSchedule, type Frequency } from "@/lib/loan-schedule";

// ─────────────────────────────────────────────────────────────────────────────
// READS
// ─────────────────────────────────────────────────────────────────────────────

export const getSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase
      .from("staff")
      .select("id, full_name, role, email, branch_id, branch:branch_id(id,code,name,region)")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    return {
      userId,
      staff,
      roles: (roles ?? []).map((r) => r.role as string),
    };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = new Date().toISOString().slice(0, 10);

    const [
      { count: activeClients },
      { data: outstanding },
      { data: par },
      { data: repayToday },
      { data: disbWeek },
      { data: approvals },
      { data: meetings },
    ] = await Promise.all([
      supabase.from("client").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("v_loan_outstanding").select("outstanding_principal"),
      supabase.from("v_par_aging").select("bucket, principal_at_risk"),
      supabase.from("repayment").select("amount").gte("received_at", today),
      supabase.from("loan").select("principal").gte("disbursed_at", new Date(Date.now() - 7 * 864e5).toISOString()),
      supabase
        .from("loan")
        .select("id, principal, submitted_at, client:client_id(id, full_name, risk_grade, avatar_color), product:product_id(name)")
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false })
        .limit(6),
      supabase
        .from("lending_group")
        .select("id, name, meeting_day, meeting_place, target_today, color")
        .not("meeting_day", "is", null)
        .limit(4),
    ]);

    const outstandingTotal = (outstanding ?? []).reduce((s, r) => s + Number(r.outstanding_principal ?? 0), 0);
    const parBuckets = ["current", "1-30", "31-60", "61-90", "90+"].map((b) => {
      const row = (par ?? []).find((r) => r.bucket === b);
      return { bucket: b, amount: Number(row?.principal_at_risk ?? 0) };
    });
    const collectedToday = (repayToday ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const disbursedWeek = (disbWeek ?? []).reduce((s, r) => s + Number(r.principal), 0);
    const par30plus = parBuckets.filter((b) => b.bucket !== "current" && b.bucket !== "1-30").reduce((s, b) => s + b.amount, 0);

    return {
      kpis: {
        activeClients: activeClients ?? 0,
        outstanding: outstandingTotal,
        par30plus,
        collectedToday,
        disbursedWeek,
      },
      par: parBuckets,
      approvals: approvals ?? [],
      meetings: meetings ?? [],
    };
  });

export const getClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { filter?: "all" | "active" | "pending_kyc" }) => i)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    let q = supabase
      .from("client")
      .select(
        "id, full_name, phone, email, national_id, status, risk_grade, avatar_color, joined_on, date_of_birth, gender, occupation, monthly_income, address, group:group_id(id, name)",
      )
      .order("full_name");
    if (data.filter === "active") q = q.eq("status", "active");
    if (data.filter === "pending_kyc") q = q.eq("status", "pending_kyc");
    const { data: clients } = await q;

    const ids = (clients ?? []).map((c) => c.id);
    const outstandingByClient = new Map<string, { count: number; out: number }>();
    if (ids.length) {
      const { data: loans } = await supabase.from("loan").select("client_id, id, principal").in("client_id", ids);
      const { data: outs } = await supabase.from("v_loan_outstanding").select("loan_id, outstanding_principal");
      const outMap = new Map((outs ?? []).map((o) => [o.loan_id, Number(o.outstanding_principal ?? 0)]));
      for (const l of loans ?? []) {
        const cur = outstandingByClient.get(l.client_id) ?? { count: 0, out: 0 };
        cur.count += 1;
        cur.out += outMap.get(l.id) ?? 0;
        outstandingByClient.set(l.client_id, cur);
      }
    }
    return (clients ?? []).map((c) => ({
      ...c,
      loans: outstandingByClient.get(c.id)?.count ?? 0,
      outstanding: outstandingByClient.get(c.id)?.out ?? 0,
    }));
  });

export const getClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: client } = await supabase
      .from("client")
      .select("id, full_name, phone, national_id, status, risk_grade, avatar_color, joined_on, group:group_id(id, name)")
      .eq("id", data.id)
      .maybeSingle();
    if (!client) throw new Error("Client not found");

    const { data: loans } = await supabase
      .from("loan")
      .select("id, status, principal, term_months, annual_rate_pct, frequency, disbursed_at, product:product_id(name)")
      .eq("client_id", data.id)
      .order("created_at", { ascending: false });

    const active = (loans ?? []).find((l) => l.status === "disbursed" || l.status === "active");
    let schedule: any[] = [];
    let outstanding = 0;
    let repaid = 0;
    if (active) {
      const { data: sched } = await supabase
        .from("loan_installment")
        .select("seq, due_date, principal_due, interest_due, principal_paid, interest_paid, state")
        .eq("loan_id", active.id)
        .order("seq");
      schedule = sched ?? [];
      const { data: o } = await supabase
        .from("v_loan_outstanding")
        .select("outstanding_principal, principal_repaid")
        .eq("loan_id", active.id)
        .maybeSingle();
      outstanding = Number(o?.outstanding_principal ?? 0);
      repaid = Number(o?.principal_repaid ?? 0);
    }

    const { data: repayments } = await supabase
      .from("repayment")
      .select("id, amount, channel, received_at, loan_id")
      .in("loan_id", (loans ?? []).map((l) => l.id).length ? (loans ?? []).map((l) => l.id) : ["00000000-0000-0000-0000-000000000000"])
      .order("received_at", { ascending: false })
      .limit(6);

    const totalOut = (loans ?? []).length
      ? (await supabase.from("v_loan_outstanding").select("outstanding_principal").in("loan_id", (loans ?? []).map((l) => l.id))).data
          ?.reduce((s, r) => s + Number(r.outstanding_principal ?? 0), 0) ?? 0
      : 0;
    const activeLoans = (loans ?? []).filter((l) => l.status === "disbursed" || l.status === "active").length;

    return {
      client,
      loans: loans ?? [],
      active: active
        ? {
            ...active,
            schedule,
            outstanding,
            repaid,
          }
        : null,
      repayments: repayments ?? [],
      stats: {
        outstanding: totalOut,
        savings: 0,
        activeLoans,
        onTimeRate: schedule.length
          ? Math.round((schedule.filter((s) => s.state === "paid").length / schedule.length) * 100)
          : 100,
      },
    };
  });

export const getLoans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: loans } = await supabase
      .from("loan")
      .select("id, principal, status, disbursed_at, client:client_id(id, full_name, avatar_color), product:product_id(name)")
      .in("status", ["disbursed", "active", "closed"])
      .order("disbursed_at", { ascending: false });
    const ids = (loans ?? []).map((l) => l.id);
    const { data: outs } = ids.length
      ? await supabase.from("v_loan_outstanding").select("loan_id, outstanding_principal, principal_repaid").in("loan_id", ids)
      : { data: [] as any[] };
    const outMap = new Map((outs ?? []).map((o) => [o.loan_id, o]));
    const { data: nextDue } = ids.length
      ? await supabase
          .from("loan_installment")
          .select("loan_id, due_date, state")
          .in("loan_id", ids)
          .in("state", ["upcoming", "due", "overdue", "partial"])
          .order("due_date")
      : { data: [] as any[] };
    const nextMap = new Map<string, any>();
    for (const r of nextDue ?? []) if (!nextMap.has(r.loan_id)) nextMap.set(r.loan_id, r);

    return (loans ?? []).map((l) => {
      const o = outMap.get(l.id);
      const out = Number(o?.outstanding_principal ?? 0);
      const rep = Number(o?.principal_repaid ?? 0);
      const nxt = nextMap.get(l.id);
      const overdue = nxt && new Date(nxt.due_date) < new Date();
      return {
        ...l,
        outstanding: out,
        repaid: rep,
        progress: l.principal > 0 ? Math.min(100, Math.round((rep / Number(l.principal)) * 100)) : 0,
        nextDue: nxt?.due_date ?? null,
        overdue,
      };
    });
  });

export const getGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: groups } = await supabase
      .from("lending_group")
      .select("id, name, cycle, meeting_day, meeting_place, color, leader:leader_client_id(full_name)")
      .order("name");
    const ids = (groups ?? []).map((g) => g.id);
    const counts = new Map<string, number>();
    const outMap = new Map<string, number>();
    if (ids.length) {
      const { data: members } = await supabase.from("client").select("id, group_id").in("group_id", ids);
      for (const m of members ?? []) counts.set(m.group_id!, (counts.get(m.group_id!) ?? 0) + 1);
      const memberIds = (members ?? []).map((m) => m.id);
      if (memberIds.length) {
        const { data: loans } = await supabase.from("loan").select("id, client_id").in("client_id", memberIds);
        const clientToGroup = new Map((members ?? []).map((m) => [m.id, m.group_id!]));
        const { data: outs } = await supabase
          .from("v_loan_outstanding")
          .select("loan_id, outstanding_principal")
          .in("loan_id", (loans ?? []).map((l) => l.id).length ? (loans ?? []).map((l) => l.id) : ["00000000-0000-0000-0000-000000000000"]);
        const outByLoan = new Map((outs ?? []).map((o) => [o.loan_id, Number(o.outstanding_principal ?? 0)]));
        for (const l of loans ?? []) {
          const gid = clientToGroup.get(l.client_id);
          if (gid) outMap.set(gid, (outMap.get(gid) ?? 0) + (outByLoan.get(l.id) ?? 0));
        }
      }
    }
    return (groups ?? []).map((g) => ({
      ...g,
      members: counts.get(g.id) ?? 0,
      outstanding: outMap.get(g.id) ?? 0,
    }));
  });

export const getLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { account?: string }) => i)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: accounts } = await supabase.from("gl_account").select("id, code, name, type").order("code");
    let q = supabase
      .from("posting")
      .select("id, debit, credit, account:account_id(code, name), entry:entry_id(reference, entry_date, description)")
      .order("id", { ascending: false })
      .limit(60);
    if (data.account) q = q.eq("account_id", data.account);
    const { data: rows } = await q;
    return {
      accounts: accounts ?? [],
      rows: rows ?? [],
    };
  });

export const getReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: loans } = await supabase
      .from("loan")
      .select("principal, disbursed_at, product:product_id(id, name, color)")
      .not("disbursed_at", "is", null);

    const now = new Date();
    const months: { label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleDateString("en-US", { month: "short" }), total: 0 });
    }
    for (const l of loans ?? []) {
      const d = new Date(l.disbursed_at!);
      const idx = months.findIndex((_, i) => {
        const md = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return d.getFullYear() === md.getFullYear() && d.getMonth() === md.getMonth();
      });
      if (idx >= 0) months[idx].total += Number(l.principal);
    }

    const byProduct = new Map<string, { name: string; color: string; count: number; out: number }>();
    for (const l of loans ?? []) {
      const p = (l.product as any) ?? { id: "unknown", name: "Other", color: "#64748b" };
      const cur = byProduct.get(p.id) ?? { name: p.name, color: p.color ?? "#64748b", count: 0, out: 0 };
      cur.count += 1;
      cur.out += Number(l.principal);
      byProduct.set(p.id, cur);
    }

    const { data: par } = await supabase.from("v_par_aging").select("bucket, principal_at_risk");
    const parBuckets = ["current", "1-30", "31-60", "61-90", "90+"].map((b) => ({
      label: b === "current" ? "Current" : b,
      value: Number((par ?? []).find((r) => r.bucket === b)?.principal_at_risk ?? 0),
    }));

    return {
      disbursement: months,
      products: Array.from(byProduct.values()),
      par: parBuckets,
    };
  });

export const getFinancials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    // Chart of accounts + postings for trial balance / IS / BS
    const { data: accounts } = await supabase
      .from("gl_account")
      .select("id, code, name, type, normal_balance")
      .order("code");

    const { data: postings } = await supabase
      .from("posting")
      .select("account_id, debit, credit");

    const totals = new Map<string, { debit: number; credit: number }>();
    for (const p of postings ?? []) {
      const cur = totals.get(p.account_id) ?? { debit: 0, credit: 0 };
      cur.debit += Number(p.debit ?? 0);
      cur.credit += Number(p.credit ?? 0);
      totals.set(p.account_id, cur);
    }

    type AcctRow = {
      id: string;
      code: string;
      name: string;
      type: string;
      debit: number;
      credit: number;
      balance: number; // signed by normal_balance (positive = normal side)
    };

    const accountRows: AcctRow[] = (accounts ?? []).map((a) => {
      const t = totals.get(a.id) ?? { debit: 0, credit: 0 };
      const net = t.debit - t.credit; // debit-positive
      const balance = Number(a.normal_balance) === 1 ? net : -net;
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type as string,
        debit: t.debit,
        credit: t.credit,
        balance,
      };
    });

    const sumByType = (t: string) =>
      accountRows.filter((r) => r.type === t).reduce((s, r) => s + r.balance, 0);

    const income = accountRows
      .filter((r) => r.type === "income")
      .map((r) => ({ code: r.code, name: r.name, amount: r.balance }));
    const expense = accountRows
      .filter((r) => r.type === "expense")
      .map((r) => ({ code: r.code, name: r.name, amount: r.balance }));
    const assets = accountRows
      .filter((r) => r.type === "asset")
      .map((r) => ({ code: r.code, name: r.name, amount: r.balance }));
    const liabilities = accountRows
      .filter((r) => r.type === "liability")
      .map((r) => ({ code: r.code, name: r.name, amount: r.balance }));
    const equity = accountRows
      .filter((r) => r.type === "equity")
      .map((r) => ({ code: r.code, name: r.name, amount: r.balance }));

    const totalIncome = sumByType("income");
    const totalExpense = sumByType("expense");
    const netIncome = totalIncome - totalExpense;
    const totalAssets = sumByType("asset");
    const totalLiab = sumByType("liability");
    const totalEquity = sumByType("equity");

    // Portfolio by product (outstanding + count)
    const { data: loans } = await supabase
      .from("loan")
      .select("id, principal, status, disbursed_at, product:product_id(id, name, color), client:client_id(id, full_name)")
      .not("disbursed_at", "is", null);

    const { data: outs } = await supabase
      .from("v_loan_outstanding")
      .select("loan_id, outstanding_principal, principal_repaid");
    const outMap = new Map<string, { out: number; repaid: number }>();
    for (const o of outs ?? []) {
      outMap.set(o.loan_id as string, {
        out: Number(o.outstanding_principal ?? 0),
        repaid: Number(o.principal_repaid ?? 0),
      });
    }

    const byProduct = new Map<string, { name: string; color: string; count: number; principal: number; outstanding: number }>();
    const byClient = new Map<string, { name: string; loans: number; principal: number; outstanding: number }>();
    for (const l of loans ?? []) {
      const p = (l.product as any) ?? { id: "unknown", name: "Other", color: "#64748b" };
      const cp = byProduct.get(p.id) ?? { name: p.name, color: p.color ?? "#64748b", count: 0, principal: 0, outstanding: 0 };
      const o = outMap.get(l.id as string) ?? { out: Number(l.principal), repaid: 0 };
      cp.count += 1;
      cp.principal += Number(l.principal);
      cp.outstanding += o.out;
      byProduct.set(p.id, cp);

      const c = (l.client as any) ?? { id: "unknown", full_name: "Unknown" };
      const cc = byClient.get(c.id) ?? { name: c.full_name, loans: 0, principal: 0, outstanding: 0 };
      cc.loans += 1;
      cc.principal += Number(l.principal);
      cc.outstanding += o.out;
      byClient.set(c.id, cc);
    }

    return {
      trialBalance: {
        rows: accountRows,
        totalDebit: accountRows.reduce((s, r) => s + r.debit, 0),
        totalCredit: accountRows.reduce((s, r) => s + r.credit, 0),
      },
      incomeStatement: {
        income,
        expense,
        totalIncome,
        totalExpense,
        netIncome,
      },
      balanceSheet: {
        assets,
        liabilities,
        equity,
        totalAssets,
        totalLiab,
        totalEquity,
        netIncome,
        totalLiabAndEquity: totalLiab + totalEquity + netIncome,
      },
      portfolio: Array.from(byProduct.values()).sort((a, b) => b.outstanding - a.outstanding),
      customers: Array.from(byClient.values()).sort((a, b) => b.outstanding - a.outstanding),
    };
  });

export const getAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: branches } = await supabase.from("branch").select("*").order("created_at");
    const branch = branches?.[0] ?? null;
    const { data: staff } = await supabase
      .from("staff")
      .select("id, full_name, role, email, phone, is_active, branch_id, branch:branch_id(id,name,code)")
      .order("full_name");
    const { count: activeClients } = await supabase
      .from("client")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    const { data: outs } = await supabase.from("v_loan_outstanding").select("outstanding_principal");
    const portfolio = (outs ?? []).reduce((s, r) => s + Number(r.outstanding_principal ?? 0), 0);
    return {
      branch,
      branches: branches ?? [],
      staff: staff ?? [],
      activeClients: activeClients ?? 0,
      portfolio,
    };
  });

export const createBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { code: string; name: string; region?: string; currency?: string; opened_on?: string }) =>
    z
      .object({
        code: z.string().trim().min(1).max(20),
        name: z.string().trim().min(2).max(80),
        region: z.string().trim().max(80).optional().or(z.literal("")),
        currency: z.string().trim().length(3).optional(),
        opened_on: z.string().optional().or(z.literal("")),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can create branches");
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");
    const { data: created, error } = await supabase
      .from("branch")
      .insert({
        company_id: cid,
        code: data.code,
        name: data.name,
        region: data.region || null,
        currency: (data.currency || "KES").toUpperCase(),
        opened_on: data.opened_on || null,
      })
      .select()
      .single();
    if (error) throw error;
    return created;
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      full_name: string;
      role: "loan_officer" | "branch_manager" | "teller" | "operations" | "admin";
      branch_id: string;
      email?: string;
      phone?: string;
    }) =>
      z
        .object({
          full_name: z.string().trim().min(2).max(80),
          role: z.enum(["loan_officer", "branch_manager", "teller", "operations", "admin"]),
          branch_id: z.string().uuid(),
          email: z.string().trim().email().optional().or(z.literal("")),
          phone: z.string().trim().max(30).optional().or(z.literal("")),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can create staff");
    const { data: created, error } = await supabase
      .from("staff")
      .insert({
        full_name: data.full_name,
        role: data.role,
        branch_id: data.branch_id,
        email: data.email || null,
        phone: data.phone || null,
      })
      .select()
      .single();
    if (error) throw error;
    return created;
  });

export const toggleStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; is_active: boolean }) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can modify staff");
    const { error } = await supabase.from("staff").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("loan_product")
      .select("id, name, annual_rate_pct, frequency, color, min_principal, max_principal, min_term_months, max_term_months")
      .eq("is_active", true)
      .order("name");
    return data ?? [];
  });

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      full_name: string;
      phone: string;
      national_id: string;
      date_of_birth: string;
      gender: "male" | "female" | "other";
      address: string;
      occupation: string;
      monthly_income: number;
      next_of_kin_name: string;
      next_of_kin_phone: string;
      email?: string;
      group_id?: string | null;
    }) =>
      (() => {
        const schema = z.object({
          full_name: z.string().trim().min(2, "Full name is required").max(120),
          phone: z.string().trim().min(7, "Phone is required").max(20),
          national_id: z.string().trim().min(4, "National ID is required").max(30),
          date_of_birth: z.string().min(1, "Date of birth is required"),
          gender: z.enum(["male", "female", "other"]),
          address: z.string().trim().min(3, "Address is required").max(200),
          occupation: z.string().trim().min(2, "Occupation is required").max(80),
          monthly_income: z.number().nonnegative("Monthly income must be 0 or more"),
          next_of_kin_name: z.string().trim().min(1, "Next of kin name is required").max(120),
          next_of_kin_phone: z.string().trim().min(7, "Next of kin phone is required").max(20),
          email: z.string().trim().email().max(255).optional().or(z.literal("")),
          group_id: z.string().uuid().nullable().optional(),
        });
        const r = schema.safeParse(i);
        if (!r.success) {
          throw new Error(r.error.issues.map((iss) => iss.message).join(" · "));
        }
        return r.data;
      })(),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: staff } = await supabase.from("staff").select("id, branch_id").eq("user_id", context.userId).maybeSingle();
    if (!staff) throw new Error("No staff profile");
    const colors = ["#0f766e", "#0369a1", "#7c3aed", "#c2410c", "#b45309", "#065f46", "#9333ea", "#be185d"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const { data: created, error } = await supabase
      .from("client")
      .insert({
        branch_id: staff.branch_id,
        officer_id: staff.id,
        full_name: data.full_name,
        phone: data.phone,
        national_id: data.national_id,
        email: data.email || null,
        date_of_birth: data.date_of_birth,
        gender: data.gender,
        address: data.address,
        occupation: data.occupation,
        monthly_income: data.monthly_income,
        next_of_kin_name: data.next_of_kin_name,
        next_of_kin_phone: data.next_of_kin_phone,
        group_id: data.group_id ?? null,
        status: "pending_kyc",
        avatar_color: color,
      })
      .select()
      .single();
    if (error) throw error;
    return created;
  });

export const submitApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      client_id: string;
      product_id: string;
      principal: number;
      term_months: number;
      purpose?: string;
      annual_rate_pct?: number;
      frequency?: "daily" | "weekly" | "biweekly" | "monthly";
    }) =>
      z
        .object({
          client_id: z.string().uuid(),
          product_id: z.string().uuid(),
          principal: z.number().positive(),
          term_months: z.number().int().positive(),
          purpose: z.string().optional(),
          annual_rate_pct: z.number().positive().max(200).optional(),
          frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]).optional(),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: staff } = await supabase.from("staff").select("id, branch_id").eq("user_id", context.userId).maybeSingle();
    if (!staff) throw new Error("No staff profile");
    const { data: product } = await supabase
      .from("loan_product")
      .select("annual_rate_pct, frequency")
      .eq("id", data.product_id)
      .maybeSingle();
    if (!product) throw new Error("Product not found");

    const { data: loan, error } = await supabase
      .from("loan")
      .insert({
        client_id: data.client_id,
        product_id: data.product_id,
        branch_id: staff.branch_id,
        officer_id: staff.id,
        principal: data.principal,
        term_months: data.term_months,
        annual_rate_pct: data.annual_rate_pct ?? product.annual_rate_pct,
        frequency: data.frequency ?? product.frequency,
        purpose: data.purpose,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return loan;
  });

export const declineLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { loan_id: string }) => z.object({ loan_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("loan").update({ status: "rejected" }).eq("id", data.loan_id);
    if (error) throw error;
    return { ok: true };
  });

export const approveLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { loan_id: string }) => z.object({ loan_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: staff } = await supabase.from("staff").select("id, branch_id").eq("user_id", context.userId).maybeSingle();
    if (!staff) throw new Error("No staff profile");
    const { data: loan } = await supabase
      .from("loan")
      .select("id, principal, term_months, annual_rate_pct, frequency, branch_id, status, product_id")
      .eq("id", data.loan_id)
      .maybeSingle();
    if (!loan) throw new Error("Loan not found");
    if (loan.status !== "submitted") throw new Error("Loan not in submitted state");

    const now = new Date().toISOString();
    await supabase
      .from("loan")
      .update({
        status: "disbursed",
        approved_at: now,
        approved_by: staff.id,
        disbursed_at: now,
      })
      .eq("id", loan.id);

    const schedule = generateSchedule({
      principal: Number(loan.principal),
      annualRatePct: Number(loan.annual_rate_pct),
      termMonths: loan.term_months,
      frequency: loan.frequency as Frequency,
    });
    const rows = schedule.rows.map((r) => ({
      loan_id: loan.id,
      seq: r.seq,
      due_date: r.dueDate,
      principal_due: r.principal,
      interest_due: r.interest,
      state: "upcoming" as const,
    }));
    if (rows.length) await supabase.from("loan_installment").insert(rows);

    // Journal entry: DR Loans receivable / CR Cash — use product-configured accounts if present
    const { data: product } = await supabase
      .from("loan_product")
      .select("principal_account_id, cash_account_id")
      .eq("id", loan.product_id)
      .maybeSingle<{ principal_account_id: string | null; cash_account_id: string | null }>();
    let arId = product?.principal_account_id ?? null;
    let cashId = product?.cash_account_id ?? null;
    if (!arId || !cashId) {
      const { data: accts } = await supabase.from("gl_account").select("id, code").in("code", ["1100", "1000"]);
      arId = arId ?? accts?.find((a) => a.code === "1100")?.id ?? null;
      cashId = cashId ?? accts?.find((a) => a.code === "1000")?.id ?? null;
    }
    if (!arId || !cashId) throw new Error("Chart of accounts missing — configure product accounts");
    const ref = "DSB-" + Math.floor(1000 + Math.random() * 9000);
    const { data: entry, error: entryErr } = await supabase
      .from("journal_entry")
      .insert({
        reference: ref,
        branch_id: loan.branch_id,
        loan_id: loan.id,
        posted_by: staff.id,
        description: `Loan disbursement ${ref}`,
      })
      .select()
      .single();
    if (entryErr) throw entryErr;
    const { error: postErr } = await supabase.from("posting").insert([
      { entry_id: entry.id, account_id: arId, debit: loan.principal, credit: 0 },
      { entry_id: entry.id, account_id: cashId, debit: 0, credit: loan.principal },
    ]);
    if (postErr) throw postErr;


    return { ok: true, reference: ref };
  });

export const recordRepayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { loan_id: string; amount: number; channel: "cash" | "mpesa" | "bank" }) =>
      z
        .object({
          loan_id: z.string().uuid(),
          amount: z.number().positive(),
          channel: z.enum(["cash", "mpesa", "bank"]),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: staff } = await supabase.from("staff").select("id, branch_id").eq("user_id", context.userId).maybeSingle();
    if (!staff) throw new Error("No staff profile");
    const { data: loan } = await supabase
      .from("loan")
      .select("id, principal, branch_id, annual_rate_pct, term_months, product_id")
      .eq("id", data.loan_id)
      .maybeSingle();
    if (!loan) throw new Error("Loan not found");

    // Split: 90% principal, 10% interest (simple)
    const principalPortion = Number((data.amount * 0.9).toFixed(2));
    const interestPortion = Number((data.amount - principalPortion).toFixed(2));

    // Apply to earliest unpaid installment
    const { data: inst } = await supabase
      .from("loan_installment")
      .select("id, principal_due, interest_due, principal_paid, interest_paid, state")
      .eq("loan_id", loan.id)
      .in("state", ["upcoming", "due", "partial", "overdue"])
      .order("seq")
      .limit(1)
      .maybeSingle();
    if (inst) {
      const newPrinc = Number(inst.principal_paid) + principalPortion;
      const newInt = Number(inst.interest_paid) + interestPortion;
      const fullyPaid = newPrinc >= Number(inst.principal_due) && newInt >= Number(inst.interest_due);
      await supabase
        .from("loan_installment")
        .update({
          principal_paid: newPrinc,
          interest_paid: newInt,
          state: fullyPaid ? "paid" : "partial",
        })
        .eq("id", inst.id);
    }

    // Use product-configured accounts if present
    const { data: product } = await supabase
      .from("loan_product")
      .select("principal_account_id, cash_account_id, interest_income_account_id")
      .eq("id", loan.product_id)
      .maybeSingle<{
        principal_account_id: string | null;
        cash_account_id: string | null;
        interest_income_account_id: string | null;
      }>();
    let cashId = product?.cash_account_id ?? null;
    let arId = product?.principal_account_id ?? null;
    let incomeId = product?.interest_income_account_id ?? null;
    if (!cashId || !arId || !incomeId) {
      const { data: accts } = await supabase.from("gl_account").select("id, code").in("code", ["1000", "1100", "4000"]);
      cashId = cashId ?? accts?.find((a) => a.code === "1000")?.id ?? null;
      arId = arId ?? accts?.find((a) => a.code === "1100")?.id ?? null;
      incomeId = incomeId ?? accts?.find((a) => a.code === "4000")?.id ?? null;
    }
    if (!cashId || !arId || !incomeId) throw new Error("Chart of accounts missing — configure product accounts");
    const ref = "RC-" + Math.floor(1000 + Math.random() * 9000);

    const { data: entry, error: eErr } = await supabase
      .from("journal_entry")
      .insert({
        reference: ref,
        branch_id: loan.branch_id,
        loan_id: loan.id,
        posted_by: staff.id,
        description: `Repayment ${ref} · ${data.channel}`,
      })
      .select()
      .single();
    if (eErr) throw eErr;
    const { error: pErr } = await supabase.from("posting").insert([
      { entry_id: entry.id, account_id: cashId, debit: data.amount, credit: 0 },
      { entry_id: entry.id, account_id: arId, debit: 0, credit: principalPortion },
      { entry_id: entry.id, account_id: incomeId, debit: 0, credit: interestPortion },
    ]);
    if (pErr) throw pErr;
    const { error: rErr } = await supabase.from("repayment").insert({
      loan_id: loan.id,
      entry_id: entry.id,
      amount: data.amount,
      channel: data.channel,
      received_by: staff.id,
    });
    if (rErr) throw rErr;

    return { ok: true, reference: ref };
  });

export const getCollections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = new Date().toISOString().slice(0, 10);
    const { data: today_rep } = await supabase
      .from("repayment")
      .select("id, amount, channel, received_at, loan:loan_id(client:client_id(full_name, avatar_color))")
      .gte("received_at", today)
      .order("received_at", { ascending: false });
    const totalToday = (today_rep ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const { data: groups } = await supabase
      .from("lending_group")
      .select("id, name, meeting_day, meeting_place, target_today, color")
      .not("meeting_day", "is", null);
    return {
      totalToday,
      target: 250000,
      recorded: today_rep ?? [],
      groups: groups ?? [],
    };
  });

export const getActiveLoansForClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("loan")
      .select("id, principal, client:client_id(full_name)")
      .in("status", ["disbursed", "active"])
      .order("disbursed_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const createLoanProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      name: string;
      annual_rate_pct: number;
      max_annual_rate_pct?: number;
      min_term_months: number;
      max_term_months: number;
      min_principal: number;
      max_principal?: number | null;
      frequency: "daily" | "weekly" | "biweekly" | "monthly";
      interest_method?: "flat" | "declining_balance";
      processing_fee_pct?: number;
      color?: string;
      principal_account_id?: string | null;
      cash_account_id?: string | null;
      interest_income_account_id?: string | null;
      fee_income_account_id?: string | null;
    }) =>
      z
        .object({
          name: z.string().trim().min(2).max(80),
          annual_rate_pct: z.number().positive().max(200),
          max_annual_rate_pct: z.number().positive().max(200).optional(),
          min_term_months: z.number().int().positive().max(120),
          max_term_months: z.number().int().positive().max(120),
          min_principal: z.number().nonnegative(),
          max_principal: z.number().positive().nullable().optional(),
          frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]),
          interest_method: z.enum(["flat", "declining_balance"]).optional(),
          processing_fee_pct: z.number().nonnegative().max(50).optional(),
          color: z.string().max(20).optional(),
          principal_account_id: z.string().uuid().nullable().optional(),
          cash_account_id: z.string().uuid().nullable().optional(),
          interest_income_account_id: z.string().uuid().nullable().optional(),
          fee_income_account_id: z.string().uuid().nullable().optional(),
        })
        .refine((v) => v.max_term_months >= v.min_term_months, {
          message: "Max term must be >= min term",
          path: ["max_term_months"],
        })
        .refine((v) => !v.max_principal || v.max_principal >= v.min_principal, {
          message: "Max principal must be >= min principal",
          path: ["max_principal"],
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can create loan products");
    const { data: created, error } = await supabase
      .from("loan_product")
      .insert({
        name: data.name,
        annual_rate_pct: data.annual_rate_pct,
        min_term_months: data.min_term_months,
        max_term_months: data.max_term_months,
        min_principal: data.min_principal,
        max_principal: data.max_principal ?? null,
        frequency: data.frequency,
        interest_method: data.interest_method ?? "flat",
        processing_fee_pct: data.processing_fee_pct ?? 0,
        color: data.color ?? "#0f766e",
        is_active: true,
        principal_account_id: data.principal_account_id ?? null,
        cash_account_id: data.cash_account_id ?? null,
        interest_income_account_id: data.interest_income_account_id ?? null,
        fee_income_account_id: data.fee_income_account_id ?? null,
      } as never)
      .select()
      .single();
    if (error) throw error;
    return created;
  });


export const toggleLoanProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; is_active: boolean }) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can modify loan products");
    const { error } = await supabase.from("loan_product").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getAllLoanProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("loan_product")
      .select("*")
      .order("is_active", { ascending: false })
      .order("name");
    return data ?? [];
  });

// ─────────────────────────────────────────────────────────────────────────────
// CHART OF ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────

export const getGlAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("gl_account").select("*").order("code");
    return data ?? [];
  });

export const createGlAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      code: string;
      name: string;
      type: "asset" | "liability" | "equity" | "income" | "expense";
      normal_balance: 1 | -1;
    }) =>
      z
        .object({
          code: z.string().trim().min(1).max(20),
          name: z.string().trim().min(2).max(120),
          type: z.enum(["asset", "liability", "equity", "income", "expense"]),
          normal_balance: z.union([z.literal(1), z.literal(-1)]),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can create GL accounts");
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");
    const { data: created, error } = await supabase
      .from("gl_account")
      .insert({
        company_id: cid,
        code: data.code,
        name: data.name,
        type: data.type,
        normal_balance: data.normal_balance,
      })
      .select()
      .single();
    if (error) throw error;
    return created;
  });

export const toggleGlAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; is_active: boolean }) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can modify GL accounts");
    const { error } = await supabase.from("gl_account").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getJournalEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { from?: string; to?: string; search?: string; page?: number; pageSize?: number }) =>
      z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
          search: z.string().optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(1).max(200).optional(),
        })
        .parse(i ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 25;
    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize - 1;

    let q = supabase
      .from("journal_entry")
      .select("id, reference, entry_date, description, created_at, loan_id, branch:branch_id(code,name)", { count: "exact" })
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(fromIdx, toIdx);
    if (data.from) q = q.gte("entry_date", data.from);
    if (data.to) q = q.lte("entry_date", data.to);
    if (data.search && data.search.trim()) {
      const s = data.search.trim().replace(/[%,]/g, "");
      q = q.or(`reference.ilike.%${s}%,description.ilike.%${s}%`);
    }
    const { data: entries, count } = await q;
    const ids = (entries ?? []).map((e) => e.id);
    const postingsByEntry: Record<string, { debit: number; credit: number; lines: number }> = {};
    if (ids.length) {
      const { data: postings } = await supabase
        .from("posting")
        .select("entry_id, debit, credit")
        .in("entry_id", ids);
      for (const p of postings ?? []) {
        const k = p.entry_id as string;
        const cur = postingsByEntry[k] ?? { debit: 0, credit: 0, lines: 0 };
        cur.debit += Number(p.debit ?? 0);
        cur.credit += Number(p.credit ?? 0);
        cur.lines += 1;
        postingsByEntry[k] = cur;
      }
    }
    return {
      entries: (entries ?? []).map((e) => ({ ...e, totals: postingsByEntry[e.id] ?? { debit: 0, credit: 0, lines: 0 } })),
      total: count ?? 0,
      page,
      pageSize,
    };
  });

export const getPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { from?: string; to?: string; channel?: string; search?: string; page?: number; pageSize?: number }) =>
      z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
          channel: z.string().optional(),
          search: z.string().optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(1).max(200).optional(),
        })
        .parse(i ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 25;
    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize - 1;
    const search = data.search?.trim().replace(/[%,]/g, "") ?? "";
    const useInner = !!search;

    // Data page (with count)
    let q = supabase
      .from("repayment")
      .select(
        `id, amount, channel, received_at, entry_id,
         loan:loan_id(id, client:client_id${useInner ? "!inner" : ""}(id, full_name)),
         received_by_staff:received_by(full_name)`,
        { count: "exact" },
      )
      .order("received_at", { ascending: false })
      .range(fromIdx, toIdx);
    if (data.from) q = q.gte("received_at", data.from);
    if (data.to) q = q.lte("received_at", data.to + "T23:59:59");
    if (data.channel) q = q.eq("channel", data.channel as any);
    if (search) q = q.ilike("loan.client.full_name", `%${search}%`);
    const { data: payments, count } = await q;

    // Filtered sum across all pages
    let sumQ = supabase
      .from("repayment")
      .select(`amount, loan:loan_id(client:client_id${useInner ? "!inner" : ""}(id))`);
    if (data.from) sumQ = sumQ.gte("received_at", data.from);
    if (data.to) sumQ = sumQ.lte("received_at", data.to + "T23:59:59");
    if (data.channel) sumQ = sumQ.eq("channel", data.channel as any);
    if (search) sumQ = sumQ.ilike("loan.client.full_name", `%${search}%`);
    const { data: sumRows } = await sumQ;
    const totalAmount = (sumRows ?? []).reduce((s, r: any) => s + Number(r.amount ?? 0), 0);

    return {
      payments: payments ?? [],
      totalCount: count ?? 0,
      totalAmount,
      page,
      pageSize,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY (workspace) & TEAM
// ─────────────────────────────────────────────────────────────────────────────

export const getCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) return null;
    const { data, error } = await supabase
      .from("company")
      .select("id,name,slug,currency,country,fy_end_month,fy_end_day,timezone,owner_user_id,created_at")
      .eq("id", cid)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name?: string; currency?: string; country?: string; fy_end_month?: number; fy_end_day?: number; timezone?: string }) =>
    z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        currency: z.string().trim().length(3).optional(),
        country: z.string().trim().min(2).max(80).optional(),
        fy_end_month: z.number().int().min(1).max(12).optional(),
        fy_end_day: z.number().int().min(1).max(31).optional(),
        timezone: z.string().trim().min(2).max(60).optional(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");
    const patch: {
      name?: string;
      currency?: string;
      country?: string;
      fy_end_month?: number;
      fy_end_day?: number;
      timezone?: string;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.currency !== undefined) patch.currency = data.currency.toUpperCase();
    if (data.country !== undefined) patch.country = data.country;
    if (data.fy_end_month !== undefined) patch.fy_end_month = data.fy_end_month;
    if (data.fy_end_day !== undefined) patch.fy_end_day = data.fy_end_day;
    if (data.timezone !== undefined) patch.timezone = data.timezone;
    const { data: updated, error } = await supabase
      .from("company")
      .update(patch)
      .eq("id", cid)
      .select()
      .single();
    if (error) throw error;
    return updated;
  });

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) return { members: [], invites: [] };
    const { data: branches } = await supabase.from("branch").select("id,name").eq("company_id", cid);
    const branchIds = (branches ?? []).map((b) => b.id);
    const { data: members } = await supabase
      .from("staff")
      .select("id,full_name,email,role,is_active,user_id,branch_id,created_at,branch:branch_id(id,name)")
      .in("branch_id", branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: invites } = await supabase
      .from("company_invite")
      .select("id,email,role,branch_id,accepted_at,expires_at,created_at,branch:branch_id(id,name)")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });
    return { members: members ?? [], invites: invites ?? [] };
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { email: string; role: "loan_officer" | "branch_manager" | "teller" | "operations" | "admin"; branch_id?: string }) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        role: z.enum(["loan_officer", "branch_manager", "teller", "operations", "admin"]),
        branch_id: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) throw new Error("No active company");
    const { data: isAdmin } = await supabase.rpc("is_company_admin", { _company_id: cid });
    if (!isAdmin) throw new Error("Only company admins can invite teammates");
    const { data: created, error } = await supabase
      .from("company_invite")
      .insert({
        company_id: cid,
        email: data.email.toLowerCase(),
        role: data.role,
        branch_id: data.branch_id ?? null,
        invited_by: userId,
      })
      .select()
      .single();
    if (error) throw error;
    return created;
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("company_invite").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// FORMS: Payments & Journal Entries (multi-branch aware)
// ─────────────────────────────────────────────────────────────────────────────

export const listCompanyBranches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: cid } = await supabase.rpc("current_company_id");
    if (!cid) return [];
    const { data } = await supabase
      .from("branch")
      .select("id, code, name")
      .eq("company_id", cid)
      .order("name");
    return data ?? [];
  });

export const listGlAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("gl_account")
      .select("id, code, name, type, normal_balance, is_active")
      .eq("is_active", true)
      .order("code");
    return data ?? [];
  });

export const createPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      loan_id: string;
      branch_id: string;
      amount: number;
      channel: "cash" | "mpesa" | "bank";
      received_at?: string;
      reference?: string;
      notes?: string;
    }) =>
      z
        .object({
          loan_id: z.string().uuid(),
          branch_id: z.string().uuid(),
          amount: z.number().positive(),
          channel: z.enum(["cash", "mpesa", "bank"]),
          received_at: z.string().optional(),
          reference: z.string().trim().max(60).optional(),
          notes: z.string().trim().max(300).optional(),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: staff } = await supabase
      .from("staff")
      .select("id, branch_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!staff) throw new Error("No staff profile");

    const { data: loan } = await supabase
      .from("loan")
      .select("id, principal, product_id")
      .eq("id", data.loan_id)
      .maybeSingle();
    if (!loan) throw new Error("Loan not found");

    const principalPortion = Number((data.amount * 0.9).toFixed(2));
    const interestPortion = Number((data.amount - principalPortion).toFixed(2));

    const { data: inst } = await supabase
      .from("loan_installment")
      .select("id, principal_due, interest_due, principal_paid, interest_paid, state")
      .eq("loan_id", loan.id)
      .in("state", ["upcoming", "due", "partial", "overdue"])
      .order("seq")
      .limit(1)
      .maybeSingle();
    if (inst) {
      const newPrinc = Number(inst.principal_paid) + principalPortion;
      const newInt = Number(inst.interest_paid) + interestPortion;
      const fullyPaid =
        newPrinc >= Number(inst.principal_due) && newInt >= Number(inst.interest_due);
      await supabase
        .from("loan_installment")
        .update({
          principal_paid: newPrinc,
          interest_paid: newInt,
          state: fullyPaid ? "paid" : "partial",
        })
        .eq("id", inst.id);
    }

    const { data: product } = await supabase
      .from("loan_product")
      .select("principal_account_id, cash_account_id, interest_income_account_id")
      .eq("id", loan.product_id)
      .maybeSingle<{
        principal_account_id: string | null;
        cash_account_id: string | null;
        interest_income_account_id: string | null;
      }>();
    let cashId = product?.cash_account_id ?? null;
    let arId = product?.principal_account_id ?? null;
    let incomeId = product?.interest_income_account_id ?? null;
    if (!cashId || !arId || !incomeId) {
      const { data: accts } = await supabase
        .from("gl_account")
        .select("id, code")
        .in("code", ["1000", "1100", "4000"]);
      cashId = cashId ?? accts?.find((a) => a.code === "1000")?.id ?? null;
      arId = arId ?? accts?.find((a) => a.code === "1100")?.id ?? null;
      incomeId = incomeId ?? accts?.find((a) => a.code === "4000")?.id ?? null;
    }
    if (!cashId || !arId || !incomeId)
      throw new Error("Chart of accounts missing — configure product accounts");

    const ref = data.reference?.trim() || "RC-" + Math.floor(1000 + Math.random() * 9000);
    const entryDate = (data.received_at || new Date().toISOString()).slice(0, 10);

    const { data: entry, error: eErr } = await supabase
      .from("journal_entry")
      .insert({
        reference: ref,
        branch_id: data.branch_id,
        loan_id: loan.id,
        posted_by: staff.id,
        entry_date: entryDate,
        description: `Payment ${ref} · ${data.channel}${data.notes ? " · " + data.notes : ""}`,
      })
      .select()
      .single();
    if (eErr) throw eErr;

    const { error: pErr } = await supabase.from("posting").insert([
      { entry_id: entry.id, account_id: cashId, debit: data.amount, credit: 0 },
      { entry_id: entry.id, account_id: arId, debit: 0, credit: principalPortion },
      { entry_id: entry.id, account_id: incomeId, debit: 0, credit: interestPortion },
    ]);
    if (pErr) throw pErr;

    const { error: rErr } = await supabase.from("repayment").insert({
      loan_id: loan.id,
      entry_id: entry.id,
      amount: data.amount,
      channel: data.channel,
      received_by: staff.id,
      received_at: data.received_at
        ? new Date(data.received_at).toISOString()
        : new Date().toISOString(),
    });
    if (rErr) throw rErr;

    return { ok: true, reference: ref, entry_id: entry.id };
  });

export const createJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      branch_id: string;
      entry_date: string;
      reference?: string;
      description?: string;
      lines: { account_id: string; debit: number; credit: number }[];
    }) =>
      z
        .object({
          branch_id: z.string().uuid(),
          entry_date: z.string().min(1),
          reference: z.string().trim().max(60).optional(),
          description: z.string().trim().max(300).optional(),
          lines: z
            .array(
              z.object({
                account_id: z.string().uuid(),
                debit: z.number().min(0),
                credit: z.number().min(0),
              }),
            )
            .min(2),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!staff) throw new Error("No staff profile");

    const clean = data.lines
      .map((l) => ({
        account_id: l.account_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }))
      .filter((l) => l.debit > 0 || l.credit > 0);
    if (clean.length < 2) throw new Error("Add at least two posting lines");
    for (const l of clean) {
      if (l.debit > 0 && l.credit > 0)
        throw new Error("A line must be either a debit or a credit, not both");
    }
    const totalD = clean.reduce((s, l) => s + l.debit, 0);
    const totalC = clean.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalD - totalC) > 0.01)
      throw new Error(`Entry is unbalanced: DR ${totalD.toFixed(2)} vs CR ${totalC.toFixed(2)}`);

    const ref = data.reference?.trim() || "JE-" + Math.floor(1000 + Math.random() * 9000);

    const { data: entry, error: eErr } = await supabase
      .from("journal_entry")
      .insert({
        reference: ref,
        branch_id: data.branch_id,
        entry_date: data.entry_date,
        posted_by: staff.id,
        description: data.description || null,
      })
      .select()
      .single();
    if (eErr) throw eErr;

    const { error: pErr } = await supabase
      .from("posting")
      .insert(clean.map((l) => ({ entry_id: entry.id, ...l })));
    if (pErr) throw pErr;

    return { ok: true, reference: ref, entry_id: entry.id };
  });
