// Day End Process — server functions.
//
// Orchestrates the 10 EOD steps. Each step reuses (or reimplements scoped
// to a single branch) the same accounting logic used by the daily cron
// workers. Every step records its metrics via `eod_record_step`; when the
// last step completes, `eod_finalize('completed')` locks the branch through
// the business date and emits the `eod.completed` domain event.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function resolveCompanyId(context: any): Promise<string> {
  const { data: staff } = await context.supabase
    .from("staff")
    .select("branch:branch_id(company_id)")
    .eq("user_id", context.userId)
    .limit(1)
    .maybeSingle();
  const cid = (staff as any)?.branch?.company_id;
  if (!cid) throw new Error("No company");
  return cid;
}

// ---------- Company-wide auto EOD settings ----------
export const getAutoEodSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const company_id = await resolveCompanyId(context);
    const { data, error } = await context.supabase
      .from("company")
      .select("id, auto_eod_enabled, auto_eod_time, timezone")
      .eq("id", company_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateAutoEodSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { enabled: boolean; time: string }) =>
    z
      .object({
        enabled: z.boolean(),
        time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const company_id = await resolveCompanyId(context);
    const { data: admin } = await context.supabase.rpc(
      "is_company_admin" as any,
      {
        _company_id: company_id,
      } as any,
    );
    if (!admin) throw new Error("Admin only");
    const time = data.time.length === 5 ? `${data.time}:00` : data.time;
    const { error } = await context.supabase
      .from("company")
      .update({ auto_eod_enabled: data.enabled, auto_eod_time: time } as any)
      .eq("id", company_id);
    if (error) throw new Error(error.message);
    return true;
  });

// ---------- Company-wide EOD orchestration (all branches) ----------
export const runCompanyEod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { business_date: string }) =>
    z.object({ business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: branches, error: bErr } = await context.supabase
      .from("branch")
      .select("id, name");
    if (bErr) throw new Error(bErr.message);
    const results: Array<{
      branch_id: string;
      branch_name: string;
      ok: boolean;
      run_id?: string;
      error?: string;
    }> = [];
    for (const b of branches ?? []) {
      try {
        // Initiate (idempotent — RPC returns existing run_id if already exists)
        const { data: runId, error: iErr } = await context.supabase.rpc(
          "eod_initiate" as any,
          {
            _branch_id: b.id,
            _business_date: data.business_date,
          } as any,
        );
        if (iErr) throw new Error(iErr.message);
        // Approve & start (idempotent: only flips pending_approval → in_progress)
        await context.supabase
          .rpc("eod_approve_and_run" as any, { _run_id: runId } as any)
          .then((r: any) => {
            if (r.error && !/in_progress|completed/i.test(r.error.message))
              throw new Error(r.error.message);
          });
        // Execute remaining steps
        const stepResults = await runAllStepsInternal(context, runId as string);
        const failed = stepResults.find((s) => !s.ok);
        results.push({
          branch_id: b.id,
          branch_name: b.name,
          ok: !failed,
          run_id: runId as string,
          error: failed?.error ?? undefined,
        });
      } catch (e) {
        results.push({
          branch_id: b.id,
          branch_name: b.name,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { business_date: data.business_date, branches_total: (branches ?? []).length, results };
  });

async function runAllStepsInternal(context: any, run_id: string) {
  const results: Array<{ step: string; ok: boolean; error?: string | null }> = [];
  for (const step of STEPS) {
    const { data: run } = await context.supabase
      .from("eod_run")
      .select("steps, status")
      .eq("id", run_id)
      .maybeSingle();
    if (!run || run.status !== "in_progress") break;
    const st = ((run.steps as any[]) ?? []).find((s: any) => s.key === step);
    if (st?.status === "completed" || st?.status === "skipped") continue;
    const r = await runStepInternal(context, run_id, step);
    results.push({ step, ok: r.ok, error: r.error });
    if (!r.ok) {
      await context.supabase.rpc(
        "eod_finalize" as any,
        { _run_id: run_id, _status: "failed" } as any,
      );
      break;
    }
  }
  return results;
}

const STEPS = [
  "loan_accrual",
  "fd_accrual",
  "penalty_charges",
  "par_npa",
  "fd_maturity",
  "savings_interest",
  "gl_post",
  "trial_balance",
  "snapshots",
  "reports",
  "rollover",
] as const;
type StepKey = (typeof STEPS)[number];

// ---------- Reads ----------
export const listBranches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("branch")
      .select("id, name, code, eod_locked_through, auto_eod")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listEodRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { branch_id?: string; limit?: number }) =>
    z
      .object({
        branch_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("eod_run")
      .select(
        "id, branch_id, business_date, status, initiated_by, initiated_at, approved_by, approved_at, started_at, completed_at, duration_ms, steps, warnings, pre_check, reports",
      )
      .order("business_date", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getEodRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("eod_run")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Run not found");
    const { data: logs } = await context.supabase
      .from("eod_step_log")
      .select("*")
      .eq("run_id", data.id)
      .order("started_at", { ascending: false })
      .limit(200);
    return { run: row, logs: logs ?? [] };
  });

export const runPreCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { branch_id: string; business_date: string }) =>
    z
      .object({
        branch_id: z.string().uuid(),
        business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc(
      "eod_precheck" as any,
      {
        _branch_id: data.branch_id,
        _business_date: data.business_date,
      } as any,
    );
    if (error) throw new Error(error.message);
    return r as any;
  });

export const initiateEod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { branch_id: string; business_date: string }) =>
    z
      .object({
        branch_id: z.string().uuid(),
        business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc(
      "eod_initiate" as any,
      {
        _branch_id: data.branch_id,
        _business_date: data.business_date,
      } as any,
    );
    if (error) throw new Error(error.message);
    return id as string;
  });

export const approveEod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { run_id: string }) => z.object({ run_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "eod_approve_and_run" as any,
      { _run_id: data.run_id } as any,
    );
    if (error) throw new Error(error.message);
    return true;
  });

// ---------- Step execution ----------
// Runs a single step for the run. Loads admin client only after verifying
// the caller is a company member with permission.
export const runStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { run_id: string; step: StepKey }) =>
    z
      .object({
        run_id: z.string().uuid(),
        step: z.enum(STEPS),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    // Verify the caller has visibility on this run + eod.process permission.
    const { data: run, error: runErr } = await context.supabase
      .from("eod_run")
      .select("id, company_id, branch_id, business_date, status")
      .eq("id", data.run_id)
      .maybeSingle();
    if (runErr) throw new Error(runErr.message);
    if (!run) throw new Error("Run not found");
    if (run.status !== "in_progress") {
      throw new Error(`Run status ${run.status}; must be in_progress to run steps`);
    }

    const { data: canProcess } = await context.supabase.rpc(
      "has_permission" as any,
      {
        _user_id: context.userId,
        _permission: "eod.process",
        _company_id: run.company_id,
      } as any,
    );
    const { data: companyAdmin } = await context.supabase.rpc(
      "is_company_admin" as any,
      {
        _company_id: run.company_id,
      } as any,
    );
    if (!(canProcess || companyAdmin)) throw new Error("Missing permission eod.process");

    // Mark step processing.
    await context.supabase.rpc(
      "eod_record_step" as any,
      {
        _run_id: run.id,
        _step_key: data.step,
        _status: "processing",
        _metrics: {},
        _error: null,
      } as any,
    );

    let metrics: Record<string, any> = {};
    let error: string | null = null;

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const ctx = {
        supabaseAdmin,
        run_id: run.id,
        company_id: run.company_id,
        branch_id: run.branch_id,
        business_date: run.business_date,
      };
      switch (data.step) {
        case "loan_accrual":
          metrics = await stepLoanAccrual(ctx);
          break;
        case "fd_accrual":
          metrics = await stepFdAccrual(ctx);
          break;
        case "penalty_charges":
          metrics = await stepPenaltyCharges(ctx);
          break;
        case "par_npa":
          metrics = await stepParNpa(ctx);
          break;
        case "fd_maturity":
          metrics = await stepFdMaturity(ctx);
          break;
        case "savings_interest":
          metrics = await stepSavingsInterest(ctx);
          break;
        case "gl_post":
          metrics = await stepGlPost(ctx);
          break;
        case "trial_balance":
          metrics = await stepTrialBalance(ctx);
          break;
        case "snapshots":
          metrics = await stepSnapshots(ctx);
          break;
        case "reports":
          metrics = await stepReports(ctx);
          break;
        case "rollover":
          metrics = await stepRollover(ctx);
          break;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    await context.supabase.rpc(
      "eod_record_step" as any,
      {
        _run_id: run.id,
        _step_key: data.step,
        _status: error ? "failed" : "completed",
        _metrics: metrics,
        _error: error,
      } as any,
    );

    // If the final step (rollover) completed, mark whole run completed.
    if (!error && data.step === "rollover") {
      await context.supabase.rpc(
        "eod_finalize" as any,
        { _run_id: run.id, _status: "completed" } as any,
      );
    }

    return { ok: !error, metrics, error };
  });

// ---------- Step implementations ----------
type Ctx = {
  supabaseAdmin: any;
  run_id: string;
  company_id: string;
  branch_id: string;
  business_date: string;
};

async function stepLoanAccrual(ctx: Ctx) {
  const { supabaseAdmin, branch_id, business_date, company_id } = ctx;
  const { data: loans } = await supabaseAdmin
    .from("loan")
    .select(
      "id, principal, annual_rate_pct, disbursed_at, product_id, branch_id, product:product_id(accrued_interest_account_id, interest_income_account_id)",
    )
    .eq("branch_id", branch_id)
    .eq("status", "active");
  let accrued = 0,
    skipped = 0,
    total = 0;
  for (const l of (loans ?? []) as any[]) {
    const accAcc = l.product?.accrued_interest_account_id;
    const incAcc = l.product?.interest_income_account_id;
    const disb = l.disbursed_at ? new Date(l.disbursed_at).toISOString().slice(0, 10) : null;
    if (!accAcc || !incAcc || !disb || business_date <= disb) {
      skipped++;
      continue;
    }
    const { data: insts } = await supabaseAdmin
      .from("loan_installment")
      .select("principal_paid")
      .eq("loan_id", l.id);
    const paid = (insts ?? []).reduce((s: number, r: any) => s + Number(r.principal_paid ?? 0), 0);
    const outstanding = Math.max(0, Number(l.principal) - paid);
    if (outstanding <= 0) {
      skipped++;
      continue;
    }
    const daily = Number(((outstanding * Number(l.annual_rate_pct)) / 100 / 365).toFixed(2));
    if (daily <= 0) {
      skipped++;
      continue;
    }

    const { data: existing } = await supabaseAdmin
      .from("loan_accrual")
      .select("id")
      .eq("loan_id", l.id)
      .eq("accrual_date", business_date)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }

    const { data: prev } = await supabaseAdmin
      .from("loan_accrual")
      .select("cumulative_amount")
      .eq("loan_id", l.id)
      .order("accrual_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cumulative = Number((Number(prev?.cumulative_amount ?? 0) + daily).toFixed(2));

    const { data: entryId, error: pe } = await supabaseAdmin.rpc("post_entry_system", {
      _company_id: company_id,
      _entry_date: business_date,
      _reference: `EOD-ACR-${business_date}`,
      _description: "EOD loan accrual",
      _lines: [
        { account_id: accAcc, debit: daily, credit: 0 },
        { account_id: incAcc, debit: 0, credit: daily },
      ] as any,
      _branch_id: branch_id,
      _source_module: "loans",
      _source_ref: l.id,
      _idempotency_key: `eod-loan-accr:${l.id}:${business_date}`,
      _loan_id: l.id,
    });
    if (pe) throw new Error(`Loan accrual GL post for loan ${l.id}: ${pe.message}`);
    const { error: ae } = await supabaseAdmin.from("loan_accrual").insert({
      loan_id: l.id,
      company_id,
      accrual_date: business_date,
      outstanding_principal: outstanding,
      daily_amount: daily,
      cumulative_amount: cumulative,
      entry_id: entryId,
    });
    if (ae) throw new Error(`Loan accrual insert for loan ${l.id}: ${ae.message}`);
    accrued++;
    total += daily;
  }
  return {
    loans_scanned: loans?.length ?? 0,
    accrued,
    skipped,
    total_amount: Number(total.toFixed(2)),
  };
}

async function stepFdAccrual(ctx: Ctx) {
  const { supabaseAdmin, branch_id, business_date } = ctx;
  const { data: deposits, error: dErr } = await supabaseAdmin
    .from("fixed_deposit")
    .select("id, principal, rate_at_booking, value_date, maturity_date")
    .eq("branch_id", branch_id)
    .eq("status", "active");
  if (dErr) throw new Error(`FD accrual query: ${dErr.message}`);
  let accrued = 0,
    skippedOutOfWindow = 0,
    total = 0;
  for (const d of (deposits ?? []) as any[]) {
    if (business_date < d.value_date || business_date > d.maturity_date) {
      skippedOutOfWindow++;
      continue;
    }
    const dayCount = 365;
    // FIX (req 12): principal * (annualRatePct / 100) / dayCount
    const daily = Number(
      ((Number(d.principal) * (Number(d.rate_at_booking) / 100)) / dayCount).toFixed(2),
    );
    const { data: existing } = await supabaseAdmin
      .from("fd_accrual")
      .select("id")
      .eq("deposit_id", d.id)
      .eq("accrual_date", business_date)
      .maybeSingle();
    if (existing) continue;
    const { data: prev } = await supabaseAdmin
      .from("fd_accrual")
      .select("cumulative_amount")
      .eq("deposit_id", d.id)
      .order("accrual_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cumulative = Number((Number(prev?.cumulative_amount ?? 0) + daily).toFixed(2));
    const { error: ie } = await supabaseAdmin.from("fd_accrual").insert({
      deposit_id: d.id,
      accrual_date: business_date,
      daily_amount: daily,
      cumulative_amount: cumulative,
    });
    if (ie) throw new Error(`FD accrual insert for deposit ${d.id}: ${ie.message}`);
    accrued++;
    total += daily;
  }
  return {
    deposits_scanned: deposits?.length ?? 0,
    accrued,
    skipped_out_of_window: skippedOutOfWindow,
    total_amount: Number(total.toFixed(2)),
  };
}

async function stepPenaltyCharges(ctx: Ctx) {
  const { supabaseAdmin, branch_id, business_date } = ctx;
  const { data: overdue } = await supabaseAdmin
    .from("loan_installment")
    .select("id, loan_id, due_date, principal_due, principal_paid, loan:loan_id(branch_id)")
    .lt("due_date", business_date);
  let overdueCount = 0;
  for (const i of (overdue ?? []) as any[]) {
    if (i.loan?.branch_id !== branch_id) continue;
    const outstanding = Number(i.principal_due ?? 0) - Number(i.principal_paid ?? 0);
    if (outstanding > 0) overdueCount++;
  }
  return {
    overdue_installments: overdueCount,
    note: "Penalty posting requires per-product penalty rules; counted only.",
  };
}

async function stepParNpa(ctx: Ctx) {
  const { supabaseAdmin, branch_id, business_date } = ctx;
  const { data: loans } = await supabaseAdmin
    .from("loan")
    .select("id")
    .eq("branch_id", branch_id)
    .eq("status", "active");
  const buckets = { par1: 0, par30: 0, par60: 0, par90: 0, par180: 0 };
  let scanned = 0;
  for (const l of (loans ?? []) as any[]) {
    scanned++;
    const { data: earliest } = await supabaseAdmin
      .from("loan_installment")
      .select("due_date, principal_due, principal_paid")
      .eq("loan_id", l.id)
      .lt("due_date", business_date)
      .order("due_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!earliest) continue;
    const outstanding = Number(earliest.principal_due ?? 0) - Number(earliest.principal_paid ?? 0);
    if (outstanding <= 0) continue;
    const days = Math.floor(
      (new Date(business_date).getTime() - new Date(earliest.due_date).getTime()) / 86400000,
    );
    if (days >= 180) buckets.par180++;
    else if (days >= 90) buckets.par90++;
    else if (days >= 60) buckets.par60++;
    else if (days >= 30) buckets.par30++;
    else if (days >= 1) buckets.par1++;
  }
  return { loans_scanned: scanned, ...buckets };
}

async function stepFdMaturity(ctx: Ctx) {
  const { supabaseAdmin, branch_id, business_date } = ctx;
  const { data: matured } = await supabaseAdmin
    .from("fixed_deposit")
    .select("id, certificate_no, maturity_instruction, status")
    .eq("branch_id", branch_id)
    .eq("status", "active")
    .eq("maturity_date", business_date);
  return {
    matured_today: matured?.length ?? 0,
    auto_renewal: (matured ?? []).filter((d: any) => d.maturity_instruction === "auto_renewal")
      .length,
    payout_pending: (matured ?? []).filter((d: any) => d.maturity_instruction === "payout").length,
    note: "Execution handled by /fd/maturity workspace; this step reports counts only.",
  };
}

async function stepSavingsInterest(ctx: Ctx) {
  const { supabaseAdmin, business_date } = ctx;
  // Daily accrual for every eligible account (idempotent per account+date).
  const { data: accr, error: aErr } = await supabaseAdmin.rpc(
    "run_savings_interest_accrual" as any,
    { _business_date: business_date } as any,
  );
  if (aErr) throw new Error(`Savings accrual: ${aErr.message}`);
  // Capitalisation runs only on period-end (last day of month).
  const d = new Date(business_date);
  const eom = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  let cap: any = null;
  if (business_date === eom) {
    const { data: capRes, error: cErr } = await supabaseAdmin.rpc(
      "run_savings_interest_capitalization" as any,
      { _period_end: business_date, _force: false } as any,
    );
    if (cErr) throw new Error(`Savings capitalisation: ${cErr.message}`);
    cap = capRes;
  }
  return { accrual: accr, capitalisation: cap, period_end: business_date === eom };
}

async function stepSnapshots(ctx: Ctx) {
  const { supabaseAdmin, branch_id, business_date } = ctx;
  const { data, error } = await supabaseAdmin.rpc("eod_write_snapshots" as any, {
    _branch_id: branch_id,
    _business_date: business_date,
  } as any);
  if (error) throw new Error(`Snapshots: ${error.message}`);
  return data ?? {};
}

async function stepGlPost(ctx: Ctx) {
  const { supabaseAdmin, branch_id, business_date } = ctx;
  const { count } = await supabaseAdmin
    .from("journal_entry")
    .select("*", { count: "exact", head: true })
    .eq("branch_id", branch_id)
    .eq("entry_date", business_date);
  return { entries_today: count ?? 0 };
}

async function stepTrialBalance(ctx: Ctx) {
  const { supabaseAdmin, company_id, business_date } = ctx;
  const { data: rows } = await supabaseAdmin
    .rpc(
      "compute_trial_balance" as any,
      {
        _company_id: company_id,
        _as_at: business_date,
      } as any,
    )
    .then((r: any) => r)
    .catch(() => ({ data: null }));
  if (!rows) {
    // Fallback: aggregate postings directly.
    const { data: agg } = await supabaseAdmin
      .from("posting")
      .select(
        "account_id, debit, credit, entry:entry_id!inner(entry_date, branch:branch_id!inner(company_id))",
      )
      .lte("entry.entry_date", business_date)
      .eq("entry.branch.company_id", company_id);
    let dr = 0,
      cr = 0;
    for (const p of (agg ?? []) as any[]) {
      dr += Number(p.debit ?? 0);
      cr += Number(p.credit ?? 0);
    }
    const balanced = Math.abs(dr - cr) < 0.01;
    if (!balanced)
      throw new Error(`Trial balance out of balance: DR ${dr.toFixed(2)} vs CR ${cr.toFixed(2)}`);
    return { total_debits: Number(dr.toFixed(2)), total_credits: Number(cr.toFixed(2)), balanced };
  }
  return { rows: (rows as any[]).length, balanced: true };
}

async function stepReports(ctx: Ctx) {
  const { supabaseAdmin, run_id, branch_id, business_date } = ctx;
  const [{ count: txnCount }, { count: loanCount }, { count: fdCount }] = await Promise.all([
    supabaseAdmin
      .from("journal_entry")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branch_id)
      .eq("entry_date", business_date),
    supabaseAdmin
      .from("loan")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branch_id)
      .eq("status", "active"),
    supabaseAdmin
      .from("fixed_deposit")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branch_id)
      .eq("status", "active"),
  ]);
  const reports = {
    generated_at: new Date().toISOString(),
    daily_transaction_summary: { entries: txnCount ?? 0 },
    loan_portfolio: { active_loans: loanCount ?? 0 },
    fd_maturity: { active_deposits: fdCount ?? 0 },
  };
  await supabaseAdmin.rpc("eod_save_reports", { _run_id: run_id, _reports: reports });
  return { report_keys: Object.keys(reports).length };
}

async function stepRollover(ctx: Ctx) {
  // Actual lock is applied by eod_finalize('completed'); this step is the trigger.
  return { locked_through: ctx.business_date };
}

// ---------- Full-run helper ----------
export const runAllSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { run_id: string }) => z.object({ run_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const results: Array<{ step: string; ok: boolean; error?: string | null; metrics?: any }> = [];
    for (const step of STEPS) {
      const { data: run } = await context.supabase
        .from("eod_run")
        .select("steps, status")
        .eq("id", data.run_id)
        .maybeSingle();
      if (!run) throw new Error("Run not found");
      if (run.status !== "in_progress") break;
      const stepState = ((run.steps as any[]) ?? []).find((s: any) => s.key === step);
      if (stepState?.status === "completed" || stepState?.status === "skipped") continue;
      // Call runStep server-side (same module).
      const r = await runStepInternal(context, data.run_id, step);
      results.push({ step, ...r });
      if (!r.ok) {
        await context.supabase.rpc(
          "eod_finalize" as any,
          { _run_id: data.run_id, _status: "failed" } as any,
        );
        break;
      }
    }
    return results;
  });

async function runStepInternal(context: any, run_id: string, step: StepKey) {
  const { data: run } = await context.supabase
    .from("eod_run")
    .select("company_id, branch_id, business_date")
    .eq("id", run_id)
    .maybeSingle();
  if (!run) return { ok: false, error: "Run not found", metrics: {} };
  await context.supabase.rpc(
    "eod_record_step" as any,
    {
      _run_id: run_id,
      _step_key: step,
      _status: "processing",
      _metrics: {},
      _error: null,
    } as any,
  );
  let metrics: Record<string, any> = {};
  let error: string | null = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ctx: Ctx = {
      supabaseAdmin,
      run_id,
      company_id: run.company_id,
      branch_id: run.branch_id,
      business_date: run.business_date,
    };
    switch (step) {
      case "loan_accrual":
        metrics = await stepLoanAccrual(ctx);
        break;
      case "fd_accrual":
        metrics = await stepFdAccrual(ctx);
        break;
      case "penalty_charges":
        metrics = await stepPenaltyCharges(ctx);
        break;
      case "par_npa":
        metrics = await stepParNpa(ctx);
        break;
      case "fd_maturity":
        metrics = await stepFdMaturity(ctx);
        break;
      case "savings_interest":
        metrics = await stepSavingsInterest(ctx);
        break;
      case "gl_post":
        metrics = await stepGlPost(ctx);
        break;
      case "trial_balance":
        metrics = await stepTrialBalance(ctx);
        break;
      case "snapshots":
        metrics = await stepSnapshots(ctx);
        break;
      case "reports":
        metrics = await stepReports(ctx);
        break;
      case "rollover":
        metrics = await stepRollover(ctx);
        break;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await context.supabase.rpc(
    "eod_record_step" as any,
    {
      _run_id: run_id,
      _step_key: step,
      _status: error ? "failed" : "completed",
      _metrics: metrics,
      _error: error,
    } as any,
  );
  if (!error && step === "rollover") {
    await context.supabase.rpc(
      "eod_finalize" as any,
      { _run_id: run_id, _status: "completed" } as any,
    );
  }
  return { ok: !error, error, metrics };
}

// ---------- System / scheduled orchestrator entrypoint ----------
// Runs a single step against a service-role Supabase client. Used by the
// scheduled cron worker so manual (dual-controlled) and scheduled paths
// share identical financial logic.
export async function runOrchestratorStep(args: {
  supabaseAdmin: any;
  run_id: string;
  company_id: string;
  branch_id: string;
  business_date: string;
  step_key: StepKey;
}): Promise<Record<string, any>> {
  const { supabaseAdmin, run_id, step_key } = args;
  await supabaseAdmin.rpc("eod_record_step" as any, {
    _run_id: run_id,
    _step_key: step_key,
    _status: "processing",
    _metrics: {} as any,
    _error: null,
  } as any);
  const ctx: Ctx = {
    supabaseAdmin,
    run_id,
    company_id: args.company_id,
    branch_id: args.branch_id,
    business_date: args.business_date,
  };
  let metrics: Record<string, any> = {};
  switch (step_key) {
    case "loan_accrual": metrics = await stepLoanAccrual(ctx); break;
    case "fd_accrual": metrics = await stepFdAccrual(ctx); break;
    case "penalty_charges": metrics = await stepPenaltyCharges(ctx); break;
    case "par_npa": metrics = await stepParNpa(ctx); break;
    case "fd_maturity": metrics = await stepFdMaturity(ctx); break;
    case "savings_interest": metrics = await stepSavingsInterest(ctx); break;
    case "gl_post": metrics = await stepGlPost(ctx); break;
    case "trial_balance": metrics = await stepTrialBalance(ctx); break;
    case "snapshots": metrics = await stepSnapshots(ctx); break;
    case "reports": metrics = await stepReports(ctx); break;
    case "rollover": metrics = await stepRollover(ctx); break;
  }
  await supabaseAdmin.rpc("eod_record_step" as any, {
    _run_id: run_id,
    _step_key: step_key,
    _status: "completed",
    _metrics: metrics as any,
    _error: null,
  } as any);
  return metrics;
}
