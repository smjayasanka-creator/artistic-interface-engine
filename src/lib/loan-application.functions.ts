// Loan Application origination server functions.
// Origination lives in the loan_application_* family; the operational `loan`
// row is only created at disbursement via `disburse_loan_from_application`.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Master ----------

export const createLoanApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      branch_id: string;
      client_id?: string | null;
      product_id?: string | null;
      officer_id?: string | null;
      requested_principal?: number;
      requested_tenor_months?: number;
      requested_rate_pct?: number | null;
      frequency?: string | null;
      currency?: string;
      purpose?: string | null;
      channel?: string | null;
    }) =>
      z
        .object({
          branch_id: z.string().uuid(),
          client_id: z.string().uuid().nullable().optional(),
          product_id: z.string().uuid().nullable().optional(),
          officer_id: z.string().uuid().nullable().optional(),
          requested_principal: z.number().nonnegative().optional(),
          requested_tenor_months: z.number().int().nonnegative().optional(),
          requested_rate_pct: z.number().nullable().optional(),
          frequency: z.string().nullable().optional(),
          currency: z.string().optional(),
          purpose: z.string().nullable().optional(),
          channel: z.string().nullable().optional(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: br, error: brErr } = await supabase
      .from("branch")
      .select("company_id")
      .eq("id", data.branch_id)
      .maybeSingle();
    if (brErr) throw new Error(brErr.message);
    if (!br) throw new Error("Branch not found");

    const { data: row, error } = await supabase
      .from("loan_application" as any)
      .insert({
        company_id: (br as any).company_id,
        branch_id: data.branch_id,
        client_id: data.client_id ?? null,
        product_id: data.product_id ?? null,
        officer_id: data.officer_id ?? null,
        requested_principal: data.requested_principal ?? 0,
        requested_tenor_months: data.requested_tenor_months ?? 0,
        requested_rate_pct: data.requested_rate_pct ?? null,
        frequency: (data.frequency ?? null) as any,
        currency: data.currency ?? "KES",
        purpose: data.purpose ?? null,
        channel: data.channel ?? null,
        status: "draft",
        created_by: userId,
      } as any)
      .select("id, application_no")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as { id: string; application_no: string };
  });

// Fields a company member may edit while the application is still mutable
// (draft / under_review). Sensitive fields (company_id, status,
// application_no, created_by, submitted_at, decided_at, disbursed_at,
// loan_id, workflow_instance_id) are intentionally excluded.
const UpdatableAppFields = z
  .object({
    client_id: z.string().uuid().nullable().optional(),
    product_id: z.string().uuid().nullable().optional(),
    officer_id: z.string().uuid().nullable().optional(),
    branch_id: z.string().uuid().optional(),
    requested_principal: z.number().nonnegative().optional(),
    requested_tenor_months: z.number().int().nonnegative().optional(),
    requested_rate_pct: z.number().nullable().optional(),
    frequency: z.string().nullable().optional(),
    currency: z.string().optional(),
    purpose: z.string().nullable().optional(),
    channel: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  .strict();

export const updateLoanApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; patch: Record<string, unknown> }) =>
    z
      .object({
        id: z.string().uuid(),
        patch: UpdatableAppFields,
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Guard: only mutable statuses (draft / under_review) may be edited.
    const { data: cur, error: curErr } = await supabase
      .from("loan_application" as any)
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (curErr) throw new Error(curErr.message);
    if (!cur) throw new Error("Application not found");
    const status = (cur as any).status as string;
    if (!["draft", "under_review"].includes(status)) {
      throw new Error(`Application in status '${status}' is not editable`);
    }
    const { error } = await supabase
      .from("loan_application" as any)
      .update(data.patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listLoanApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { status?: string; limit?: number } = {}) =>
    z
      .object({ status: z.string().optional(), limit: z.number().int().max(500).optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("loan_application" as any)
      .select(
        "id, application_no, status, requested_principal, requested_tenor_months, currency, purpose, submitted_at, decided_at, disbursed_at, loan_id, client_id, product_id, branch_id, created_at, client:client(id, full_name), product:loan_product(id, name), branch:branch(id, code, name)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getLoanApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [
      master,
      applicants,
      evaluation,
      employment,
      business,
      existing,
      guarantors,
      collateral,
      documents,
      approvals,
      notes,
      history,
    ] = await Promise.all([
      supabase
        .from("loan_application" as any)
        .select(
          "*, client:client(id, full_name), product:loan_product(id, name), branch:branch(id, code, name)",
        )
        .eq("id", data.id)
        .maybeSingle(),
      supabase
        .from("loan_application_applicant" as any)
        .select("*")
        .eq("application_id", data.id),
      supabase
        .from("loan_application_evaluation" as any)
        .select("*")
        .eq("application_id", data.id)
        .maybeSingle(),
      supabase
        .from("loan_application_employment" as any)
        .select("*")
        .eq("application_id", data.id),
      supabase
        .from("loan_application_business" as any)
        .select("*")
        .eq("application_id", data.id),
      supabase
        .from("loan_application_existing_facility" as any)
        .select("*")
        .eq("application_id", data.id),
      supabase
        .from("loan_application_guarantor" as any)
        .select("*")
        .eq("application_id", data.id),
      supabase
        .from("loan_application_collateral" as any)
        .select("*, security_type:security_type(id, name)")
        .eq("application_id", data.id),
      supabase
        .from("loan_application_document" as any)
        .select("*")
        .eq("application_id", data.id)
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("loan_application_approval" as any)
        .select("*")
        .eq("application_id", data.id)
        .order("decided_at", { ascending: true }),
      supabase
        .from("loan_application_note" as any)
        .select("*")
        .eq("application_id", data.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("loan_application_status_history" as any)
        .select("*")
        .eq("application_id", data.id)
        .order("created_at", { ascending: true }),
    ]);
    if (master.error) throw new Error(master.error.message);
    return {
      master: master.data,
      applicants: applicants.data ?? [],
      evaluation: evaluation.data ?? null,
      employment: employment.data ?? [],
      business: business.data ?? [],
      existing_facilities: existing.data ?? [],
      guarantors: guarantors.data ?? [],
      collateral: collateral.data ?? [],
      documents: documents.data ?? [],
      approvals: approvals.data ?? [],
      notes: notes.data ?? [],
      status_history: history.data ?? [],
    };
  });

// ---------- Transitions ----------
// All status changes go through SECURITY DEFINER RPCs so that status,
// history, approval trail, and audit event are one atomic unit. The
// transition_key acts as an idempotency guard for retried requests.

export const submitLoanApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; transition_key?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        transition_key: z.string().min(1).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const key = data.transition_key ?? `submit:${data.id}:${Date.now()}`;
    const { data: res, error } = await context.supabase.rpc(
      "submit_loan_application" as any,
      { _application_id: data.id, _transition_key: key } as any,
    );
    if (error) throw new Error(error.message);
    return res as unknown as {
      application_id: string;
      from_status: string;
      to_status: string;
      history_id: string;
      audit_id?: string;
      idempotent: boolean;
    };
  });

export const recordApplicationDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      application_id: string;
      decision: "approve" | "reject" | "return";
      comment?: string;
      step_key?: string;
      workflow_instance_id?: string;
      transition_key?: string;
    }) =>
      z
        .object({
          application_id: z.string().uuid(),
          decision: z.enum(["approve", "reject", "return"]),
          comment: z.string().optional(),
          step_key: z.string().optional(),
          workflow_instance_id: z.string().uuid().optional(),
          transition_key: z.string().min(1).optional(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const key =
      data.transition_key ??
      `decide:${data.application_id}:${data.workflow_instance_id ?? "_"}:${data.step_key ?? "_"}:${data.decision}`;
    const { data: res, error } = await context.supabase.rpc(
      "decide_loan_application" as any,
      {
        _application_id: data.application_id,
        _decision: data.decision,
        _comment: data.comment ?? null,
        _step_key: data.step_key ?? null,
        _workflow_instance_id: data.workflow_instance_id ?? null,
        _transition_key: key,
      } as any,
    );
    if (error) throw new Error(error.message);
    return res as unknown as {
      application_id: string;
      from_status: string;
      to_status: string;
      history_id: string | null;
      decision_id: string | null;
      audit_id?: string;
      idempotent: boolean;
    };
  });

export const returnLoanApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason: string; transition_key?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().min(3),
        transition_key: z.string().min(1).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const key = data.transition_key ?? `return:${data.id}:${Date.now()}`;
    const { data: res, error } = await context.supabase.rpc(
      "return_loan_application" as any,
      { _application_id: data.id, _reason: data.reason, _transition_key: key } as any,
    );
    if (error) throw new Error(error.message);
    return res;
  });

export const cancelLoanApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason: string; transition_key?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().min(3, "A cancellation reason is required"),
        transition_key: z.string().min(1).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const key = data.transition_key ?? `cancel:${data.id}:${Date.now()}`;
    const { data: res, error } = await context.supabase.rpc(
      "cancel_loan_application" as any,
      { _application_id: data.id, _reason: data.reason, _transition_key: key } as any,
    );
    if (error) throw new Error(error.message);
    return res;
  });

// ---------- Documents ----------

export const addApplicationDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      application_id: string;
      document_type: string;
      file_name: string;
      storage_path: string;
      storage_bucket?: string;
      mime_type?: string;
      size_bytes?: number;
      version?: number;
    }) =>
      z
        .object({
          application_id: z.string().uuid(),
          document_type: z.string().min(1),
          file_name: z.string().min(1),
          storage_path: z.string().min(1),
          storage_bucket: z.string().optional(),
          mime_type: z.string().optional(),
          size_bytes: z.number().int().optional(),
          version: z.number().int().optional(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: app } = await supabase
      .from("loan_application" as any)
      .select("application_no")
      .eq("id", data.application_id)
      .maybeSingle();
    if (!app) throw new Error("Application not found");
    const { data: row, error } = await supabase
      .from("loan_application_document" as any)
      .insert({
        application_id: data.application_id,
        application_no: (app as any).application_no,
        document_type: data.document_type,
        file_name: data.file_name,
        storage_bucket: data.storage_bucket ?? "loan-application-documents",
        storage_path: data.storage_path,
        mime_type: data.mime_type ?? null,
        size_bytes: data.size_bytes ?? null,
        version: data.version ?? 1,
        uploaded_by: userId,
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteApplicationDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("loan_application_document" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Notes ----------

export const addApplicationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { application_id: string; note: string }) =>
    z.object({ application_id: z.string().uuid(), note: z.string().min(1) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: app } = await supabase
      .from("loan_application" as any)
      .select("application_no")
      .eq("id", data.application_id)
      .maybeSingle();
    if (!app) throw new Error("Application not found");
    const { data: row, error } = await supabase
      .from("loan_application_note" as any)
      .insert({
        application_id: data.application_id,
        application_no: (app as any).application_no,
        author_id: userId,
        note: data.note,
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Disburse (copy-on-disburse) ----------

export const disburseApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      application_id: string;
      payment_channel?: string;
      payment_reference?: string;
      idempotency_key?: string;
    }) =>
      z
        .object({
          application_id: z.string().uuid(),
          payment_channel: z.string().optional(),
          payment_reference: z.string().optional(),
          idempotency_key: z.string().optional(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: loanId, error } = await supabase.rpc(
      "disburse_loan_from_application" as any,
      {
        _application_id: data.application_id,
        _payment_channel: data.payment_channel ?? "fund_transfer",
        _payment_reference: data.payment_reference ?? null,
        _idempotency_key: data.idempotency_key ?? null,
      } as any,
    );
    if (error) throw new Error(error.message);
    return { loan_id: loanId as unknown as string };
  });
