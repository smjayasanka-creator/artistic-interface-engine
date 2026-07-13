import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertPlatformAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "platform_admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: platform admin only");
}

export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertPlatformAdmin(supabase, userId);

    const [
      { data: companies },
      { data: subs },
      { data: staff },
      { data: clients },
      { data: loans },
      { data: fds },
    ] = await Promise.all([
      supabase.from("company").select("id, name, country, currency, created_at"),
      supabase.from("company_subscription").select("company_id, status, mrr, currency, plan_id, plan:plan_id(code,name)"),
      supabase.from("staff").select("id, branch_id, active, branch:branch_id(company_id)"),
      supabase.from("client").select("id, status, branch_id, branch:branch_id(company_id)"),
      supabase.from("loan").select("id, principal, status, branch_id, branch:branch_id(company_id)"),
      supabase.from("fixed_deposit").select("id, principal, status, branch_id, branch:branch_id(company_id)"),
    ]);

    const bucket = new Map<string, { staff: number; clients: number; loanValue: number; loanCount: number; fdValue: number; fdCount: number }>();
    const b = (id: string) => {
      if (!bucket.has(id)) bucket.set(id, { staff: 0, clients: 0, loanValue: 0, loanCount: 0, fdValue: 0, fdCount: 0 });
      return bucket.get(id)!;
    };
    for (const s of staff ?? []) { const c = (s as any).branch?.company_id; if (c) b(c).staff++; }
    for (const c of clients ?? []) { const co = (c as any).branch?.company_id; if (co && c.status === "active") b(co).clients++; }
    for (const l of loans ?? []) { const co = (l as any).branch?.company_id; if (co) { b(co).loanCount++; b(co).loanValue += Number(l.principal || 0); } }
    for (const f of fds ?? []) { const co = (f as any).branch?.company_id; if (co) { b(co).fdCount++; b(co).fdValue += Number(f.principal || 0); } }

    const rows = (companies ?? []).map((c: any) => {
      const sub = (subs ?? []).find((s: any) => s.company_id === c.id);
      const m = b(c.id) ?? { staff: 0, clients: 0, loanValue: 0, loanCount: 0, fdValue: 0, fdCount: 0 };
      return {
        id: c.id,
        name: c.name,
        country: c.country,
        currency: c.currency,
        created_at: c.created_at,
        plan_code: sub?.plan?.code ?? null,
        plan_name: sub?.plan?.name ?? "—",
        status: sub?.status ?? "unassigned",
        mrr: Number(sub?.mrr ?? 0),
        staff_count: m.staff,
        client_count: m.clients,
        loan_value: m.loanValue,
        loan_count: m.loanCount,
        fd_value: m.fdValue,
        fd_count: m.fdCount,
      };
    });

    const totals = rows.reduce(
      (a, r) => ({
        mrr: a.mrr + r.mrr,
        arr: a.arr + r.mrr * 12,
        companies: a.companies + 1,
        active: a.active + (r.status === "active" ? 1 : 0),
        trialing: a.trialing + (r.status === "trialing" ? 1 : 0),
        past_due: a.past_due + (r.status === "past_due" ? 1 : 0),
        staff: a.staff + r.staff_count,
        clients: a.clients + r.client_count,
        loan_value: a.loan_value + r.loan_value,
        fd_value: a.fd_value + r.fd_value,
      }),
      { mrr: 0, arr: 0, companies: 0, active: 0, trialing: 0, past_due: 0, staff: 0, clients: 0, loan_value: 0, fd_value: 0 },
    );

    return { rows, totals };
  });

export const listSubscriptionPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("subscription_plan")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertCompanySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    company_id: string;
    plan_id: string;
    status: "trialing" | "active" | "past_due" | "canceled" | "paused";
    billing_cycle: "monthly" | "annual";
    seats: number;
    mrr: number;
    currency: string;
    current_period_end?: string | null;
    notes?: string | null;
  }) =>
    z.object({
      company_id: z.string().uuid(),
      plan_id: z.string().uuid(),
      status: z.enum(["trialing", "active", "past_due", "canceled", "paused"]),
      billing_cycle: z.enum(["monthly", "annual"]),
      seats: z.number().int().min(0),
      mrr: z.number().min(0),
      currency: z.string().min(3).max(3),
      current_period_end: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("company_subscription")
      .upsert(
        {
          company_id: data.company_id,
          plan_id: data.plan_id,
          status: data.status,
          billing_cycle: data.billing_cycle,
          seats: data.seats,
          mrr: data.mrr,
          currency: data.currency,
          current_period_end: data.current_period_end ?? null,
          notes: data.notes ?? null,
        },
        { onConflict: "company_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCronJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("list_cron_jobs");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      jobid: number;
      jobname: string;
      schedule: string;
      command: string;
      active: boolean;
      last_start: string | null;
      last_end: string | null;
      last_status: string | null;
      last_return_message: string | null;
    }>;
  });

export const setCronJobActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobid: number; active: boolean }) =>
    z.object({ jobid: z.number().int().positive(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("set_cron_job_active", {
      _jobid: data.jobid,
      _active: data.active,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
