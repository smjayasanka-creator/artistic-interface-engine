// Central contract registry for the API & Integration Hub.
//
// One entry per public endpoint. Both the UI (API explorer, Data catalogue,
// Field mapping studio, OpenAPI generator) and route handlers read from this
// registry so the docs and the wire contract cannot drift.
//
// Zod request/response schemas are re-exported from api-schemas.server.ts —
// this file adds transport metadata (path, method, scope, direction,
// field-level docs, error catalogue) but never duplicates the schemas.

import type { ZodTypeAny } from "zod";
import {
  AtmRequest,
  AtmResponse,
  CeftRequest,
  CeftResponse,
  ClientCreateRequest,
  ClientCreateResponse,
  CribRequest,
  CribResponse,
  HealthResponse,
  IbRequest,
  IbResponse,
  TransactionsInboundRequest,
  TransactionsInboundResponse,
  TransactionsOutboundRequest,
  TransactionsOutboundResponse,
} from "@/lib/api-schemas.server";

export type ApiScope =
  | "transactions.inbound"
  | "transactions.outbound"
  | "ceft"
  | "atm"
  | "internet_banking"
  | "crib"
  | "clients.create";

export type ApiDirection = "inbound" | "outbound" | "bi";
export type ApiStatus = "live" | "planned";
export type ApiResource =
  | "clients"
  | "loans"
  | "loan_applications"
  | "repayments"
  | "savings"
  | "fixed_deposits"
  | "payments"
  | "workflow"
  | "events"
  | "reference"
  | "system";

export type ApiFieldDoc = {
  path: string;
  label: string;
  type: string;
  required?: boolean;
  sensitive?: boolean;
  inbound?: boolean;
  outbound?: boolean;
  notes?: string;
};

export type ApiErrorDoc = {
  code: number;
  error: string;
  meaning: string;
};

export type ApiContract = {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  resource: ApiResource;
  title: string;
  summary: string;
  scope: ApiScope | null; // null → no auth (e.g. health)
  direction: ApiDirection;
  status: ApiStatus;
  requiresIdempotency: boolean;
  request?: ZodTypeAny;
  response?: ZodTypeAny;
  requestExample?: unknown;
  responseExample?: unknown;
  fields: ApiFieldDoc[];
  errors: ApiErrorDoc[];
  webhookEvents?: string[];
};

const COMMON_ERRORS: ApiErrorDoc[] = [
  { code: 400, error: "invalid_json", meaning: "Request body could not be parsed as JSON." },
  {
    code: 400,
    error: "validation_failed",
    meaning: "Request body did not match the endpoint schema. `details` lists the offending fields.",
  },
  { code: 401, error: "unauthorized", meaning: "Missing or invalid API key." },
  { code: 403, error: "forbidden", meaning: "Key is valid but lacks the required scope." },
  { code: 429, error: "rate_limited", meaning: "Request rate exceeded for this API key." },
  { code: 500, error: "internal_error", meaning: "Unexpected server error. Retry with backoff." },
];

export const API_CONTRACTS: ApiContract[] = [
  {
    id: "health",
    method: "GET",
    path: "/api/public/v1/health",
    resource: "system",
    title: "Health check",
    summary: "Liveness probe used by monitoring and integration setup wizards.",
    scope: null,
    direction: "outbound",
    status: "live",
    requiresIdempotency: false,
    response: HealthResponse,
    responseExample: { status: "ok", time: "2026-07-21T00:00:00.000Z", version: "v1" },
    fields: [],
    errors: [],
  },
  {
    id: "clients.create",
    method: "POST",
    path: "/api/public/v1/clients/create",
    resource: "clients",
    title: "Create client",
    summary:
      "Onboard a customer from an external origination channel (mobile app, LOS, CRM). Deduplicated by national_id + Idempotency-Key.",
    scope: "clients.create",
    direction: "inbound",
    status: "live",
    requiresIdempotency: true,
    request: ClientCreateRequest,
    response: ClientCreateResponse,
    fields: [
      { path: "first_name", label: "First name", type: "string", required: true, inbound: true },
      { path: "last_name", label: "Last name", type: "string", required: true, inbound: true },
      {
        path: "national_id",
        label: "National ID",
        type: "string",
        required: true,
        sensitive: true,
        inbound: true,
      },
      {
        path: "phone",
        label: "Mobile number",
        type: "string",
        required: true,
        sensitive: true,
        inbound: true,
      },
      { path: "date_of_birth", label: "Date of birth", type: "date", required: true, inbound: true },
      { path: "gender", label: "Gender", type: "enum", required: true, inbound: true },
      { path: "address", label: "Address", type: "string", required: true, inbound: true },
      { path: "branch_id", label: "Branch", type: "uuid", inbound: true },
      { path: "bank_accounts", label: "Bank accounts", type: "array", inbound: true },
      { path: "client_id", label: "Client ID", type: "uuid", outbound: true },
      { path: "status_code", label: "Client status", type: "string", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      {
        code: 409,
        error: "duplicate_client",
        meaning: "A client with the same national_id already exists in this company.",
      },
      {
        code: 422,
        error: "branch_not_found",
        meaning: "branch_id does not belong to this company or is deactivated.",
      },
    ],
    webhookEvents: ["client.created"],
  },
  {
    id: "transactions.inbound",
    method: "POST",
    path: "/api/public/v1/transactions/inbound",
    resource: "payments",
    title: "Register inbound transaction",
    summary: "Notify the platform of funds received from an external source (SLIPS, remittance, bank transfer).",
    scope: "transactions.inbound",
    direction: "inbound",
    status: "live",
    requiresIdempotency: true,
    request: TransactionsInboundRequest,
    response: TransactionsInboundResponse,
    fields: [
      { path: "external_reference", label: "External reference", type: "string", required: true, inbound: true },
      { path: "amount", label: "Amount", type: "number", required: true, inbound: true },
      { path: "currency", label: "Currency (ISO-4217)", type: "string", required: true, inbound: true },
      { path: "counterparty.name", label: "Counterparty name", type: "string", required: true, inbound: true },
      { path: "counterparty.account", label: "Counterparty account", type: "string", required: true, sensitive: true, inbound: true },
      { path: "reference", label: "Platform reference", type: "string", outbound: true },
    ],
    errors: COMMON_ERRORS,
    webhookEvents: ["payment.completed"],
  },
  {
    id: "transactions.outbound",
    method: "POST",
    path: "/api/public/v1/transactions/outbound",
    resource: "payments",
    title: "Queue outbound transaction",
    summary: "Instruct the platform to send funds to an external beneficiary. Idempotent by idempotency_key.",
    scope: "transactions.outbound",
    direction: "outbound",
    status: "live",
    requiresIdempotency: true,
    request: TransactionsOutboundRequest,
    response: TransactionsOutboundResponse,
    fields: [
      { path: "source_account", label: "Source account", type: "string", required: true, sensitive: true, inbound: true },
      { path: "destination.account", label: "Destination account", type: "string", required: true, sensitive: true, inbound: true },
      { path: "amount", label: "Amount", type: "number", required: true, inbound: true },
      { path: "currency", label: "Currency", type: "string", required: true, inbound: true },
      { path: "idempotency_key", label: "Idempotency key", type: "string", required: true, inbound: true },
      { path: "reference", label: "Platform reference", type: "string", outbound: true },
    ],
    errors: COMMON_ERRORS,
    webhookEvents: ["payment.completed", "payment.failed"],
  },
  {
    id: "ceft",
    method: "POST",
    path: "/api/public/v1/ceft/transfer",
    resource: "payments",
    title: "CEFTS transfer",
    summary: "Post a CEFT credit/debit clearing entry against a beneficiary at another bank.",
    scope: "ceft",
    direction: "bi",
    status: "live",
    requiresIdempotency: true,
    request: CeftRequest,
    response: CeftResponse,
    fields: [
      { path: "transaction_type", label: "Transaction type", type: "enum", required: true, inbound: true },
      { path: "amount", label: "Amount", type: "number", required: true, inbound: true },
      { path: "session_id", label: "Session ID", type: "string", required: true, inbound: true },
      { path: "originator.account", label: "Originator account", type: "string", required: true, sensitive: true, inbound: true },
      { path: "beneficiary.account", label: "Beneficiary account", type: "string", required: true, sensitive: true, inbound: true },
      { path: "ceft_reference", label: "CEFT reference", type: "string", outbound: true },
    ],
    errors: COMMON_ERRORS,
  },
  {
    id: "atm",
    method: "POST",
    path: "/api/public/v1/atm/authorize",
    resource: "payments",
    title: "ATM authorization",
    summary: "Authorize an ATM withdrawal, balance inquiry, or mini statement request.",
    scope: "atm",
    direction: "bi",
    status: "live",
    requiresIdempotency: true,
    request: AtmRequest,
    response: AtmResponse,
    fields: [
      { path: "terminal_id", label: "Terminal ID", type: "string", required: true, inbound: true },
      { path: "card_pan_masked", label: "Card PAN (masked)", type: "string", required: true, sensitive: true, inbound: true },
      { path: "transaction_type", label: "Transaction type", type: "enum", required: true, inbound: true },
      { path: "amount", label: "Amount", type: "number", required: true, inbound: true },
      { path: "stan", label: "STAN", type: "string", required: true, inbound: true },
      { path: "authorization_code", label: "Authorization code", type: "string", outbound: true },
      { path: "balance_after", label: "Balance after", type: "number", outbound: true },
    ],
    errors: COMMON_ERRORS,
  },
  {
    id: "internet_banking",
    method: "POST",
    path: "/api/public/v1/ib/transaction",
    resource: "payments",
    title: "Internet banking transaction",
    summary: "Post a self-service transaction from the internet banking / mobile channel.",
    scope: "internet_banking",
    direction: "bi",
    status: "live",
    requiresIdempotency: true,
    request: IbRequest,
    response: IbResponse,
    fields: [
      { path: "customer_id", label: "Customer ID", type: "string", required: true, inbound: true },
      { path: "action", label: "Action", type: "enum", required: true, inbound: true },
      { path: "amount", label: "Amount", type: "number", required: true, inbound: true },
      { path: "source_account", label: "Source account", type: "string", required: true, sensitive: true, inbound: true },
      { path: "otp_verified", label: "OTP verified", type: "boolean", required: true, inbound: true },
      { path: "new_balance", label: "New balance", type: "number", outbound: true },
    ],
    errors: COMMON_ERRORS,
  },
  {
    id: "crib",
    method: "POST",
    path: "/api/public/v1/crib/report",
    resource: "reference",
    title: "CRIB report lookup",
    summary: "Retrieve a customer's credit bureau (CRIB) report for loan origination or monitoring.",
    scope: "crib",
    direction: "outbound",
    status: "live",
    requiresIdempotency: false,
    request: CribRequest,
    response: CribResponse,
    fields: [
      { path: "national_id", label: "National ID", type: "string", required: true, sensitive: true, inbound: true },
      { path: "purpose", label: "Purpose", type: "enum", required: true, inbound: true },
      { path: "consent_reference", label: "Consent reference", type: "string", required: true, inbound: true },
      { path: "score", label: "Credit score", type: "int", outbound: true },
      { path: "band", label: "Risk band", type: "string", outbound: true },
      { path: "report_url", label: "Report URL", type: "url", outbound: true, sensitive: true },
    ],
    errors: COMMON_ERRORS,
  },
];

export function getContractById(id: string): ApiContract | undefined {
  return API_CONTRACTS.find((c) => c.id === id);
}

export function getContractByPath(method: string, path: string): ApiContract | undefined {
  return API_CONTRACTS.find(
    (c) => c.method === method.toUpperCase() && c.path === path,
  );
}

export function contractsByResource(): Record<ApiResource, ApiContract[]> {
  return API_CONTRACTS.reduce(
    (acc, c) => {
      (acc[c.resource] ||= []).push(c);
      return acc;
    },
    {} as Record<ApiResource, ApiContract[]>,
  );
}
