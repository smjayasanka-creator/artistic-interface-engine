import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Loans eligible to be written off (disbursed/active) with outstanding balances.
export const listWriteOffCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: loans, error } = await supabase
      .from("loan")
      .select("id, contract_no, status, client_id, principal, client:client_id(full_name)")
      .in("status", ["disbursed", "active", "overdue"] as any);
    if (error) throw new Error(error.message);
    if (!loans?.length) return [];
    const ids = loans.map((l) => l.id);
    const { data: inst } = await supabase
      .from("loan_installment")
      .select("loan_id, principal_due, principal_paid, interest_due, interest_paid, fee_due, fee_paid, state")
      .in("loan_id", ids);
    const bal = new Map<string, { p: number; i: number; f: number }>();
    (inst ?? []).forEach((r: any) => {
      if (r.state === "cancelled") return;
      const b = bal.get(r.loan_id) ?? { p: 0, i: 0, f: 0 };
      b.p += Number(r.principal_due ?? 0) - Number(r.principal_paid ?? 0);
      b.i += Number(r.interest_due ?? 0) - Number(r.interest_paid ?? 0);
      b.f += Number(r.fee_due ?? 0) - Number(r.fee_paid ?? 0);
      bal.set(r.loan_id, b);
    });
    return loans.map((l: any) => {
      const b = bal.get(l.id) ?? { p: 0, i: 0, f: 0 };
      return {
        id: l.id,
        contract_no: l.contract_no,
        status: l.status,
        client_name: l.client?.full_name ?? "—",
        principal: Number(l.principal),
        outstanding_principal: b.p,
        outstanding_interest: b.i,
        outstanding_charges: b.f,
        outstanding_total: b.p + b.i + b.f,
      };
    });
  });

export const listWriteOffs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("loan_write_off" as any)
      .select("*, client:client_id(full_name)")
      .order("write_off_date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...r,
      client_name: r.client?.full_name ?? "—",
    }));
  });

export const listWriteOffRecoveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { write_off_id: string }) =>
    z.object({ write_off_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("loan_write_off_recovery" as any)
      .select("*")
      .eq("write_off_id", data.write_off_id)
      .order("recovery_date", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const recordWriteOffRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    write_off_id: string;
    recovery_date: string;
    amount: number;
    principal: number;
    interest: number;
    charges: number;
    payment_method: string;
    reference?: string;
    notes?: string;
    idempotency_key?: string;
  }) =>
    z.object({
      write_off_id: z.string().uuid(),
      recovery_date: z.string(),
      amount: z.number().positive(),
      principal: z.number().nonnegative(),
      interest: z.number().nonnegative(),
      charges: z.number().nonnegative(),
      payment_method: z.string().min(1),
      reference: z.string().optional(),
      notes: z.string().optional(),
      idempotency_key: z.string().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: r, error } = await supabase.rpc("record_write_off_recovery" as any, {
      _write_off_id: data.write_off_id,
      _recovery_date: data.recovery_date,
      _amount: data.amount,
      _principal: data.principal,
      _interest: data.interest,
      _charges: data.charges,
      _payment_method: data.payment_method,
      _reference: data.reference ?? null,
      _notes: data.notes ?? null,
      _idempotency_key: data.idempotency_key ?? null,
    } as any);
    if (error) throw new Error(error.message);
    return r as string;
  });
