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
  validation_failed: { code: 400, error: "validation_failed", message: "Request body failed schema validation." },
  missing_header: (name: string) => ({ code: 400, error: "missing_header", message: `Required header "${name}" is missing.` }),
  idempotency_conflict: { code: 409, error: "idempotency_conflict", message: "Idempotency-Key reused with a different request body." },
  response_shape: { code: 500, error: "internal_error", message: "Server produced a response that failed its own schema check." },
} as const;

export function errJson(e: { code: number; error: string; message: string; details?: unknown }, details?: unknown): Response {
  const body: ApiError = { error: e.error, message: e.message, ...(details ? { details } : e.details ? { details: e.details } : {}) };
  return json(body, e.code);
}

// ---------- Header helpers ----------
export function requireHeader(request: Request, name: string): { ok: true; value: string } | { ok: false; response: Response } {
  const v = request.headers.get(name);
  if (!v || !v.trim()) return { ok: false, response: errJson(ERRORS.missing_header(name)) };
  return { ok: true, value: v.trim() };
}

// ---------- JSON body parse + validate ----------
export async function parseJsonBody<T extends ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T>; raw: unknown } | { ok: false; response: Response; raw: unknown }> {
  let raw: unknown;
  try { raw = await request.json(); } catch { return { ok: false, response: errJson(ERRORS.invalid_json), raw: null }; }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: errJson(ERRORS.validation_failed, parsed.error.flatten()), raw };
  return { ok: true, data: parsed.data, raw };
}

// ---------- Response validation ----------
// Every route validates its own JSON response before returning it, so a
// contract drift (typo, missing field) surfaces as a 500 in tests rather
// than silently shipping the wrong shape.
export function validateAndSend<T extends ZodTypeAny>(schema: T, body: z.infer<T>, status: number): Response {
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
  | { kind: "miss" }
  | { kind: "replay"; status: number; response: unknown }
  | { kind: "conflict" }
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
  value_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

// Health
export const HealthResponse = z.object({
  status: z.literal("ok"),
  time: IsoDateTime,
  version: z.literal("v1"),
});

// ---------- Convenience: full auth-fail logging wrapper ----------
export async function logAndReturnAuthError(args: {
  status: number; error: string; channel: string; endpoint: string; direction: "inbound" | "outbound";
}): Promise<Response> {
  await logApiCall({
    company_id: null, api_key_id: null, channel: args.channel, direction: args.direction,
    endpoint: args.endpoint, method: "POST", status_code: args.status, error: args.error,
  });
  return errJson({ code: args.status, error: args.status === 401 ? "unauthorized" : "forbidden", message: args.error });
}
