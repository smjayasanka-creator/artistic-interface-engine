// Product lifecycle handlers — thin wrappers around SECURITY DEFINER RPCs
// that perform state + GL changes atomically in one call.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const writeOffLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { loan_id: string; reason: string; use_provision?: boolean; idempotency_key?: string }) =>
      z
        .object({
          loan_id: z.string().uuid(),
          reason: z.string().min(3),
          use_provision: z.boolean().optional(),
          idempotency_key: z.string().optional(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: r, error } = await supabase.rpc(
      "write_off_loan" as any,
      {
        _loan_id: data.loan_id,
        _reason: data.reason,
        _use_provision: data.use_provision ?? false,
        _idempotency_key: data.idempotency_key ?? null,
      } as any,
    );
    if (error) throw new Error(error.message);
    return r as string;
  });

export const rescheduleLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      loan_id: string;
      reason: string;
      installments: Array<{
        due_date: string;
        principal_due: number;
        interest_due: number;
        fee_due?: number;
      }>;
    }) =>
      z
        .object({
          loan_id: z.string().uuid(),
          reason: z.string().min(3),
          installments: z
            .array(
              z.object({
                due_date: z.string(),
                principal_due: z.number().nonnegative(),
                interest_due: z.number().nonnegative(),
                fee_due: z.number().nonnegative().optional(),
              }),
            )
            .min(1),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: r, error } = await supabase.rpc(
      "reschedule_loan" as any,
      {
        _loan_id: data.loan_id,
        _new_installments: data.installments as any,
        _reason: data.reason,
      } as any,
    );
    if (error) throw new Error(error.message);
    return r as string;
  });

export const markSavingsDormant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { account_id: string }) =>
    z.object({ account_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: r, error } = await supabase.rpc(
      "mark_savings_dormant" as any,
      {
        _account_id: data.account_id,
      } as any,
    );
    if (error) throw new Error(error.message);
    return r as string;
  });

export const transferSavingsToUnclaimed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { account_id: string; idempotency_key?: string }) =>
    z
      .object({
        account_id: z.string().uuid(),
        idempotency_key: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: r, error } = await supabase.rpc(
      "transfer_savings_to_unclaimed" as any,
      {
        _account_id: data.account_id,
        _idempotency_key: data.idempotency_key ?? null,
      } as any,
    );
    if (error) throw new Error(error.message);
    return r as string;
  });
