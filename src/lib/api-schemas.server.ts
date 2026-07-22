// Server-only shared schemas + helpers so every public API route validates
// its request AND response against the shapes documented in the API Console.
import { z, type ZodTypeAny } from "zod";
import { json, logApiCall } from "@/lib/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- Standard error contract ----------
// Every error response looks like: { error: string, message: string, details?: ... }
export type ApiError = { error: string; message: string; details?: unknown };

export const ERRORS = {
  invalid_json: { code: 400, error: "invalid_json", message: "Request body must be valid JSON." },
  validation_failed: {
    code: 400,
    error: "validation_failed",
    message: "Request body failed schema validation.",
  },
  missing_header: (name: string) => ({
    code: 400,
    error: "missing_header",
    message: `Required header "${name}" is missing.`,
  }),
  idempotency_conflict: {
    code: 409,
    error: "idempotency_conflict",
    message: "Idempotency-Key reused with a different request body.",
  },
  response_shape: {
    code: 500,
    error: "internal_error",
    message: "Server produced a response that failed its own schema check.",
  },
} as const;

export function errJson(
  e: { code: number; error: string; message: string; details?: unknown },
  details?: unknown,
): Response {
  const body: ApiError = {
    error: e.error,
    message: e.message,
    ...(details ? { details } : e.details ? { details: e.details } : {}),
  };
  return json(body, e.code);
}

// ---------- Header helpers ----------
export function requireHeader(
  request: Request,
  name: string,
): { ok: true; value: string } | { ok: false; response: Response } {
  const v = request.headers.get(name);
  if (!v || !v.trim()) return { ok: false, response: errJson(ERRORS.missing_header(name)) };
  return { ok: true, value: v.trim() };
}

// ---------- JSON body parse + validate ----------
export async function parseJsonBody<T extends ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<
  { ok: true; data: z.infer<T>; raw: unknown } | { ok: false; response: Response; raw: unknown }
> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: errJson(ERRORS.invalid_json), raw: null };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, response: errJson(ERRORS.validation_failed, parsed.error.flatten()), raw };
  return { ok: true, data: parsed.data, raw };
}

// ---------- Response validation ----------
// Every route validates its own JSON response before returning it, so a
// contract drift (typo, missing field) surfaces as a 500 in tests rather
// than silently shipping the wrong shape.
export function validateAndSend<T extends ZodTypeAny>(
  schema: T,
  body: z.infer<T>,
  status: number,
): Response {
  const parsed = schema.safeParse(body);
  if (!parsed.success) return errJson(ERRORS.response_shape, parsed.error.flatten());
  return json(parsed.data, status);
}

// ---------- Idempotency ----------
// Look up a prior successful log row for the same (company, endpoint,
// Idempotency-Key). If body matches, replay the stored response; if body
// differs, return 409 idempotency_conflict.
export async function checkIdempotency(args: {
  company_id: string;
  endpoint: string;
  key: string;
  body: unknown;
}): Promise<
  { kind: "miss" } | { kind: "replay"; status: number; response: unknown } | { kind: "conflict" }
> {
  const { data } = await supabaseAdmin
    .from("api_transaction_log")
    .select("status_code, request, response")
    .eq("company_id", args.company_id)
    .eq("endpoint", args.endpoint)
    .contains("request", { _idempotency_key: args.key } as any)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { kind: "miss" };
  try {
    const prevBody = (data.request as any)?._body ?? null;
    if (JSON.stringify(prevBody) !== JSON.stringify(args.body)) return { kind: "conflict" };
    return { kind: "replay", status: data.status_code ?? 200, response: data.response };
  } catch {
    return { kind: "miss" };
  }
}

export function withIdempotencyEnvelope(body: unknown, key: string | null): unknown {
  return key ? { _idempotency_key: key, _body: body } : body;
}

// ---------- Response schema builders ----------
export const IsoDateTime = z.string().datetime();

// Transactions · inbound
export const TransactionsInboundRequest = z.object({
  external_reference: z.string().min(1).max(80),
  counterparty: z.object({
    name: z.string().min(1).max(120),
    account: z.string().min(1).max(64),
    bank_code: z.string().max(20).optional(),
    swift: z.string().max(20).optional(),
  }),
  amount: z.number().positive(),
  currency: z.string().length(3),
  narrative: z.string().max(160).optional(),
  value_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const TransactionsInboundResponse = z.object({
  status: z.literal("accepted"),
  reference: z.string(),
  received_at: IsoDateTime,
  counterparty: z.object({ name: z.string(), account: z.string() }),
  amount: z.number(),
  currency: z.string().length(3),
});

// Transactions · outbound
export const TransactionsOutboundRequest = z.object({
  source_account: z.string().min(1).max(64),
  destination: z.object({
    name: z.string().min(1).max(120),
    account: z.string().min(1).max(64),
    bank_code: z.string().max(20).optional(),
    swift: z.string().max(20).optional(),
  }),
  amount: z.number().positive(),
  currency: z.string().length(3),
  narrative: z.string().max(160).optional(),
  idempotency_key: z.string().min(6).max(80),
});
export const TransactionsOutboundResponse = z.object({
  status: z.literal("queued"),
  reference: z.string(),
  idempotency_key: z.string(),
  submitted_at: IsoDateTime,
});

// CEFT
export const CeftRequest = z.object({
  transaction_type: z.enum(["credit", "debit"]),
  originator: z.object({ name: z.string(), account: z.string(), bank_code: z.string() }),
  beneficiary: z.object({ name: z.string(), account: z.string(), bank_code: z.string() }),
  amount: z.number().positive(),
  currency: z.literal("LKR"),
  session_id: z.string().min(1).max(40),
  narrative: z.string().max(140).optional(),
});
export const CeftResponse = z.object({
  status: z.literal("accepted"),
  ceft_reference: z.string(),
  session_id: z.string(),
  cleared_at: z.string().nullable(),
});

// ATM
export const AtmRequest = z.object({
  terminal_id: z.string().min(3).max(20),
  card_pan_masked: z.string().regex(/^\d{6}\*+\d{4}$/, "Use masked PAN like 411111******1234"),
  transaction_type: z.enum(["withdrawal", "balance_inquiry", "mini_statement"]),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  stan: z.string().min(6).max(12),
});
export const AtmResponse = z.object({
  status: z.enum(["approved", "declined"]),
  authorization_code: z.string(),
  stan: z.string(),
  balance_after: z.number().nullable(),
  currency: z.string().length(3),
  processed_at: IsoDateTime,
});

// Internet Banking
export const IbRequest = z.object({
  customer_id: z.string().min(1).max(64),
  channel: z.literal("internet_banking"),
  action: z.enum(["intra_transfer", "bill_payment", "loan_repayment", "deposit_topup"]),
  amount: z.number().positive(),
  currency: z.string().length(3),
  source_account: z.string(),
  destination_account: z.string().optional(),
  biller_code: z.string().optional(),
  reference_note: z.string().max(120).optional(),
  device_fingerprint: z.string().min(6),
  otp_verified: z.boolean(),
});
export const IbResponse = z.object({
  status: z.literal("posted"),
  reference: z.string(),
  posted_at: IsoDateTime,
  new_balance: z.number(),
  currency: z.string().length(3),
});

// CRIB
export const CribRequest = z.object({
  national_id: z.string().min(6).max(20),
  purpose: z.enum(["loan_application", "credit_review", "monitoring"]),
  consent_reference: z.string().min(4).max(80),
});
export const CribResponse = z.object({
  status: z.literal("ok"),
  national_id: z.string(),
  score: z.number().int(),
  band: z.string(),
  active_facilities: z.number().int().nonnegative(),
  delinquencies_12m: z.number().int().nonnegative(),
  report_generated_at: IsoDateTime,
  report_url: z.string().url(),
});

// Clients · create
export const ClientCreateRequest = z.object({
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  phone_country_code: z.string().trim().min(1).max(6),
  phone: z.string().trim().min(6).max(20),
  national_id: z.string().trim().min(4).max(30),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(["male", "female", "other"]),
  address: z.string().trim().min(3).max(200),
  gn_division: z.string().trim().min(1).max(80),
  divisional_secretariat: z.string().trim().min(1).max(80),
  district: z.string().trim().min(1).max(80),
  province: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255).optional(),
  photo_url: z.string().trim().url().max(500).optional(),
  geo_lat: z.number().min(-90).max(90).optional(),
  geo_lng: z.number().min(-180).max(180).optional(),
  branch_id: z.string().uuid().optional(),
  group_id: z.string().uuid().optional(),
  is_introducer: z.boolean().optional(),
  default_commission_pct: z.number().min(0).max(100).optional(),
  default_commission_amount: z.number().min(0).optional(),
  bank_accounts: z
    .array(
      z.object({
        bank_name: z.string().trim().min(1).max(120),
        branch_name: z.string().trim().max(120).optional(),
        account_no: z.string().trim().min(1).max(60),
        account_name: z.string().trim().min(1).max(120),
        swift_code: z.string().trim().max(30).optional(),
        is_primary: z.boolean().optional(),
      }),
    )
    .max(10)
    .optional(),
});
export const ClientCreateResponse = z.object({
  status: z.literal("created"),
  client_id: z.string().uuid(),
  full_name: z.string(),
  phone: z.string(),
  national_id: z.string(),
  branch_id: z.string().uuid(),
  status_code: z.string(),
  created_at: IsoDateTime,
});

// Clients · update (PATCH)
export const ClientUpdateRequest = z
  .object({
    first_name: z.string().trim().min(1).max(60).optional(),
    last_name: z.string().trim().min(1).max(60).optional(),
    phone_country_code: z.string().trim().min(1).max(6).optional(),
    phone: z.string().trim().min(6).max(20).optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    address: z.string().trim().min(3).max(200).optional(),
    gn_division: z.string().trim().min(1).max(80).optional(),
    divisional_secretariat: z.string().trim().min(1).max(80).optional(),
    district: z.string().trim().min(1).max(80).optional(),
    province: z.string().trim().min(1).max(80).optional(),
    photo_url: z.string().trim().url().max(500).nullable().optional(),
    geo_lat: z.number().min(-90).max(90).nullable().optional(),
    geo_lng: z.number().min(-180).max(180).nullable().optional(),
    status: z.enum(["active", "inactive", "blacklisted"]).optional(),
    is_introducer: z.boolean().optional(),
    default_commission_pct: z.number().min(0).max(100).nullable().optional(),
    default_commission_amount: z.number().min(0).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field required" });
export const ClientUpdateResponse = z.object({
  status: z.literal("updated"),
  client_id: z.string().uuid(),
  full_name: z.string(),
  phone: z.string().nullable(),
  updated_fields: z.array(z.string()),
  updated_at: IsoDateTime,
});

// Clients · bank accounts
export const ClientBankAccountCreateRequest = z.object({
  bank_name: z.string().trim().min(1).max(120),
  branch_name: z.string().trim().max(120).optional(),
  account_no: z.string().trim().min(1).max(60),
  account_name: z.string().trim().min(1).max(120),
  swift_code: z.string().trim().max(30).optional(),
  is_primary: z.boolean().optional(),
});
export const ClientBankAccountResponse = z.object({
  status: z.literal("created"),
  bank_account_id: z.string().uuid(),
  client_id: z.string().uuid(),
  bank_name: z.string(),
  account_no: z.string(),
  is_primary: z.boolean(),
  created_at: IsoDateTime,
});
export const ClientBankAccountDeleteResponse = z.object({
  status: z.literal("deleted"),
  bank_account_id: z.string().uuid(),
  client_id: z.string().uuid(),
});

// Loans · repayments · create
export const RepaymentCreateRequest = z.object({
  amount: z.number().positive().max(1e12),
  channel: z.enum(["cash", "bank_transfer", "cheque", "sdf", "wallet", "other"]),
  reference: z.string().trim().max(80).optional(),
  received_at: IsoDateTime.optional(),
  notes: z.string().trim().max(300).optional(),
});
export const RepaymentCreateResponse = z.object({
  status: z.literal("recorded"),
  repayment_id: z.string().uuid().nullable(),
  loan_id: z.string().uuid(),
  reference: z.string().nullable(),
  received_at: IsoDateTime,
  business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number(),
  channel: z.string(),
  allocated_fees: z.number(),
  allocated_interest: z.number(),
  allocated_principal: z.number(),
  unallocated_amount: z.number(),
  loan_closed: z.boolean(),
  idempotent_replay: z.boolean(),
});

// Loan applications · create
export const LoanApplicationCreateRequest = z.object({
  branch_id: z.string().uuid(),
  client_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  officer_id: z.string().uuid().optional(),
  requested_principal: z.number().nonnegative(),
  requested_tenor_months: z.number().int().positive().max(600),
  requested_rate_pct: z.number().min(0).max(200).optional(),
  frequency: z
    .enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "semi_annual", "annual", "bullet"])
    .optional(),
  currency: z.string().length(3).optional(),
  purpose: z.string().trim().max(500).optional(),
  channel: z.string().trim().max(60).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export const LoanApplicationCreateResponse = z.object({
  status: z.literal("created"),
  application_id: z.string().uuid(),
  application_no: z.string(),
  branch_id: z.string().uuid(),
  client_id: z.string().uuid().nullable(),
  product_id: z.string().uuid().nullable(),
  requested_principal: z.number(),
  requested_tenor_months: z.number().int(),
  currency: z.string().length(3),
  status_code: z.string(),
  created_at: IsoDateTime,
});

// Loan application · child rows
export const LoanApplicationApplicantRequest = z.object({
  role: z.enum(["primary", "co_applicant", "spouse", "other"]).default("primary"),
  client_id: z.string().uuid().optional(),
  full_name: z.string().trim().min(1).max(160),
  national_id: z.string().trim().max(30).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(255).optional(),
  address: z.string().trim().max(300).optional(),
  snapshot: z.record(z.string(), z.any()).optional(),
});
export const LoanApplicationBusinessRequest = z.object({
  business_name: z.string().trim().max(160).optional(),
  sector: z.string().trim().max(80).optional(),
  years_in_operation: z.number().nonnegative().optional(),
  monthly_turnover: z.number().nonnegative().optional(),
  ownership_type: z.string().trim().max(60).optional(),
  registration_no: z.string().trim().max(60).optional(),
  business_address: z.string().trim().max(300).optional(),
  extra: z.record(z.string(), z.any()).optional(),
});
export const LoanApplicationEmploymentRequest = z.object({
  employer_name: z.string().trim().max(160).optional(),
  position: z.string().trim().max(120).optional(),
  employment_type: z.string().trim().max(60).optional(),
  monthly_income: z.number().nonnegative().optional(),
  years_of_service: z.number().nonnegative().optional(),
  employer_address: z.string().trim().max(300).optional(),
  employer_phone: z.string().trim().max(30).optional(),
  extra: z.record(z.string(), z.any()).optional(),
});
export const LoanApplicationCollateralRequest = z.object({
  security_type_id: z.string().uuid().optional(),
  values: z.record(z.string(), z.any()).default({}),
  documents: z.array(z.record(z.string(), z.any())).default([]),
  notes: z.string().trim().max(500).optional(),
});
export const LoanApplicationGuarantorRequest = z.object({
  guarantor_client_id: z.string().uuid().optional(),
  full_name: z.string().trim().min(1).max(160),
  national_id: z.string().trim().max(30).optional(),
  phone: z.string().trim().max(30).optional(),
  relationship: z.string().trim().max(80).optional(),
  coverage_amount: z.number().nonnegative().optional(),
  extra: z.record(z.string(), z.any()).optional(),
});
export const LoanApplicationExistingFacilityRequest = z.object({
  lender_name: z.string().trim().min(1).max(160),
  facility_type: z.string().trim().max(80).optional(),
  original_amount: z.number().nonnegative().optional(),
  outstanding_balance: z.number().nonnegative().optional(),
  monthly_instalment: z.number().nonnegative().optional(),
  maturity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.string().trim().max(40).optional(),
  extra: z.record(z.string(), z.any()).optional(),
});
export const LoanApplicationNoteRequest = z.object({
  note: z.string().trim().min(1).max(2000),
});
export const LoanApplicationChildResponse = z.object({
  status: z.literal("created"),
  id: z.string().uuid(),
  application_id: z.string().uuid(),
  application_no: z.string(),
  created_at: IsoDateTime,
});

// Loan application · submit
export const LoanApplicationSubmitRequest = z.object({
  workflow_definition_key: z.string().trim().max(80).optional(),
  transition_key: z.string().trim().max(80).optional(),
});
export const LoanApplicationSubmitResponse = z.object({
  status: z.literal("submitted"),
  application_id: z.string().uuid(),
  application_no: z.string(),
  status_code: z.string(),
  submitted_at: IsoDateTime,
});

// Loan application · decide (approve / reject)
export const LoanApplicationDecideRequest = z.object({
  decision: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(1000).optional(),
  step_key: z.string().trim().max(80).optional(),
  workflow_instance_id: z.string().uuid().optional(),
  transition_key: z.string().trim().max(80).optional(),
});
export const LoanApplicationDecideResponse = z.object({
  status: z.literal("decided"),
  application_id: z.string().uuid(),
  application_no: z.string(),
  decision: z.enum(["approve", "reject"]),
  status_code: z.string(),
  decided_at: IsoDateTime,
});

// Loan application · return-for-changes
export const LoanApplicationReturnRequest = z.object({
  reason: z.string().trim().min(1).max(1000),
  transition_key: z.string().trim().max(80).optional(),
});
export const LoanApplicationReturnResponse = z.object({
  status: z.literal("returned"),
  application_id: z.string().uuid(),
  application_no: z.string(),
  status_code: z.string(),
  returned_at: IsoDateTime,
});

// Loan application · cancel
export const LoanApplicationCancelRequest = z.object({
  reason: z.string().trim().min(1).max(1000),
  transition_key: z.string().trim().max(80).optional(),
});
export const LoanApplicationCancelResponse = z.object({
  status: z.literal("cancelled"),
  application_id: z.string().uuid(),
  application_no: z.string(),
  status_code: z.string(),
  cancelled_at: IsoDateTime,
});

// Loan application · disburse
export const LoanApplicationDisburseRequest = z.object({
  payment_channel: z
    .enum(["cash", "bank_transfer", "cheque", "sdf", "wallet", "fund_transfer", "other"])
    .optional(),
  payment_reference: z.string().trim().max(120).optional(),
});
export const LoanApplicationDisburseResponse = z.object({
  status: z.literal("disbursed"),
  application_id: z.string().uuid(),
  application_no: z.string(),
  loan_id: z.string().uuid(),
  contract_no: z.string().nullable(),
  status_code: z.string(),
  disbursed_at: IsoDateTime,
  idempotent_replay: z.boolean(),
});

// Health
export const HealthResponse = z.object({
  status: z.literal("ok"),
  time: IsoDateTime,
  version: z.literal("v1"),
});

// ---------- Webhook deliveries ----------
export const WebhookDeliveryRow = z.object({
  id: z.string().uuid(),
  endpoint_id: z.string().uuid(),
  env: z.enum(["sandbox", "production"]),
  event_id: z.string().uuid().nullable(),
  event_type: z.string(),
  attempt: z.number().int(),
  status: z.enum(["pending", "delivered", "failed", "dead"]),
  status_code: z.number().int().nullable(),
  response_ms: z.number().int().nullable(),
  response_snippet: z.string().nullable(),
  next_retry_at: IsoDateTime.nullable(),
  created_at: IsoDateTime,
});
export const WebhookDeliveryListResponse = z.object({
  data: z.array(WebhookDeliveryRow),
  next_cursor: z.string().nullable(),
});
export const WebhookDeliveryDetail = WebhookDeliveryRow.extend({
  payload: z.record(z.string(), z.unknown()).nullable(),
});
export const WebhookReplayResponse = z.object({
  status: z.literal("requeued"),
  original_id: z.string().uuid(),
  new_delivery_id: z.string().uuid(),
  event_type: z.string(),
  endpoint_id: z.string().uuid(),
});

// ---------- Convenience: full auth-fail logging wrapper ----------
export async function logAndReturnAuthError(args: {
  status: number;
  error: string;
  channel: string;
  endpoint: string;
  direction: "inbound" | "outbound";
}): Promise<Response> {
  await logApiCall({
    company_id: null,
    api_key_id: null,
    channel: args.channel,
    direction: args.direction,
    endpoint: args.endpoint,
    method: "POST",
    status_code: args.status,
    error: args.error,
  });
  return errJson({
    code: args.status,
    error: args.status === 401 ? "unauthorized" : "forbidden",
    message: args.error,
  });
}
