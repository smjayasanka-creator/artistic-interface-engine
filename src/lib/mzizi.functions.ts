import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { serverNow, serverToday } from "@/lib/clock-server";
import { generateSchedule, generateStructuredSchedule, type Frequency } from "@/lib/loan-schedule";

// ─────────────────────────────────────────────────────────────────────────────
// READS
// ─────────────────────────────────────────────────────────────────────────────

export const getTellerSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase
      .from("staff")
      .select("id, full_name, branch_id, branch:branch_id(id, code, name)")
      .eq("user_id", userId)
      .maybeSingle();

    const startOfDay = serverNow();
    startOfDay.setHours(0, 0, 0, 0);
    const sinceIso = startOfDay.toISOString();
    const todayDate = sinceIso.slice(0, 10);

    const staffId = staff?.id ?? null;

    const [
      { data: repays },
      { data: fdReceipts },
      { data: fdWithdrawals },
      { data: disbursals },
    ] = await Promise.all([
      staffId
        ? supabase
            .from("repayment")
            .select("amount")
            .eq("received_by", staffId)
            .gte("received_at", sinceIso)
        : Promise.resolve({ data: [] as { amount: number }[] } as any),
      supabase
        .from("fd_transaction")
        .select("amount")
        .eq("created_by", userId)
        .eq("type", "deposit_receipt")
        .gte("txn_date", todayDate),
      supabase
        .from("fd_transaction")
        .select("amount")
        .eq("created_by", userId)
        .eq("type", "withdrawal")
        .gte("txn_date", todayDate),
      staffId
        ? supabase
            .from("loan")
            .select("principal")
            .eq("approved_by", staffId)
            .gte("disbursed_at", sinceIso)
        : Promise.resolve({ data: [] as { principal: number }[] } as any),
    ]);

    const sum = (rows: any[] | null | undefined, key: string) =>
      (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);

    return {
      staff,
      asOf: serverNow().toISOString(),
      opening_balance: 0,
      cash_from_vault: 0,
      receipts: {
        loan_repayments: sum(repays, "amount"),
        deposit_receipts: sum(fdReceipts, "amount"),
        other: 0,
      },
      payments: {
        loan_disbursements: sum(disbursals, "principal"),
        deposit_withdrawals: sum(fdWithdrawals, "amount"),
        other: 0,
      },
    };
  });

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
    const today = serverToday();

    const weekAgoIso = new Date(Date.now() - 7 * 864e5).toISOString();
    const startOfDay = serverNow();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfDayIso = startOfDay.toISOString();

    const [
      { count: activeClients },
      { data: outstanding },
      { data: par },
      { data: repayToday },
      { data: disbWeek },
      { data: approvals },
      { data: meetings },
      { data: wfActions },
      { data: staffRows },
    ] = await Promise.all([
      supabase.from("client").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("v_loan_outstanding").select("outstanding_principal"),
      supabase.from("v_par_aging").select("bucket, principal_at_risk"),
      supabase.from("repayment").select("amount").gte("received_at", today),
      supabase.from("loan").select("principal").gte("disbursed_at", weekAgoIso),
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
      supabase
        .from("workflow_action")
        .select("actor_user_id, decision, acted_at")
        .gte("acted_at", weekAgoIso),
      supabase.from("staff").select("id, user_id, full_name, role"),
    ]);

    const outstandingTotal = (outstanding ?? []).reduce((s, r) => s + Number(r.outstanding_principal ?? 0), 0);
    const parBuckets = ["current", "1-30", "31-60", "61-90", "90+"].map((b) => {
      const row = (par ?? []).find((r) => r.bucket === b);
      return { bucket: b, amount: Number(row?.principal_at_risk ?? 0) };
    });
    const collectedToday = (repayToday ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const disbursedWeek = (disbWeek ?? []).reduce((s, r) => s + Number(r.principal), 0);
    const par30plus = parBuckets.filter((b) => b.bucket !== "current" && b.bucket !== "1-30").reduce((s, b) => s + b.amount, 0);

    // Team activity — workflow actions per staff (today + last 7 days)
    const staffByUser = new Map((staffRows ?? []).map((s: any) => [s.user_id, s]));
    type TeamRow = { staff_id: string; name: string; role: string; today: number; week: number; approvals: number; declines: number; last_at: string | null };
    const perStaff = new Map<string, TeamRow>();
    for (const a of (wfActions ?? []) as any[]) {
      const s = staffByUser.get(a.actor_user_id) as any;
      if (!s) continue;
      const row = perStaff.get(s.id) ?? { staff_id: s.id, name: s.full_name, role: s.role, today: 0, week: 0, approvals: 0, declines: 0, last_at: null };
      row.week += 1;
      if (a.acted_at >= startOfDayIso) row.today += 1;
      if (a.decision === "approve") row.approvals += 1;
      if (a.decision === "decline") row.declines += 1;
      if (!row.last_at || a.acted_at > row.last_at) row.last_at = a.acted_at;
      perStaff.set(s.id, row);
    }
    const team = Array.from(perStaff.values()).sort((a, b) => b.week - a.week).slice(0, 6);
    const teamTotals = {
      totalToday: (wfActions ?? []).filter((a: any) => a.acted_at >= startOfDayIso).length,
      totalWeek: (wfActions ?? []).length,
      activeStaff: perStaff.size,
      maxWeek: team.reduce((m, r) => Math.max(m, r.week), 0),
    };

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
      team,
      teamTotals,
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
      .select(
        "id, full_name, first_name, last_name, phone, phone_country_code, national_id, email, address, gn_division, divisional_secretariat, district, province, date_of_birth, gender, occupation, monthly_income, next_of_kin_name, next_of_kin_phone, photo_url, geo_lat, geo_lng, is_introducer, status, risk_grade, avatar_color, joined_on, group:group_id(id, name)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (!client) throw new Error("Client not found");

    const { data: loans } = await supabase
      .from("loan")
      .select("id, status, principal, term_months, annual_rate_pct, frequency, disbursed_at, created_at, product:product_id(name)")
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

    const loanIds = (loans ?? []).map((l) => l.id);
    const { data: repayments } = loanIds.length
      ? await supabase
          .from("repayment")
          .select("id, amount, channel, received_at, loan_id")
          .in("loan_id", loanIds)
          .order("received_at", { ascending: false })
          .limit(100)
      : { data: [] as any[] };

    const totalOut = loanIds.length
      ? (await supabase.from("v_loan_outstanding").select("outstanding_principal").in("loan_id", loanIds)).data
          ?.reduce((s, r) => s + Number(r.outstanding_principal ?? 0), 0) ?? 0
      : 0;
    const activeLoans = (loans ?? []).filter((l) => l.status === "disbursed" || l.status === "active").length;

    const { data: savings } = await supabase
      .from("savings_account")
      .select("id, account_no, status, balance, available_balance, interest_accrued, opened_on, last_txn_at, product:product_id(name)")
      .eq("client_id", data.id)
      .order("opened_on", { ascending: false });

    const savingsIds = (savings ?? []).map((s) => s.id);
    const { data: savingsTxns } = savingsIds.length
      ? await supabase
          .from("savings_transaction")
          .select("id, account_id, txn_date, txn_type, channel, amount, running_balance, reference, narration, created_at")
          .in("account_id", savingsIds)
          .order("txn_date", { ascending: false })
          .limit(100)
      : { data: [] as any[] };

    const { data: fds } = await supabase
      .from("fixed_deposit")
      .select("id, certificate_no, status, principal, rate_at_booking, tenure_months, payout_option, value_date, maturity_date, product:product_id(name)")
      .eq("client_id", data.id)
      .order("value_date", { ascending: false });

    const fdIds = (fds ?? []).map((f) => f.id);
    const { data: fdTxns } = fdIds.length
      ? await supabase
          .from("fd_transaction")
          .select("id, deposit_id, type, amount, txn_date, reference, created_at")
          .in("deposit_id", fdIds)
          .order("txn_date", { ascending: false })
          .limit(100)
      : { data: [] as any[] };

    const { data: bankAccounts } = await supabase
      .from("client_bank_account")
      .select("id, bank_name, branch_name, account_no, account_name, swift_code, is_primary")
      .eq("client_id", data.id);

    const savingsBalance = (savings ?? []).reduce((s, a) => s + Number(a.balance ?? 0), 0);
    const fdBalance = (fds ?? [])
      .filter((f) => f.status === "active")
      .reduce((s, f) => s + Number(f.principal ?? 0), 0);

    // Documents from storage bucket
    let documents: Array<{ name: string; path: string; size: number; updated_at: string | null }> = [];
    try {
      const { data: docList } = await supabase.storage.from("client-documents").list(data.id, { limit: 50 });
      documents = (docList ?? []).map((d) => ({
        name: d.name,
        path: `${data.id}/${d.name}`,
        size: (d.metadata as any)?.size ?? 0,
        updated_at: d.updated_at ?? d.created_at ?? null,
      }));
    } catch {
      documents = [];
    }

    return {
      client,
      loans: loans ?? [],
      active: active ? { ...active, schedule, outstanding, repaid } : null,
      repayments: repayments ?? [],
      savings: savings ?? [],
      savingsTxns: savingsTxns ?? [],
      fds: fds ?? [],
      fdTxns: fdTxns ?? [],
      bankAccounts: bankAccounts ?? [],
      documents,
      stats: {
        outstanding: totalOut,
        savings: savingsBalance,
        fdBalance,
        activeLoans,
        activeSavings: (savings ?? []).filter((s) => s.status === "active").length,
        activeFds: (fds ?? []).filter((f) => f.status === "active").length,
        onTimeRate: schedule.length
          ? Math.round((schedule.filter((s) => s.state === "paid").length / schedule.length) * 100)
          : 100,
      },
    };
  });


export const getLoans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { page?: number; pageSize?: number } = {}) => ({
    page: Math.max(1, Number(i.page ?? 1)),
    pageSize: Math.min(200, Math.max(1, Number(i.pageSize ?? 25))),
  }))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: loans, count } = await supabase
      .from("loan")
      .select(
        "id, principal, status, disbursed_at, client:client_id(id, full_name, avatar_color), product:product_id(name)",
        { count: "exact" },
      )
      .in("status", ["disbursed", "active", "closed"])
      .order("disbursed_at", { ascending: false })
      .range(from, to);
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

    const rows = (loans ?? []).map((l) => {
      const o = outMap.get(l.id);
      const out = Number(o?.outstanding_principal ?? 0);
      const rep = Number(o?.principal_repaid ?? 0);
      const nxt = nextMap.get(l.id);
      const overdue = nxt && new Date(nxt.due_date) < serverNow();
      return {
        ...l,
        outstanding: out,
        repaid: rep,
        progress: l.principal > 0 ? Math.min(100, Math.round((rep / Number(l.principal)) * 100)) : 0,
        nextDue: nxt?.due_date ?? null,
        overdue,
      };
    });
    return { rows, totalCount: count ?? 0 };
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

    const now = serverNow();
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
  .inputValidator((i: { code: string; name: string; region?: string; currency?: string; opened_on?: string; branch_prefix?: string; savings_prefix?: string; fd_prefix?: string; loan_prefix?: string }) =>
    z
      .object({
        code: z.string().trim().min(1).max(20),
        name: z.string().trim().min(2).max(80),
        region: z.string().trim().max(80).optional().or(z.literal("")),
        currency: z.string().trim().length(3).optional(),
        opened_on: z.string().optional().or(z.literal("")),
        branch_prefix: z.string().trim().max(6).optional().or(z.literal("")),
        savings_prefix: z.string().trim().max(6).optional().or(z.literal("")),
        fd_prefix: z.string().trim().max(6).optional().or(z.literal("")),
        loan_prefix: z.string().trim().max(6).optional().or(z.literal("")),
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
        branch_prefix: data.branch_prefix?.toUpperCase() || null,
        savings_prefix: data.savings_prefix?.toUpperCase() || null,
        fd_prefix: data.fd_prefix?.toUpperCase() || null,
        loan_prefix: data.loan_prefix?.toUpperCase() || null,
      })
      .select()
      .single();
    if (error) throw error;
    return created;
  });

export const updateBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { id: string; code: string; name: string; region?: string | null; currency?: string; opened_on?: string | null; branch_prefix?: string | null; savings_prefix?: string | null; fd_prefix?: string | null; loan_prefix?: string | null }) =>
      z
        .object({
          id: z.string().uuid(),
          code: z.string().trim().min(1).max(20),
          name: z.string().trim().min(2).max(80),
          region: z.string().trim().max(80).nullable().optional().or(z.literal("")),
          currency: z.string().trim().length(3).optional(),
          opened_on: z.string().nullable().optional().or(z.literal("")),
          branch_prefix: z.string().trim().max(6).nullable().optional().or(z.literal("")),
          savings_prefix: z.string().trim().max(6).nullable().optional().or(z.literal("")),
          fd_prefix: z.string().trim().max(6).nullable().optional().or(z.literal("")),
          loan_prefix: z.string().trim().max(6).nullable().optional().or(z.literal("")),
        })
        .parse(i),
    )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can edit branches");
    const { error } = await supabase
      .from("branch")
      .update({
        code: data.code,
        name: data.name,
        region: data.region || null,
        currency: (data.currency || "KES").toUpperCase(),
        opened_on: data.opened_on || null,
        branch_prefix: data.branch_prefix?.toUpperCase() || null,
        savings_prefix: data.savings_prefix?.toUpperCase() || null,
        fd_prefix: data.fd_prefix?.toUpperCase() || null,
        loan_prefix: data.loan_prefix?.toUpperCase() || null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
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

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      id: string;
      full_name: string;
      role: "loan_officer" | "branch_manager" | "teller" | "operations" | "admin";
      branch_id: string;
      email?: string | null;
      phone?: string | null;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          full_name: z.string().trim().min(2).max(80),
          role: z.enum(["loan_officer", "branch_manager", "teller", "operations", "admin"]),
          branch_id: z.string().uuid(),
          email: z.string().trim().email().nullable().optional().or(z.literal("")),
          phone: z.string().trim().max(30).nullable().optional().or(z.literal("")),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can edit staff");
    const { error } = await supabase
      .from("staff")
      .update({
        full_name: data.full_name,
        role: data.role,
        branch_id: data.branch_id,
        email: data.email || null,
        phone: data.phone || null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("loan_product")
      .select("id, name, annual_rate_pct, frequency, color, min_principal, max_principal, min_term_months, max_term_months, required_documents")
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
      first_name: string;
      last_name: string;
      phone_country_code: string;
      phone: string;
      national_id: string;
      date_of_birth: string;
      gender: "male" | "female" | "other";
      address: string;
      gn_division: string;
      divisional_secretariat: string;
      district: string;
      province: string;
      photo_url?: string | null;
      geo_lat?: number | null;
      geo_lng?: number | null;
      email?: string;
      group_id?: string | null;
      is_introducer?: boolean;
      default_commission_pct?: number | null;
      default_commission_amount?: number | null;
      bank_accounts?: Array<{
        bank_name: string;
        branch_name?: string | null;
        account_no: string;
        account_name: string;
        swift_code?: string | null;
        is_primary?: boolean;
      }>;
    }) =>
      (() => {
        const schema = z.object({
          first_name: z.string().trim().min(1, "First name is required").max(60),
          last_name: z.string().trim().min(1, "Last name is required").max(60),
          phone_country_code: z.string().trim().min(1, "Country code is required").max(6),
          phone: z.string().trim().min(6, "Phone is required").max(20),
          national_id: z.string().trim().min(4, "National ID is required").max(30),
          date_of_birth: z.string().min(1, "Date of birth is required"),
          gender: z.enum(["male", "female", "other"]),
          address: z.string().trim().min(3, "Address is required").max(200),
          gn_division: z.string().trim().min(1, "GN Division is required").max(80),
          divisional_secretariat: z.string().trim().min(1, "Divisional Secretariat is required").max(80),
          district: z.string().trim().min(1, "District is required").max(80),
          province: z.string().trim().min(1, "Province is required").max(80),
          photo_url: z.string().trim().max(500).nullable().optional(),
          geo_lat: z.number().min(-90).max(90).nullable().optional(),
          geo_lng: z.number().min(-180).max(180).nullable().optional(),
          email: z.string().trim().email().max(255).optional().or(z.literal("")),
          group_id: z.string().uuid().nullable().optional(),
          is_introducer: z.boolean().optional(),
          default_commission_pct: z.number().min(0).max(100).nullable().optional(),
          default_commission_amount: z.number().min(0).nullable().optional(),
          bank_accounts: z
            .array(
              z.object({
                bank_name: z.string().trim().min(1).max(120),
                branch_name: z.string().trim().max(120).nullable().optional(),
                account_no: z.string().trim().min(1).max(60),
                account_name: z.string().trim().min(1).max(120),
                swift_code: z.string().trim().max(30).nullable().optional(),
                is_primary: z.boolean().optional(),
              }),
            )
            .optional(),
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
    const { data: staff } = await supabase
      .from("staff")
      .select("id, branch_id, branch:branch_id(company_id)")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!staff) throw new Error("No staff profile");
    const companyId = (staff as any)?.branch?.company_id ?? null;

    // 1) Call Instafin FIRST — do not touch local DB unless it succeeds.
    const { instafinCreatePerson, InstafinError } = await import("./instafin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let externalPersonId: string | null = null;
    let externalClientId: string | null = null;
    try {
      const call = await instafinCreatePerson({
        first_name: data.first_name,
        last_name: data.last_name,
        phone_country_code: data.phone_country_code,
        phone: data.phone,
        date_of_birth: data.date_of_birth,
        email: data.email || null,
        address: data.address,
        gn_division: data.gn_division,
        divisional_secretariat: data.divisional_secretariat,
        district: data.district,
        province: data.province,
      });
      externalPersonId = (call.result?.ID as string) ?? null;
      externalClientId =
        call.result?.clientID != null ? String(call.result.clientID) : null;
      await supabaseAdmin.from("api_transaction_log").insert({
        company_id: companyId,
        channel: "instafin",
        direction: "outbound",
        endpoint: "/submit/instafin.CreatePerson",
        method: "POST",
        status_code: call.status,
        reference: externalPersonId,
        request: call.requestBody as any,
        response: call.responseBody as any,
      });
    } catch (e) {
      const err = e as InstanceType<typeof InstafinError> | Error;
      const status = (err as any).status ?? 0;
      const body = (err as any).body ?? null;
      await supabaseAdmin.from("api_transaction_log").insert({
        company_id: companyId,
        channel: "instafin",
        direction: "outbound",
        endpoint: "/submit/instafin.CreatePerson",
        method: "POST",
        status_code: status,
        request: null,
        response: body as any,
        error: err.message,
      });
      throw new Error(err.message);
    }

    // 2) Instafin succeeded — persist locally.
    const colors = ["#0f766e", "#0369a1", "#7c3aed", "#c2410c", "#b45309", "#065f46", "#9333ea", "#be185d"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const fullName = `${data.first_name} ${data.last_name}`.trim();
    const fullPhone = `${data.phone_country_code}${data.phone}`;
    const { data: created, error } = await supabase
      .from("client")
      .insert({
        branch_id: staff.branch_id,
        officer_id: staff.id,
        first_name: data.first_name,
        last_name: data.last_name,
        full_name: fullName,
        phone_country_code: data.phone_country_code,
        phone: fullPhone,
        national_id: data.national_id,
        email: data.email || null,
        date_of_birth: data.date_of_birth,
        gender: data.gender,
        address: data.address,
        gn_division: data.gn_division,
        divisional_secretariat: data.divisional_secretariat,
        district: data.district,
        province: data.province,
        photo_url: data.photo_url ?? null,
        geo_lat: data.geo_lat ?? null,
        geo_lng: data.geo_lng ?? null,
        group_id: data.group_id ?? null,
        status: "active",
        avatar_color: color,
        is_introducer: data.is_introducer ?? false,
        default_commission_pct: data.default_commission_pct ?? null,
        default_commission_amount: data.default_commission_amount ?? null,
        external_person_id: externalPersonId,
        external_client_id: externalClientId,
      } as any)
      .select()
      .single();
    if (error) {
      throw new Error(
        `Client created in Instafin (${externalPersonId ?? "unknown ID"}) but local save failed: ${error.message}. Contact an admin.`,
      );
    }

    if (data.bank_accounts && data.bank_accounts.length > 0) {
      const rows = data.bank_accounts.map((b, i) => ({
        client_id: created.id,
        bank_name: b.bank_name,
        branch_name: b.branch_name ?? null,
        account_no: b.account_no,
        account_name: b.account_name,
        swift_code: b.swift_code ?? null,
        is_primary: b.is_primary ?? i === 0,
      }));
      const { error: bErr } = await supabase.from("client_bank_account").insert(rows);
      if (bErr) throw bErr;
    }

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
      schedule_type?: "normal" | "structured";
      schedule_overrides?: Record<string, number>;
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
          schedule_type: z.enum(["normal", "structured"]).optional(),
          schedule_overrides: z.record(z.string(), z.number()).optional(),
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
        schedule_type: data.schedule_type ?? "normal",
        schedule_overrides:
          data.schedule_type === "structured" && data.schedule_overrides
            ? (data.schedule_overrides as Record<string, number>)
            : null,
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
    const { supabase, userId } = context;
    const { data: staffRow } = await supabase
      .from("staff")
      .select("id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (!staffRow || !["admin", "branch_manager"].includes(staffRow.role as string)) {
      throw new Error("Only branch managers or admins can decline loans");
    }
    const { error } = await context.supabase.from("loan").update({ status: "rejected" }).eq("id", data.loan_id);
    if (error) throw error;
    return { ok: true };
  });

export const approveLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { loan_id: string }) => z.object({ loan_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: staff } = await supabase.from("staff").select("id, branch_id, role").eq("user_id", context.userId).maybeSingle();
    if (!staff) throw new Error("No staff profile");
    if (!["admin", "branch_manager"].includes(staff.role as string)) {
      throw new Error("Only branch managers or admins can approve and disburse loans");
    }
    const { data: loan } = await supabase
      .from("loan")
      .select("id, principal, term_months, annual_rate_pct, frequency, branch_id, status, product_id, schedule_type, schedule_overrides")
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

    const isStructured = loan.schedule_type === "structured" && loan.schedule_overrides;
    const overridesRaw = (loan.schedule_overrides ?? {}) as Record<string, number>;
    const overrides: Record<number, number> = {};
    for (const k of Object.keys(overridesRaw)) overrides[Number(k)] = Number(overridesRaw[k]);

    const schedule = isStructured
      ? generateStructuredSchedule({
          principal: Number(loan.principal),
          annualRatePct: Number(loan.annual_rate_pct),
          termMonths: loan.term_months,
          frequency: loan.frequency as Frequency,
          overrides,
        })
      : generateSchedule({
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
      is_manual: !!r.isManual,
    }));
    if (rows.length) await supabase.from("loan_installment").insert(rows);

    // Journal entry: DR Loans receivable / CR Cash — routed through the ledger kernel (post_entry)
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
    const { error: postErr } = await supabase.rpc("post_entry", {
      _entry_date: now.slice(0, 10),
      _reference: ref,
      _description: `Loan disbursement ${ref}`,
      _lines: [
        { account_id: arId, debit: Number(loan.principal), credit: 0 },
        { account_id: cashId, debit: 0, credit: Number(loan.principal) },
      ] as any,
      _branch_id: loan.branch_id,
      _source_module: "loans",
      _source_ref: loan.id,
      _idempotency_key: `loans:disburse:${loan.id}`,
      _loan_id: loan.id,
    });
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
    const idem = `loans:repay:${loan.id}:${ref}`;
    const { data: entryId, error: rpcErr } = await supabase.rpc("post_entry", {
      _entry_date: new Date().toISOString().slice(0, 10),
      _reference: ref,
      _description: `Repayment ${ref} · ${data.channel}`,
      _lines: [
        { account_id: cashId, debit: data.amount, credit: 0 },
        { account_id: arId, debit: 0, credit: principalPortion },
        { account_id: incomeId, debit: 0, credit: interestPortion },
      ] as any,
      _branch_id: loan.branch_id,
      _source_module: "loans",
      _source_ref: loan.id,
      _idempotency_key: idem,
      _loan_id: loan.id,
    });
    if (rpcErr) throw rpcErr;
    const { error: rErr } = await supabase.from("repayment").insert({
      loan_id: loan.id,
      entry_id: entryId as unknown as string,
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
    const today = serverToday();
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
      termination_fee?: number;
      termination_fee_pct?: number;
      color?: string;
      principal_account_id?: string | null;
      cash_account_id?: string | null;
      interest_income_account_id?: string | null;
      fee_income_account_id?: string | null;
      required_documents?: string[];
      segment?: "micro" | "sme" | "leasing" | "housing" | "society" | "cashback" | "gold";
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
          termination_fee: z.number().nonnegative().max(10_000_000).optional(),
          termination_fee_pct: z.number().nonnegative().max(100).optional(),
          color: z.string().max(20).optional(),
          principal_account_id: z.string().uuid().nullable().optional(),
          cash_account_id: z.string().uuid().nullable().optional(),
          interest_income_account_id: z.string().uuid().nullable().optional(),
          fee_income_account_id: z.string().uuid().nullable().optional(),
          required_documents: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
          segment: z.enum(["micro", "sme", "leasing", "housing", "society", "cashback", "gold"]).optional(),
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
        termination_fee: data.termination_fee ?? 0,
        termination_fee_pct: data.termination_fee_pct ?? 0,
        color: data.color ?? "#0f766e",
        is_active: true,
        principal_account_id: data.principal_account_id ?? null,
        cash_account_id: data.cash_account_id ?? null,
        interest_income_account_id: data.interest_income_account_id ?? null,
        fee_income_account_id: data.fee_income_account_id ?? null,
        required_documents: data.required_documents ?? [],
        segment: data.segment ?? "micro",
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

export const updateLoanProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      id: string;
      name: string;
      annual_rate_pct: number;
      max_annual_rate_pct?: number | null;
      min_term_months: number;
      max_term_months: number;
      min_principal: number;
      max_principal?: number | null;
      frequency: "daily" | "weekly" | "biweekly" | "monthly";
      interest_method?: "flat" | "declining_balance";
      processing_fee_pct?: number;
      termination_fee?: number;
      termination_fee_pct?: number;
      principal_account_id?: string | null;
      cash_account_id?: string | null;
      interest_income_account_id?: string | null;
      fee_income_account_id?: string | null;
      required_documents?: string[];
      segment?: "micro" | "sme" | "leasing" | "housing" | "society" | "cashback" | "gold";
    }) =>

      z
        .object({
          id: z.string().uuid(),
          name: z.string().trim().min(2).max(80),
          annual_rate_pct: z.number().positive().max(200),
          max_annual_rate_pct: z.number().positive().max(200).nullable().optional(),
          min_term_months: z.number().int().positive().max(120),
          max_term_months: z.number().int().positive().max(120),
          min_principal: z.number().nonnegative(),
          max_principal: z.number().positive().nullable().optional(),
          frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]),
          interest_method: z.enum(["flat", "declining_balance"]).optional(),
          processing_fee_pct: z.number().nonnegative().max(50).optional(),
          termination_fee: z.number().nonnegative().max(10_000_000).optional(),
          termination_fee_pct: z.number().nonnegative().max(100).optional(),
          principal_account_id: z.string().uuid().nullable().optional(),
          cash_account_id: z.string().uuid().nullable().optional(),
          interest_income_account_id: z.string().uuid().nullable().optional(),
          fee_income_account_id: z.string().uuid().nullable().optional(),
          required_documents: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
          segment: z.enum(["micro", "sme", "leasing", "housing", "society", "cashback", "gold"]).optional(),
        })

        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can edit loan products");
    const { error } = await supabase
      .from("loan_product")
      .update({
        name: data.name,
        annual_rate_pct: data.annual_rate_pct,
        min_term_months: data.min_term_months,
        max_term_months: data.max_term_months,
        min_principal: data.min_principal,
        max_principal: data.max_principal ?? null,
        frequency: data.frequency,
        interest_method: data.interest_method ?? "flat",
        processing_fee_pct: data.processing_fee_pct ?? 0,
        termination_fee: data.termination_fee ?? 0,
        termination_fee_pct: data.termination_fee_pct ?? 0,
        principal_account_id: data.principal_account_id ?? null,
        cash_account_id: data.cash_account_id ?? null,
        interest_income_account_id: data.interest_income_account_id ?? null,
        fee_income_account_id: data.fee_income_account_id ?? null,
        required_documents: data.required_documents ?? [],
        ...(data.segment ? { segment: data.segment } : {}),
      } as never)
      .eq("id", data.id);

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
      subcategory?: string | null;
      branch_ids?: string[] | null;
    }) =>
      z
        .object({
          code: z.string().trim().min(1).max(20),
          name: z.string().trim().min(2).max(120),
          type: z.enum(["asset", "liability", "equity", "income", "expense"]),
          normal_balance: z.union([z.literal(1), z.literal(-1)]),
          subcategory: z.string().trim().max(80).nullable().optional(),
          branch_ids: z.array(z.string().uuid()).nullable().optional(),
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
        subcategory: data.subcategory || null,
        branch_ids: data.branch_ids && data.branch_ids.length > 0 ? data.branch_ids : null,
      } as never)
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

export const updateGlAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      id: string;
      code: string;
      name: string;
      type: "asset" | "liability" | "equity" | "income" | "expense";
      normal_balance: 1 | -1;
      subcategory?: string | null;
      branch_ids?: string[] | null;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          code: z.string().trim().min(1).max(20),
          name: z.string().trim().min(2).max(120),
          type: z.enum(["asset", "liability", "equity", "income", "expense"]),
          normal_balance: z.union([z.literal(1), z.literal(-1)]),
          subcategory: z.string().trim().max(80).nullable().optional(),
          branch_ids: z.array(z.string().uuid()).nullable().optional(),
        })
        .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can modify GL accounts");
    const { error } = await supabase
      .from("gl_account")
      .update({
        code: data.code,
        name: data.name,
        type: data.type,
        normal_balance: data.normal_balance,
        subcategory: data.subcategory || null,
        branch_ids: data.branch_ids && data.branch_ids.length > 0 ? data.branch_ids : null,
      } as never)
      .eq("id", data.id);
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

export const getPendingDisbursements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("loan")
      .select("id, principal, term_months, annual_rate_pct, frequency, submitted_at, approved_at, status, client:client_id(id, full_name, avatar_color), product:product_id(name), branch:branch_id(id, name, code)")
      .in("status", ["submitted", "approved"])
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createDebitNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      loan_id: string;
      amount: number;
      charge_type: "fee" | "penalty" | "insurance" | "legal" | "other";
      entry_date?: string;
      reference?: string;
      description?: string;
    }) =>
      z
        .object({
          loan_id: z.string().uuid(),
          amount: z.number().positive(),
          charge_type: z.enum(["fee", "penalty", "insurance", "legal", "other"]),
          entry_date: z.string().optional(),
          reference: z.string().trim().max(60).optional(),
          description: z.string().trim().max(300).optional(),
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
      .select("id, branch_id, product_id, status")
      .eq("id", data.loan_id)
      .maybeSingle();
    if (!loan) throw new Error("Loan not found");
    if (!["disbursed", "active"].includes(loan.status as string))
      throw new Error("Debit notes can only be added to disbursed / active facilities");

    // Resolve GL accounts: Dr principal AR, Cr fee income
    const { data: product } = await supabase
      .from("loan_product")
      .select("principal_account_id, fee_income_account_id, interest_income_account_id")
      .eq("id", loan.product_id)
      .maybeSingle<{
        principal_account_id: string | null;
        fee_income_account_id: string | null;
        interest_income_account_id: string | null;
      }>();
    let arId = product?.principal_account_id ?? null;
    let incomeId = product?.fee_income_account_id ?? product?.interest_income_account_id ?? null;
    if (!arId || !incomeId) {
      const { data: accts } = await supabase
        .from("gl_account")
        .select("id, code")
        .in("code", ["1100", "4100", "4000"]);
      arId = arId ?? accts?.find((a) => a.code === "1100")?.id ?? null;
      incomeId =
        incomeId ??
        accts?.find((a) => a.code === "4100")?.id ??
        accts?.find((a) => a.code === "4000")?.id ??
        null;
    }
    if (!arId || !incomeId)
      throw new Error("Chart of accounts missing — configure principal & fee income accounts");

    const ref = data.reference?.trim() || "DN-" + Math.floor(1000 + Math.random() * 9000);
    const entryDate = (data.entry_date || serverToday()).slice(0, 10);
    const label =
      { fee: "Fee", penalty: "Penalty", insurance: "Insurance", legal: "Legal cost", other: "Charge" }[
        data.charge_type
      ] || "Charge";

    const { data: entry, error: eErr } = await supabase
      .from("journal_entry")
      .insert({
        reference: ref,
        branch_id: loan.branch_id,
        loan_id: loan.id,
        posted_by: staff.id,
        entry_date: entryDate,
        description: `Debit note ${ref} · ${label}${data.description ? " · " + data.description : ""}`,
      })
      .select()
      .single();
    if (eErr) throw eErr;

    const { error: pErr } = await supabase.from("posting").insert([
      { entry_id: entry.id, account_id: arId, debit: data.amount, credit: 0 },
      { entry_id: entry.id, account_id: incomeId, debit: 0, credit: data.amount },
    ]);
    if (pErr) throw pErr;

    // Bump the next unpaid installment's principal_due so outstanding balance reflects the charge.
    const { data: inst } = await supabase
      .from("loan_installment")
      .select("id, principal_due")
      .eq("loan_id", loan.id)
      .in("state", ["upcoming", "due", "partial", "overdue"])
      .order("seq")
      .limit(1)
      .maybeSingle();
    if (inst) {
      await supabase
        .from("loan_installment")
        .update({ principal_due: Number(inst.principal_due) + data.amount })
        .eq("id", inst.id);
    }

    return { ok: true, reference: ref, entry_id: entry.id };
  });

// ─────────────────────────────────────────────────────────────────────────────
// FACILITY TERMINATION
// ─────────────────────────────────────────────────────────────────────────────

export const getFacilityTerminationQuote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { loan_id: string }) =>
    z.object({ loan_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: loan } = await supabase
      .from("loan")
      .select(
        "id, principal, status, disbursed_at, client:client_id(id, full_name), product:product_id(id, name, termination_fee, termination_fee_pct)",
      )
      .eq("id", data.loan_id)
      .maybeSingle<any>();
    if (!loan) throw new Error("Loan not found");

    const { data: outRow } = await supabase
      .from("v_loan_outstanding")
      .select("outstanding_principal, principal_repaid")
      .eq("loan_id", data.loan_id)
      .maybeSingle<{ outstanding_principal: number | null; principal_repaid: number | null }>();

    const { data: insts } = await supabase
      .from("loan_installment")
      .select("interest_due, interest_paid, fee_due, fee_paid, state")
      .eq("loan_id", data.loan_id);

    const outstanding = Number(outRow?.outstanding_principal ?? loan.principal ?? 0);
    const interestUnpaid = (insts ?? []).reduce(
      (s, r: any) =>
        s + Math.max(0, Number(r.interest_due ?? 0) - Number(r.interest_paid ?? 0)),
      0,
    );
    const feesUnpaid = (insts ?? []).reduce(
      (s, r: any) => s + Math.max(0, Number(r.fee_due ?? 0) - Number(r.fee_paid ?? 0)),
      0,
    );
    const flatFee = Number(loan.product?.termination_fee ?? 0);
    const pctFee = (outstanding * Number(loan.product?.termination_fee_pct ?? 0)) / 100;
    const terminationFee = Math.round((flatFee + pctFee) * 100) / 100;
    const settlement =
      Math.round((outstanding + interestUnpaid + feesUnpaid + terminationFee) * 100) / 100;

    return {
      loan_id: loan.id,
      status: loan.status,
      client: loan.client,
      product: loan.product,
      principal: Number(loan.principal),
      outstanding_principal: outstanding,
      interest_unpaid: Math.round(interestUnpaid * 100) / 100,
      fees_unpaid: Math.round(feesUnpaid * 100) / 100,
      termination_fee_flat: flatFee,
      termination_fee_pct: Number(loan.product?.termination_fee_pct ?? 0),
      termination_fee: terminationFee,
      settlement_amount: settlement,
    };
  });

export const createFacilityTermination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      loan_id: string;
      amount_paid: number;
      channel?: "cash" | "mpesa" | "bank" | "internal";
      entry_date?: string;
      reference?: string;
      reason?: string;
    }) =>
      z
        .object({
          loan_id: z.string().uuid(),
          amount_paid: z.number().nonnegative().max(100_000_000),
          channel: z.enum(["cash", "mpesa", "bank", "internal"]).optional(),
          entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          reference: z.string().trim().max(60).optional(),
          reason: z.string().trim().max(300).optional(),
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
      .select("id, branch_id, product_id, status, principal")
      .eq("id", data.loan_id)
      .maybeSingle();
    if (!loan) throw new Error("Loan not found");
    if (!["disbursed", "active"].includes(loan.status as string))
      throw new Error("Only disbursed / active facilities can be terminated");

    // Recompute the termination quote server-side (never trust client math).
    const { data: product } = await supabase
      .from("loan_product")
      .select(
        "termination_fee, termination_fee_pct, principal_account_id, cash_account_id, interest_income_account_id, fee_income_account_id",
      )
      .eq("id", loan.product_id)
      .maybeSingle<any>();

    const { data: outRow } = await supabase
      .from("v_loan_outstanding")
      .select("outstanding_principal")
      .eq("loan_id", data.loan_id)
      .maybeSingle<{ outstanding_principal: number | null }>();
    const { data: insts } = await supabase
      .from("loan_installment")
      .select("id, interest_due, interest_paid, fee_due, fee_paid, state, seq")
      .eq("loan_id", data.loan_id)
      .order("seq");

    const outstanding = Number(outRow?.outstanding_principal ?? loan.principal ?? 0);
    const interestUnpaid = (insts ?? []).reduce(
      (s, r: any) => s + Math.max(0, Number(r.interest_due ?? 0) - Number(r.interest_paid ?? 0)),
      0,
    );
    const feesUnpaid = (insts ?? []).reduce(
      (s, r: any) => s + Math.max(0, Number(r.fee_due ?? 0) - Number(r.fee_paid ?? 0)),
      0,
    );
    const flatFee = Number(product?.termination_fee ?? 0);
    const pctFee = (outstanding * Number(product?.termination_fee_pct ?? 0)) / 100;
    const terminationFee = Math.round((flatFee + pctFee) * 100) / 100;
    const settlement =
      Math.round((outstanding + interestUnpaid + feesUnpaid + terminationFee) * 100) / 100;

    // Resolve GL accounts.
    let cashId = product?.cash_account_id ?? null;
    let arId = product?.principal_account_id ?? null;
    let intId = product?.interest_income_account_id ?? null;
    let feeId = product?.fee_income_account_id ?? intId ?? null;
    if (!cashId || !arId || !intId || !feeId) {
      const { data: accts } = await supabase
        .from("gl_account")
        .select("id, code")
        .in("code", ["1000", "1100", "4000", "4100"]);
      cashId = cashId ?? accts?.find((a) => a.code === "1000")?.id ?? null;
      arId = arId ?? accts?.find((a) => a.code === "1100")?.id ?? null;
      intId = intId ?? accts?.find((a) => a.code === "4000")?.id ?? null;
      feeId =
        feeId ??
        accts?.find((a) => a.code === "4100")?.id ??
        accts?.find((a) => a.code === "4000")?.id ??
        null;
    }
    if (!cashId || !arId || !intId || !feeId)
      throw new Error("Chart of accounts missing — configure cash, receivable, interest & fee income");

    const ref = data.reference?.trim() || "TERM-" + Math.floor(1000 + Math.random() * 9000);
    const entryDate = (data.entry_date || serverToday()).slice(0, 10);
    const amount = data.amount_paid;

    const { data: entry, error: eErr } = await supabase
      .from("journal_entry")
      .insert({
        reference: ref,
        branch_id: loan.branch_id,
        loan_id: loan.id,
        posted_by: staff.id,
        entry_date: entryDate,
        description: `Facility termination ${ref}${data.reason ? " · " + data.reason : ""}`,
      })
      .select()
      .single();
    if (eErr) throw eErr;

    // Split the payment across principal, interest, and the termination fee.
    const payInterest = Math.min(interestUnpaid, Math.max(0, amount));
    const remainingAfterInt = Math.max(0, amount - payInterest);
    const payTermFee = Math.min(terminationFee, remainingAfterInt);
    const remainingAfterFee = Math.max(0, remainingAfterInt - payTermFee);
    const payPrincipal = Math.min(outstanding, remainingAfterFee);

    const postings: any[] = [{ entry_id: entry.id, account_id: cashId, debit: amount, credit: 0 }];
    if (payInterest > 0)
      postings.push({ entry_id: entry.id, account_id: intId, debit: 0, credit: payInterest });
    if (payTermFee > 0)
      postings.push({ entry_id: entry.id, account_id: feeId, debit: 0, credit: payTermFee });
    if (payPrincipal > 0)
      postings.push({ entry_id: entry.id, account_id: arId, debit: 0, credit: payPrincipal });

    // Balance any rounding gap into the fee-income account.
    const sumD = postings.reduce((s, p) => s + Number(p.debit || 0), 0);
    const sumC = postings.reduce((s, p) => s + Number(p.credit || 0), 0);
    const diff = Math.round((sumD - sumC) * 100) / 100;
    if (Math.abs(diff) > 0.001) {
      postings.push({
        entry_id: entry.id,
        account_id: feeId,
        debit: diff < 0 ? -diff : 0,
        credit: diff > 0 ? diff : 0,
      });
    }

    const { error: pErr } = await supabase.from("posting").insert(postings);
    if (pErr) throw pErr;

    // Record repayment for the reporting layer.
    await supabase.from("repayment").insert({
      loan_id: loan.id,
      amount,
      channel: data.channel ?? "cash",
      received_by: staff.id,
      reference: ref,
    } as never);

    // Mark all remaining installments waived/paid and close the loan.
    await supabase
      .from("loan_installment")
      .update({ state: "paid" })
      .eq("loan_id", loan.id)
      .in("state", ["upcoming", "due", "partial", "overdue"]);

    await supabase
      .from("loan")
      .update({ status: "closed", closed_at: serverNow().toISOString() })
      .eq("id", loan.id);

    return {
      ok: true,
      reference: ref,
      entry_id: entry.id,
      settlement_amount: settlement,
      applied: {
        interest: payInterest,
        termination_fee: payTermFee,
        principal: payPrincipal,
      },
      shortfall: Math.max(0, Math.round((settlement - amount) * 100) / 100),
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// SUB-LEDGER vs GL RECONCILIATION
// ─────────────────────────────────────────────────────────────────────────────
//
// Compares the balance of each GL control account (from `posting`) to the
// summed balances of the underlying sub-ledger tables as of a chosen date.
// Any non-zero difference is a break the accounting team must investigate.
//
// Control-account map (hard-coded to this project's chart of accounts):
//   1100 Loans receivable       ↔ loan / repayment sub-ledger
//   2000 Customer Savings       ↔ savings_transaction sub-ledger
//   2200 Fixed Deposit          ↔ fd_transaction sub-ledger (if the
//                                  account exists in the COA)

const SAVINGS_POSITIVE = new Set(["deposit", "interest", "opening", "adjustment"]);
const SAVINGS_NEGATIVE = new Set(["withdrawal", "fee", "closure"]);
const FD_POSITIVE = new Set(["deposit_receipt", "opening", "renewal"]);
const FD_NEGATIVE = new Set(["withdrawal", "premature_closure", "maturity_payout"]);

export const getSubledgerReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { asOf?: string; fromDate?: string }) =>
    z
      .object({
        asOf: z.string().optional(),
        fromDate: z.string().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const asOf = data.asOf && data.asOf.length ? data.asOf : serverToday();
    const fromDate = data.fromDate && data.fromDate.length ? data.fromDate : null;

    // 1. GL side — pull postings joined to journal_entry so we can filter by entry_date
    const { data: accounts } = await supabase
      .from("gl_account")
      .select("id, code, name, type, normal_balance");

    const codeMap = new Map<string, { id: string; code: string; name: string; normal: number }>();
    for (const a of accounts ?? []) {
      codeMap.set(a.code, {
        id: a.id as string,
        code: a.code as string,
        name: a.name as string,
        normal: Number(a.normal_balance),
      });
    }

    const targetCodes = ["1100", "2000", "2200"].filter((c) => codeMap.has(c));
    const targetIds = targetCodes.map((c) => codeMap.get(c)!.id);

    // Postings joined with journal_entry.entry_date — filter server-side by date range
    let postingsQ = supabase
      .from("posting")
      .select("account_id, debit, credit, entry:entry_id!inner(entry_date)")
      .in("account_id", targetIds)
      .lte("entry.entry_date", asOf);
    if (fromDate) postingsQ = postingsQ.gte("entry.entry_date", fromDate);
    const { data: postings } = await postingsQ;

    const glBalance = new Map<string, number>();
    for (const p of (postings ?? []) as any[]) {
      const acc = accounts?.find((a) => a.id === p.account_id);
      if (!acc) continue;
      const net = Number(p.debit ?? 0) - Number(p.credit ?? 0);
      const signed = Number(acc.normal_balance) === 1 ? net : -net;
      glBalance.set(p.account_id, (glBalance.get(p.account_id) ?? 0) + signed);
    }

    // 2. Savings sub-ledger — signed sum of savings_transaction
    let savingsQ = supabase
      .from("savings_transaction")
      .select("txn_type, amount")
      .lte("txn_date", asOf);
    if (fromDate) savingsQ = savingsQ.gte("txn_date", fromDate);
    const { data: sTxns } = await savingsQ;
    let savingsSub = 0;
    for (const t of sTxns ?? []) {
      const amt = Number(t.amount);
      if (SAVINGS_POSITIVE.has(t.txn_type as string)) savingsSub += amt;
      else if (SAVINGS_NEGATIVE.has(t.txn_type as string)) savingsSub -= amt;
    }

    // 3. FD sub-ledger — signed sum of fd_transaction
    let fdQ = supabase.from("fd_transaction").select("type, amount").lte("txn_date", asOf);
    if (fromDate) fdQ = fdQ.gte("txn_date", fromDate);
    const { data: fTxns } = await fdQ;
    let fdSub = 0;
    for (const t of fTxns ?? []) {
      const amt = Number(t.amount);
      if (FD_POSITIVE.has(t.type as string)) fdSub += amt;
      else if (FD_NEGATIVE.has(t.type as string)) fdSub -= amt;
    }

    // 4. Loans sub-ledger — principal outstanding
    // v_loan_outstanding is a live view (as-of today). For historical asOf
    // dates we fall back to disbursed principal minus repayments booked in
    // the window, which will differ from the GL by the interest portion —
    // surfaced as a "note" so users don't misread the break.
    const today = serverToday();
    let loansSub = 0;
    let loansNote: string | null = null;
    if (asOf >= today && !fromDate) {
      const { data: outs } = await supabase
        .from("v_loan_outstanding")
        .select("outstanding_principal");
      loansSub = (outs ?? []).reduce((s, r) => s + Number(r.outstanding_principal ?? 0), 0);
    } else {
      let disbQ = supabase
        .from("loan")
        .select("principal, disbursed_at")
        .not("disbursed_at", "is", null)
        .lte("disbursed_at", `${asOf}T23:59:59Z`);
      if (fromDate) disbQ = disbQ.gte("disbursed_at", `${fromDate}T00:00:00Z`);
      const { data: disbs } = await disbQ;
      const disbTotal = (disbs ?? []).reduce((s, r) => s + Number(r.principal ?? 0), 0);

      let repayQ = supabase
        .from("repayment")
        .select("amount, received_at")
        .lte("received_at", `${asOf}T23:59:59Z`);
      if (fromDate) repayQ = repayQ.gte("received_at", `${fromDate}T00:00:00Z`);
      const { data: reps } = await repayQ;
      const repayTotal = (reps ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

      loansSub = disbTotal - repayTotal;
      loansNote =
        "Approximation: repayments include interest, so this may differ from the GL by the period interest income.";
    }

    type Row = {
      code: string;
      name: string;
      subledger: string;
      gl_balance: number;
      subledger_balance: number;
      difference: number;
      status: "match" | "break";
      note: string | null;
    };

    const rows: Row[] = [];

    const push = (code: string, subledgerLabel: string, subValue: number, note: string | null) => {
      const acc = codeMap.get(code);
      if (!acc) return;
      const gl = glBalance.get(acc.id) ?? 0;
      const diff = Math.round((gl - subValue) * 100) / 100;
      rows.push({
        code: acc.code,
        name: acc.name,
        subledger: subledgerLabel,
        gl_balance: Math.round(gl * 100) / 100,
        subledger_balance: Math.round(subValue * 100) / 100,
        difference: diff,
        status: Math.abs(diff) < 0.01 ? "match" : "break",
        note,
      });
    };

    push("1100", "Loan sub-ledger", loansSub, loansNote);
    push("2000", "Savings sub-ledger", savingsSub, null);
    push("2200", "FD sub-ledger", fdSub, null);

    const breaks = rows.filter((r) => r.status === "break").length;
    return {
      asOf,
      fromDate,
      rows,
      totals: {
        totalGl: rows.reduce((s, r) => s + r.gl_balance, 0),
        totalSub: rows.reduce((s, r) => s + r.subledger_balance, 0),
        totalDiff: rows.reduce((s, r) => s + r.difference, 0),
        breaks,
        checked: rows.length,
      },
    };
  });
