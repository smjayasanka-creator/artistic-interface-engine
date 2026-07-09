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
      .select("id, full_name, phone, status, risk_grade, avatar_color, group:group_id(id, name)")
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

export const getAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: branch } = await supabase.from("branch").select("*").order("created_at").limit(1).maybeSingle();
    const { data: staff } = await supabase.from("staff").select("id, full_name, role, email, is_active").order("full_name");
    const { count: activeClients } = await supabase
      .from("client")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    const { data: outs } = await supabase.from("v_loan_outstanding").select("outstanding_principal");
    const portfolio = (outs ?? []).reduce((s, r) => s + Number(r.outstanding_principal ?? 0), 0);
    return {
      branch,
      staff: staff ?? [],
      activeClients: activeClients ?? 0,
      portfolio,
    };
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
      z
        .object({
          full_name: z.string().trim().min(2, "Full name is required").max(120),
          phone: z.string().trim().min(7, "Phone is required").max(20),
          national_id: z.string().trim().min(4, "National ID is required").max(30),
          date_of_birth: z.string().min(1, "Date of birth is required"),
          gender: z.enum(["male", "female", "other"]),
          address: z.string().trim().min(3, "Address is required").max(200),
          occupation: z.string().trim().min(2, "Occupation is required").max(80),
          monthly_income: z.number().nonnegative("Monthly income must be 0 or more"),
          next_of_kin_name: z.string().trim().min(2, "Next of kin name is required").max(120),
          next_of_kin_phone: z.string().trim().min(7, "Next of kin phone is required").max(20),
          email: z.string().trim().email().max(255).optional().or(z.literal("")),
          group_id: z.string().uuid().nullable().optional(),
        })
        .parse(i),
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
    (i: { client_id: string; product_id: string; principal: number; term_months: number; purpose?: string }) =>
      z
        .object({
          client_id: z.string().uuid(),
          product_id: z.string().uuid(),
          principal: z.number().positive(),
          term_months: z.number().int().positive(),
          purpose: z.string().optional(),
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
        annual_rate_pct: product.annual_rate_pct,
        frequency: product.frequency,
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
      .select("id, principal, term_months, annual_rate_pct, frequency, branch_id, status")
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

    // Journal entry: DR Loans receivable / CR Cash
    const { data: accts } = await supabase.from("gl_account").select("id, code").in("code", ["1100", "1000"]);
    const arId = accts?.find((a) => a.code === "1100")?.id;
    const cashId = accts?.find((a) => a.code === "1000")?.id;
    if (!arId || !cashId) throw new Error("Chart of accounts missing");
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
      .select("id, principal, branch_id, annual_rate_pct, term_months")
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

    const { data: accts } = await supabase.from("gl_account").select("id, code").in("code", ["1000", "1100", "4000"]);
    const cashId = accts?.find((a) => a.code === "1000")?.id;
    const arId = accts?.find((a) => a.code === "1100")?.id;
    const incomeId = accts?.find((a) => a.code === "4000")?.id;
    if (!cashId || !arId || !incomeId) throw new Error("Chart of accounts missing");
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
      })
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
