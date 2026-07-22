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
  ClientBankAccountCreateRequest,
  ClientBankAccountDeleteResponse,
  ClientBankAccountResponse,
  ClientCreateRequest,
  ClientCreateResponse,
  ClientUpdateRequest,
  ClientUpdateResponse,
  CribRequest,
  CribResponse,
  HealthResponse,
  IbRequest,
  IbResponse,
  LoanApplicationApplicantRequest,
  LoanApplicationBusinessRequest,
  LoanApplicationCancelRequest,
  LoanApplicationCancelResponse,
  LoanApplicationChildResponse,
  LoanApplicationCollateralRequest,
  LoanApplicationCreateRequest,
  LoanApplicationCreateResponse,
  LoanApplicationDecideRequest,
  LoanApplicationDecideResponse,
  LoanApplicationDisburseRequest,
  LoanApplicationDisburseResponse,
  LoanApplicationEmploymentRequest,
  LoanApplicationExistingFacilityRequest,
  LoanApplicationGuarantorRequest,
  LoanApplicationNoteRequest,
  LoanApplicationReturnRequest,
  LoanApplicationReturnResponse,
  LoanApplicationSubmitRequest,
  LoanApplicationSubmitResponse,
  RepaymentCreateRequest,
  RepaymentCreateResponse,
  TransactionsInboundRequest,
  TransactionsInboundResponse,
  TransactionsOutboundRequest,
  TransactionsOutboundResponse,
  WebhookDeliveryDetail,
  WebhookDeliveryListResponse,
  WebhookReplayResponse,
  DomainEventDetail,
  DomainEventListResponse,
} from "@/lib/api-schemas.server";

export type ApiScope =
  | "transactions.inbound"
  | "transactions.outbound"
  | "ceft"
  | "atm"
  | "internet_banking"
  | "crib"
  | "clients.create"
  | "clients.read"
  | "clients.write"
  | "loans.read"
  | "loans.repayments.write"
  | "loan_applications.write"
  | "loan_applications.read"
  | "savings.read"
  | "fixed_deposits.read"
  | "events.read"
  | "webhooks.read"
  | "webhooks.replay";

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
  | "webhooks"
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
  {
    id: "clients.list",
    method: "GET",
    path: "/api/public/v1/clients",
    resource: "clients",
    title: "List clients",
    summary:
      "Cursor-paginated list of clients belonging to the API key's company. Ordered by newest first.",
    scope: "clients.read",
    direction: "outbound",
    status: "live",
    requiresIdempotency: false,
    responseExample: {
      data: [
        {
          id: "0d7f…",
          full_name: "Nimal Perera",
          phone: "+94771234567",
          national_id: "199012345V",
          branch_id: "…",
          status: "active",
          created_at: "2026-07-21T12:00:00.000Z",
        },
      ],
      next_cursor: "2026-07-21T12:00:00.000Z",
    },
    fields: [
      { path: "cursor", label: "Cursor", type: "string", inbound: true, notes: "Pass next_cursor from a previous page." },
      { path: "limit", label: "Limit", type: "int", inbound: true, notes: "Default 50, max 200." },
      { path: "data", label: "Clients", type: "array", outbound: true },
      { path: "next_cursor", label: "Next cursor", type: "string", outbound: true },
    ],
    errors: COMMON_ERRORS,
  },
  {
    id: "clients.get",
    method: "GET",
    path: "/api/public/v1/clients/{id}",
    resource: "clients",
    title: "Get client",
    summary:
      "Fetch a single client by id. Returns 404 for ids belonging to another company (no cross-tenant enumeration).",
    scope: "clients.read",
    direction: "outbound",
    status: "live",
    requiresIdempotency: false,
    responseExample: {
      id: "0d7f…",
      full_name: "Nimal Perera",
      phone: "+94771234567",
      national_id: "199012345V",
      branch_id: "…",
      status: "active",
      created_at: "2026-07-21T12:00:00.000Z",
    },
    fields: [
      { path: "id", label: "Client ID", type: "uuid", required: true, inbound: true },
      { path: "full_name", label: "Full name", type: "string", outbound: true },
      { path: "phone", label: "Mobile number", type: "string", sensitive: true, outbound: true },
      { path: "national_id", label: "National ID", type: "string", sensitive: true, outbound: true },
      { path: "branch_id", label: "Branch", type: "uuid", outbound: true },
      { path: "status", label: "Client status", type: "string", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "No client with this id in the caller's company." },
    ],
  },
  {
    id: "clients.update",
    method: "PATCH",
    path: "/api/public/v1/clients/{id}",
    resource: "clients",
    title: "Update client",
    summary:
      "Partial update of mutable client fields (contact, address, status, commission). Only supplied keys are changed; full_name and canonical phone are recomputed automatically when name or phone components change. Fires client.updated webhook.",
    scope: "clients.write",
    direction: "inbound",
    status: "live",
    requiresIdempotency: false,
    request: ClientUpdateRequest,
    response: ClientUpdateResponse,
    requestExample: { phone: "771234599", address: "22 New Road, Colombo", status: "active" },
    responseExample: {
      status: "updated",
      client_id: "0d7f…",
      full_name: "Nimal Perera",
      phone: "+94771234599",
      updated_fields: ["phone", "address", "status"],
      updated_at: "2026-07-22T11:00:00.000Z",
    },
    fields: [
      { path: "id", label: "Client id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
      { path: "first_name", label: "First name", type: "string", inbound: true },
      { path: "last_name", label: "Last name", type: "string", inbound: true },
      { path: "phone_country_code", label: "Phone country code", type: "string", inbound: true, sensitive: true },
      { path: "phone", label: "Mobile number", type: "string", inbound: true, sensitive: true },
      { path: "email", label: "Email", type: "string", inbound: true },
      { path: "address", label: "Address", type: "string", inbound: true },
      { path: "status", label: "Status", type: "enum", inbound: true, notes: "active | inactive | blacklisted" },
      { path: "is_introducer", label: "Introducer flag", type: "boolean", inbound: true },
      { path: "updated_fields", label: "Fields that were updated", type: "array", outbound: true },
      { path: "updated_at", label: "Updated at", type: "datetime", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "Client not found in caller's company." },
      { code: 500, error: "update_failed", meaning: "Database rejected the update." },
    ],
    webhookEvents: ["client.updated"],
  },
  {
    id: "clients.bank_accounts.add",
    method: "POST",
    path: "/api/public/v1/clients/{id}/bank-accounts",
    resource: "clients",
    title: "Add client bank account",
    summary:
      "Attach a bank account to a client. When is_primary=true, previous primaries on this client are demoted so exactly one remains.",
    scope: "clients.write",
    direction: "inbound",
    status: "live",
    requiresIdempotency: false,
    request: ClientBankAccountCreateRequest,
    response: ClientBankAccountResponse,
    requestExample: {
      bank_name: "Commercial Bank",
      branch_name: "Colombo Main",
      account_no: "8001234567",
      account_name: "Nimal Perera",
      is_primary: true,
    },
    responseExample: {
      status: "created",
      bank_account_id: "aa11…",
      client_id: "0d7f…",
      bank_name: "Commercial Bank",
      account_no: "8001234567",
      is_primary: true,
      created_at: "2026-07-22T11:05:00.000Z",
    },
    fields: [
      { path: "id", label: "Client id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
      { path: "bank_name", label: "Bank name", type: "string", required: true, inbound: true },
      { path: "branch_name", label: "Branch name", type: "string", inbound: true },
      { path: "account_no", label: "Account number", type: "string", required: true, sensitive: true, inbound: true },
      { path: "account_name", label: "Account name", type: "string", required: true, inbound: true },
      { path: "swift_code", label: "SWIFT / BIC", type: "string", inbound: true },
      { path: "is_primary", label: "Is primary", type: "boolean", inbound: true },
      { path: "bank_account_id", label: "New bank account id", type: "uuid", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "Client not found in caller's company." },
    ],
  },
  {
    id: "clients.bank_accounts.delete",
    method: "DELETE",
    path: "/api/public/v1/clients/{id}/bank-accounts/{bankAccountId}",
    resource: "clients",
    title: "Delete client bank account",
    summary:
      "Remove a bank account from a client. Both the client and the bank account must belong to the caller's company.",
    scope: "clients.write",
    direction: "inbound",
    status: "live",
    requiresIdempotency: false,
    response: ClientBankAccountDeleteResponse,
    responseExample: { status: "deleted", bank_account_id: "aa11…", client_id: "0d7f…" },
    fields: [
      { path: "id", label: "Client id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
      { path: "bankAccountId", label: "Bank account id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "Bank account not found for this client in caller's company." },
    ],
  },
  ...makeReadPair({
    resource: "loans",
    scope: "loans.read",
    id: "loans",
    label: "loan",
    listPath: "/api/public/v1/loans",
    getPath: "/api/public/v1/loans/{id}",
    example: {
      id: "0d7f…",
      contract_no: "LN00000123",
      application_no: "AP000045",
      client_id: "…",
      branch_id: "…",
      product_id: "…",
      principal: 500000,
      term_months: 24,
      annual_rate_pct: 18.5,
      frequency: "monthly",
      status: "active",
      disbursed_at: "2026-07-21T10:00:00.000Z",
      created_at: "2026-07-20T09:00:00.000Z",
    },
    outboundFields: [
      { path: "contract_no", label: "Contract no.", type: "string" },
      { path: "application_no", label: "Application no.", type: "string" },
      { path: "client_id", label: "Client", type: "uuid" },
      { path: "branch_id", label: "Branch", type: "uuid" },
      { path: "product_id", label: "Product", type: "uuid" },
      { path: "principal", label: "Principal", type: "number" },
      { path: "term_months", label: "Term (months)", type: "int" },
      { path: "annual_rate_pct", label: "Interest rate (%)", type: "number" },
      { path: "frequency", label: "Repayment frequency", type: "enum" },
      { path: "status", label: "Loan status", type: "string" },
      { path: "disbursed_at", label: "Disbursed at", type: "datetime" },
    ],
  }),
  ...makeReadPair({
    resource: "savings",
    scope: "savings.read",
    id: "savings",
    label: "savings account",
    listPath: "/api/public/v1/savings",
    getPath: "/api/public/v1/savings/{id}",
    example: {
      id: "0d7f…",
      account_no: "SA0000123",
      client_id: "…",
      branch_id: "…",
      product_id: "…",
      currency: "KES",
      balance: 12500,
      available_balance: 12500,
      status: "active",
      opened_on: "2026-07-21",
      created_at: "2026-07-21T10:00:00.000Z",
    },
    outboundFields: [
      { path: "account_no", label: "Account no.", type: "string" },
      { path: "client_id", label: "Client", type: "uuid" },
      { path: "branch_id", label: "Branch", type: "uuid" },
      { path: "product_id", label: "Product", type: "uuid" },
      { path: "currency", label: "Currency", type: "string" },
      { path: "balance", label: "Ledger balance", type: "number" },
      { path: "available_balance", label: "Available balance", type: "number" },
      { path: "status", label: "Account status", type: "string" },
      { path: "opened_on", label: "Opened on", type: "date" },
    ],
  }),
  ...makeReadPair({
    resource: "fixed_deposits",
    scope: "fixed_deposits.read",
    id: "fixed_deposits",
    label: "fixed deposit",
    listPath: "/api/public/v1/fixed-deposits",
    getPath: "/api/public/v1/fixed-deposits/{id}",
    example: {
      id: "0d7f…",
      certificate_no: "FD0000123",
      client_id: "…",
      branch_id: "…",
      product_id: "…",
      principal: 250000,
      tenure_months: 12,
      rate_at_booking: 12.5,
      value_date: "2026-07-21",
      maturity_date: "2027-07-21",
      status: "active",
      created_at: "2026-07-21T10:00:00.000Z",
    },
    outboundFields: [
      { path: "certificate_no", label: "Certificate no.", type: "string" },
      { path: "client_id", label: "Client", type: "uuid" },
      { path: "branch_id", label: "Branch", type: "uuid" },
      { path: "product_id", label: "Product", type: "uuid" },
      { path: "principal", label: "Principal", type: "number" },
      { path: "tenure_months", label: "Tenure (months)", type: "int" },
      { path: "rate_at_booking", label: "Rate at booking (%)", type: "number" },
      { path: "value_date", label: "Value date", type: "date" },
      { path: "maturity_date", label: "Maturity date", type: "date" },
      { path: "status", label: "FD status", type: "string" },
    ],
  }),
  ...makeReadPair({
    resource: "loan_applications",
    scope: "loan_applications.read",
    id: "loan_applications",
    label: "loan application",
    listPath: "/api/public/v1/loan-applications",
    getPath: "/api/public/v1/loan-applications/{id}",
    example: {
      id: "9f0e…",
      application_no: "AP000123",
      branch_id: "…",
      client_id: "…",
      product_id: "…",
      requested_principal: 500000,
      requested_tenor_months: 24,
      requested_rate_pct: 18.5,
      frequency: "monthly",
      currency: "KES",
      status: "draft",
      submitted_at: null,
      decided_at: null,
      disbursed_at: null,
      loan_id: null,
      created_at: "2026-07-22T09:30:00.000Z",
    },
    outboundFields: [
      { path: "application_no", label: "Application no.", type: "string" },
      { path: "branch_id", label: "Branch", type: "uuid" },
      { path: "client_id", label: "Client", type: "uuid" },
      { path: "product_id", label: "Product", type: "uuid" },
      { path: "requested_principal", label: "Requested principal", type: "number" },
      { path: "requested_tenor_months", label: "Requested tenor (months)", type: "int" },
      { path: "requested_rate_pct", label: "Requested rate (%)", type: "number" },
      { path: "frequency", label: "Repayment frequency", type: "enum" },
      { path: "currency", label: "Currency", type: "string" },
      { path: "status", label: "Application status", type: "string" },
      { path: "submitted_at", label: "Submitted at", type: "datetime" },
      { path: "decided_at", label: "Decided at", type: "datetime" },
      { path: "disbursed_at", label: "Disbursed at", type: "datetime" },
      { path: "loan_id", label: "Booked loan", type: "uuid" },
    ],
  }),
  {
    id: "loans.repayments.create",
    method: "POST",
    path: "/api/public/v1/loans/{id}/repayments",
    resource: "repayments",
    title: "Record a loan repayment",
    summary:
      "Post a repayment against a loan. Amount is allocated in the 3-pass order Fees → Interest → Principal. Idempotent when the caller supplies the Idempotency-Key header.",
    scope: "loans.repayments.write",
    direction: "inbound",
    status: "live",
    requiresIdempotency: true,
    request: RepaymentCreateRequest,
    response: RepaymentCreateResponse,
    requestExample: {
      amount: 25000,
      channel: "bank_transfer",
      reference: "TXN-2026-0001",
      received_at: "2026-07-22T09:30:00.000Z",
      notes: "July instalment",
    },
    responseExample: {
      status: "recorded",
      repayment_id: "6f2a…",
      loan_id: "0d7f…",
      reference: "TXN-2026-0001",
      received_at: "2026-07-22T09:30:00.000Z",
      business_date: "2026-07-22",
      amount: 25000,
      channel: "bank_transfer",
      allocated_fees: 500,
      allocated_interest: 4500,
      allocated_principal: 20000,
      unallocated_amount: 0,
      loan_closed: false,
      idempotent_replay: false,
    },
    fields: [
      { path: "id", label: "Loan id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
      { path: "amount", label: "Amount", type: "number", required: true, inbound: true },
      { path: "channel", label: "Payment channel", type: "enum", required: true, inbound: true, notes: "cash | bank_transfer | cheque | sdf | wallet | other" },
      { path: "reference", label: "External reference", type: "string", inbound: true },
      { path: "received_at", label: "Received at", type: "datetime", inbound: true, notes: "Defaults to now if omitted." },
      { path: "notes", label: "Notes", type: "string", inbound: true },
      { path: "repayment_id", label: "Repayment id", type: "uuid", outbound: true },
      { path: "allocated_fees", label: "Allocated to fees", type: "number", outbound: true },
      { path: "allocated_interest", label: "Allocated to interest", type: "number", outbound: true },
      { path: "allocated_principal", label: "Allocated to principal", type: "number", outbound: true },
      { path: "unallocated_amount", label: "Unallocated", type: "number", outbound: true, notes: "Overpayment held on the loan." },
      { path: "loan_closed", label: "Loan closed", type: "boolean", outbound: true },
      { path: "idempotent_replay", label: "Replay of prior request", type: "boolean", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "No loan with this id in the caller's company." },
      { code: 409, error: "loan_not_active", meaning: "Loan is not in a state that accepts repayments." },
      { code: 409, error: "idempotency_conflict", meaning: "Idempotency-Key was reused with a different body." },
    ],
    webhookEvents: ["repayment.recorded", "loan.closed"],
  },
  {
    id: "loan_applications.create",
    method: "POST",
    path: "/api/public/v1/loan-applications",
    resource: "loan_applications",
    title: "Create loan application",
    summary:
      "Create a loan application (master row) in draft status. Child data (applicant, business, employment, collateral, guarantors, documents) can be attached via subsequent updates or in-app. The application_no is generated server-side (AP000001…). Idempotent by Idempotency-Key.",
    scope: "loan_applications.write",
    direction: "inbound",
    status: "live",
    requiresIdempotency: true,
    request: LoanApplicationCreateRequest,
    response: LoanApplicationCreateResponse,
    requestExample: {
      branch_id: "0d7f…",
      client_id: "a1b2…",
      product_id: "c3d4…",
      requested_principal: 500000,
      requested_tenor_months: 24,
      requested_rate_pct: 18.5,
      frequency: "monthly",
      currency: "KES",
      purpose: "Working capital",
      channel: "mobile_app",
    },
    responseExample: {
      status: "created",
      application_id: "9f0e…",
      application_no: "AP000123",
      branch_id: "0d7f…",
      client_id: "a1b2…",
      product_id: "c3d4…",
      requested_principal: 500000,
      requested_tenor_months: 24,
      currency: "KES",
      status_code: "draft",
      created_at: "2026-07-22T09:30:00.000Z",
    },
    fields: [
      { path: "branch_id", label: "Branch", type: "uuid", required: true, inbound: true },
      { path: "client_id", label: "Client", type: "uuid", inbound: true },
      { path: "product_id", label: "Loan product", type: "uuid", inbound: true },
      { path: "officer_id", label: "Loan officer (staff)", type: "uuid", inbound: true },
      { path: "requested_principal", label: "Requested principal", type: "number", required: true, inbound: true },
      { path: "requested_tenor_months", label: "Requested tenor (months)", type: "int", required: true, inbound: true },
      { path: "requested_rate_pct", label: "Requested rate (%)", type: "number", inbound: true },
      { path: "frequency", label: "Repayment frequency", type: "enum", inbound: true, notes: "daily | weekly | biweekly | monthly | quarterly | semi_annual | annual | bullet" },
      { path: "currency", label: "Currency (ISO-4217)", type: "string", inbound: true, notes: "Defaults to KES." },
      { path: "purpose", label: "Purpose", type: "string", inbound: true },
      { path: "channel", label: "Origination channel", type: "string", inbound: true },
      { path: "metadata", label: "Metadata", type: "object", inbound: true, notes: "Free-form JSON attached to the application." },
      { path: "application_id", label: "Application id", type: "uuid", outbound: true },
      { path: "application_no", label: "Application no.", type: "string", outbound: true },
      { path: "status_code", label: "Application status", type: "string", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "branch_not_found", meaning: "branch_id does not belong to the caller's company." },
      { code: 404, error: "client_not_found", meaning: "client_id does not belong to the caller's company." },
      { code: 409, error: "idempotency_conflict", meaning: "Idempotency-Key was reused with a different body." },
    ],
    webhookEvents: ["loan_application.created"],
  },
  ...makeApplicationChild({
    id: "loan_applications.applicants.add",
    slug: "applicants",
    title: "Attach applicant to loan application",
    request: LoanApplicationApplicantRequest,
    idempotent: true,
    example: { role: "primary", full_name: "Nimal Perera", national_id: "199012345V", phone: "+94771234567" },
    fields: [
      { path: "role", label: "Role", type: "enum", inbound: true, notes: "primary | co_applicant | spouse | other" },
      { path: "client_id", label: "Client (optional link)", type: "uuid", inbound: true },
      { path: "full_name", label: "Full name", type: "string", required: true, inbound: true },
      { path: "national_id", label: "National ID", type: "string", sensitive: true, inbound: true },
      { path: "phone", label: "Phone", type: "string", sensitive: true, inbound: true },
    ],
  }),
  ...makeApplicationChild({
    id: "loan_applications.business.add",
    slug: "business",
    title: "Attach business profile to loan application",
    request: LoanApplicationBusinessRequest,
    idempotent: true,
    example: { business_name: "ABC Traders", sector: "retail", monthly_turnover: 800000, years_in_operation: 4 },
    fields: [
      { path: "business_name", label: "Business name", type: "string", inbound: true },
      { path: "sector", label: "Sector", type: "string", inbound: true },
      { path: "monthly_turnover", label: "Monthly turnover", type: "number", inbound: true },
      { path: "years_in_operation", label: "Years in operation", type: "number", inbound: true },
      { path: "ownership_type", label: "Ownership type", type: "string", inbound: true },
      { path: "registration_no", label: "Registration no.", type: "string", inbound: true },
    ],
  }),
  ...makeApplicationChild({
    id: "loan_applications.employment.add",
    slug: "employment",
    title: "Attach employment record to loan application",
    request: LoanApplicationEmploymentRequest,
    idempotent: true,
    example: { employer_name: "Acme Ltd", position: "Manager", monthly_income: 150000, years_of_service: 6 },
    fields: [
      { path: "employer_name", label: "Employer name", type: "string", inbound: true },
      { path: "position", label: "Position", type: "string", inbound: true },
      { path: "employment_type", label: "Employment type", type: "string", inbound: true },
      { path: "monthly_income", label: "Monthly income", type: "number", inbound: true },
      { path: "years_of_service", label: "Years of service", type: "number", inbound: true },
    ],
  }),
  ...makeApplicationChild({
    id: "loan_applications.collateral.add",
    slug: "collateral",
    title: "Attach collateral / security to loan application",
    request: LoanApplicationCollateralRequest,
    idempotent: true,
    example: {
      security_type_id: "c3d4…",
      values: { make: "Toyota", model: "Hilux", chassis_no: "AHTFR22G80…" },
      documents: [{ document_type: "vehicle_cr", file_name: "cr.pdf", storage_path: "…" }],
    },
    fields: [
      { path: "security_type_id", label: "Security type", type: "uuid", inbound: true, notes: "From configured security_type catalogue." },
      { path: "values", label: "Field values", type: "object", inbound: true, notes: "Keys match the security type's field definitions." },
      { path: "documents", label: "Documents", type: "array", inbound: true },
      { path: "notes", label: "Notes", type: "string", inbound: true },
    ],
    extraErrors: [
      { code: 404, error: "security_type_not_found", meaning: "security_type_id does not belong to the caller's company." },
    ],
  }),
  ...makeApplicationChild({
    id: "loan_applications.guarantors.add",
    slug: "guarantors",
    title: "Attach guarantor to loan application",
    request: LoanApplicationGuarantorRequest,
    idempotent: true,
    example: { full_name: "Sunil Silva", national_id: "197512345V", relationship: "brother", coverage_amount: 250000 },
    fields: [
      { path: "guarantor_client_id", label: "Guarantor client (optional link)", type: "uuid", inbound: true },
      { path: "full_name", label: "Full name", type: "string", required: true, inbound: true },
      { path: "national_id", label: "National ID", type: "string", sensitive: true, inbound: true },
      { path: "phone", label: "Phone", type: "string", sensitive: true, inbound: true },
      { path: "relationship", label: "Relationship", type: "string", inbound: true },
      { path: "coverage_amount", label: "Coverage amount", type: "number", inbound: true },
    ],
  }),
  ...makeApplicationChild({
    id: "loan_applications.existing_facilities.add",
    slug: "existing-facilities",
    title: "Attach existing facility to loan application",
    request: LoanApplicationExistingFacilityRequest,
    idempotent: true,
    example: { lender_name: "XYZ Bank", facility_type: "personal_loan", outstanding_balance: 120000, monthly_instalment: 8500 },
    fields: [
      { path: "lender_name", label: "Lender", type: "string", required: true, inbound: true },
      { path: "facility_type", label: "Facility type", type: "string", inbound: true },
      { path: "original_amount", label: "Original amount", type: "number", inbound: true },
      { path: "outstanding_balance", label: "Outstanding balance", type: "number", inbound: true },
      { path: "monthly_instalment", label: "Monthly instalment", type: "number", inbound: true },
      { path: "maturity_date", label: "Maturity date", type: "date", inbound: true },
    ],
  }),
  ...makeApplicationChild({
    id: "loan_applications.notes.add",
    slug: "notes",
    title: "Attach note to loan application",
    request: LoanApplicationNoteRequest,
    idempotent: false,
    example: { note: "Called applicant to confirm business address." },
    fields: [
      { path: "note", label: "Note", type: "string", required: true, inbound: true },
    ],
  }),
  {
    id: "loan_applications.submit",
    method: "POST",
    path: "/api/public/v1/loan-applications/{id}/submit",
    resource: "loan_applications",
    title: "Submit loan application",
    summary:
      "Transition a draft loan application to submitted via the atomic submit_loan_application RPC. Fires loan_application.submitted webhook.",
    scope: "loan_applications.write",
    direction: "inbound",
    status: "live",
    requiresIdempotency: false,
    request: LoanApplicationSubmitRequest,
    response: LoanApplicationSubmitResponse,
    requestExample: { transition_key: "submit" },
    responseExample: {
      status: "submitted",
      application_id: "9f0e…",
      application_no: "AP000123",
      status_code: "submitted",
      submitted_at: "2026-07-22T09:35:00.000Z",
    },
    fields: [
      { path: "id", label: "Application id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
      { path: "transition_key", label: "Workflow transition key", type: "string", inbound: true },
      { path: "workflow_definition_key", label: "Workflow definition key", type: "string", inbound: true },
      { path: "status_code", label: "New status", type: "string", outbound: true },
      { path: "submitted_at", label: "Submitted at", type: "datetime", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "Application not found in caller's company." },
      { code: 409, error: "submit_failed", meaning: "Application could not be submitted (wrong state, missing required data, or workflow guard)." },
    ],
    webhookEvents: ["loan_application.submitted"],
  },
  {
    id: "loan_applications.decide",
    method: "POST",
    path: "/api/public/v1/loan-applications/{id}/decide",
    resource: "loan_applications",
    title: "Approve or reject loan application",
    summary:
      "Record an approve/reject decision on a submitted application via the atomic decide_loan_application RPC. Fires loan_application.approved or loan_application.rejected webhook.",
    scope: "loan_applications.write",
    direction: "inbound",
    status: "live",
    requiresIdempotency: false,
    request: LoanApplicationDecideRequest,
    response: LoanApplicationDecideResponse,
    requestExample: { decision: "approve", comment: "All checks passed." },
    responseExample: {
      status: "decided",
      application_id: "9f0e…",
      application_no: "AP000123",
      decision: "approve",
      status_code: "approved",
      decided_at: "2026-07-22T10:15:00.000Z",
    },
    fields: [
      { path: "id", label: "Application id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
      { path: "decision", label: "Decision", type: "enum", required: true, inbound: true, notes: "approve | reject" },
      { path: "comment", label: "Decision comment", type: "string", inbound: true },
      { path: "step_key", label: "Workflow step key", type: "string", inbound: true },
      { path: "workflow_instance_id", label: "Workflow instance", type: "uuid", inbound: true },
      { path: "transition_key", label: "Workflow transition key", type: "string", inbound: true },
      { path: "status_code", label: "New status", type: "string", outbound: true },
      { path: "decided_at", label: "Decided at", type: "datetime", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "Application not found in caller's company." },
      { code: 409, error: "decision_failed", meaning: "Application is not in a decidable state, delegation authority missing, or workflow guard rejected the transition." },
    ],
    webhookEvents: ["loan_application.approved", "loan_application.rejected"],
  },
  {
    id: "loan_applications.return",
    method: "POST",
    path: "/api/public/v1/loan-applications/{id}/return",
    resource: "loan_applications",
    title: "Return loan application for changes",
    summary:
      "Return a submitted application to the originator for corrections via return_loan_application RPC. Fires loan_application.returned webhook.",
    scope: "loan_applications.write",
    direction: "inbound",
    status: "live",
    requiresIdempotency: false,
    request: LoanApplicationReturnRequest,
    response: LoanApplicationReturnResponse,
    requestExample: { reason: "Missing latest bank statements." },
    responseExample: {
      status: "returned",
      application_id: "9f0e…",
      application_no: "AP000123",
      status_code: "returned",
      returned_at: "2026-07-22T10:20:00.000Z",
    },
    fields: [
      { path: "id", label: "Application id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
      { path: "reason", label: "Return reason", type: "string", required: true, inbound: true },
      { path: "transition_key", label: "Workflow transition key", type: "string", inbound: true },
      { path: "status_code", label: "New status", type: "string", outbound: true },
      { path: "returned_at", label: "Returned at", type: "datetime", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "Application not found in caller's company." },
      { code: 409, error: "return_failed", meaning: "Application cannot be returned from its current state." },
    ],
    webhookEvents: ["loan_application.returned"],
  },
  {
    id: "loan_applications.cancel",
    method: "POST",
    path: "/api/public/v1/loan-applications/{id}/cancel",
    resource: "loan_applications",
    title: "Cancel loan application",
    summary:
      "Cancel a loan application via cancel_loan_application RPC. Terminal state. Fires loan_application.cancelled webhook.",
    scope: "loan_applications.write",
    direction: "inbound",
    status: "live",
    requiresIdempotency: false,
    request: LoanApplicationCancelRequest,
    response: LoanApplicationCancelResponse,
    requestExample: { reason: "Customer withdrew request." },
    responseExample: {
      status: "cancelled",
      application_id: "9f0e…",
      application_no: "AP000123",
      status_code: "cancelled",
      cancelled_at: "2026-07-22T10:30:00.000Z",
    },
    fields: [
      { path: "id", label: "Application id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
      { path: "reason", label: "Cancellation reason", type: "string", required: true, inbound: true },
      { path: "transition_key", label: "Workflow transition key", type: "string", inbound: true },
      { path: "status_code", label: "New status", type: "string", outbound: true },
      { path: "cancelled_at", label: "Cancelled at", type: "datetime", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "Application not found in caller's company." },
      { code: 409, error: "cancel_failed", meaning: "Application is already in a terminal state." },
    ],
    webhookEvents: ["loan_application.cancelled"],
  },
  {
    id: "loan_applications.disburse",
    method: "POST",
    path: "/api/public/v1/loan-applications/{id}/disburse",
    resource: "loan_applications",
    title: "Disburse approved loan application",
    summary:
      "Book the loan from an approved application atomically via disburse_loan_from_application (creates loan, schedule, opening journal, contract number). Idempotent when Idempotency-Key header is supplied. Fires loan.disbursed webhook.",
    scope: "loan_applications.write",
    direction: "inbound",
    status: "live",
    requiresIdempotency: true,
    request: LoanApplicationDisburseRequest,
    response: LoanApplicationDisburseResponse,
    requestExample: { payment_channel: "bank_transfer", payment_reference: "TXN-2026-9911" },
    responseExample: {
      status: "disbursed",
      application_id: "9f0e…",
      application_no: "AP000123",
      loan_id: "0d7f…",
      contract_no: "LN00000123",
      status_code: "disbursed",
      disbursed_at: "2026-07-22T10:45:00.000Z",
      idempotent_replay: false,
    },
    fields: [
      { path: "id", label: "Application id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
      { path: "payment_channel", label: "Payment channel", type: "enum", inbound: true, notes: "cash | bank_transfer | cheque | sdf | wallet | fund_transfer | other" },
      { path: "payment_reference", label: "Payment reference", type: "string", inbound: true },
      { path: "loan_id", label: "Booked loan id", type: "uuid", outbound: true },
      { path: "contract_no", label: "Contract no.", type: "string", outbound: true },
      { path: "status_code", label: "Application status", type: "string", outbound: true },
      { path: "disbursed_at", label: "Disbursed at", type: "datetime", outbound: true },
      { path: "idempotent_replay", label: "Replay of prior request", type: "boolean", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "Application not found in caller's company." },
      { code: 409, error: "disburse_failed", meaning: "Application not approved, missing maker-checker sign-off, or ledger controls rejected the booking." },
      { code: 409, error: "idempotency_conflict", meaning: "Idempotency-Key was reused with a different body." },
    ],
    webhookEvents: ["loan.disbursed"],
  },
  {
    id: "webhooks.deliveries.list",
    method: "GET",
    path: "/api/public/v1/webhook-deliveries",
    resource: "webhooks",
    title: "List webhook deliveries",
    summary:
      "Cursor-paginated list of outbound webhook deliveries for the caller's company + environment. Filter by status, event_type, or endpoint_id.",
    scope: "webhooks.read",
    direction: "outbound",
    status: "live",
    requiresIdempotency: false,
    response: WebhookDeliveryListResponse,
    responseExample: {
      data: [
        {
          id: "0d7f…",
          endpoint_id: "9a11…",
          env: "production",
          event_id: "4c8b…",
          event_type: "loan.disbursed",
          attempt: 1,
          status: "delivered",
          status_code: 200,
          response_ms: 145,
          response_snippet: "ok",
          next_retry_at: null,
          created_at: "2026-07-22T10:45:00.000Z",
        },
      ],
      next_cursor: null,
    },
    fields: [
      { path: "limit", label: "Page size", type: "integer", inbound: true, notes: "1–200, default 50 (query)." },
      { path: "cursor", label: "Pagination cursor", type: "datetime", inbound: true, notes: "created_at of last row (query)." },
      { path: "status", label: "Delivery status", type: "enum", inbound: true, notes: "pending | delivered | failed | dead (query)." },
      { path: "event_type", label: "Event type filter", type: "string", inbound: true, notes: "e.g. loan.disbursed (query)." },
      { path: "endpoint_id", label: "Endpoint filter", type: "uuid", inbound: true, notes: "(query)." },
      { path: "data[].status", label: "Delivery status", type: "enum", outbound: true },
      { path: "data[].attempt", label: "Attempt no.", type: "integer", outbound: true },
      { path: "data[].status_code", label: "HTTP status returned by endpoint", type: "integer", outbound: true },
      { path: "next_cursor", label: "Next page cursor", type: "datetime", outbound: true },
    ],
    errors: [...COMMON_ERRORS],
  },
  {
    id: "webhooks.deliveries.get",
    method: "GET",
    path: "/api/public/v1/webhook-deliveries/{id}",
    resource: "webhooks",
    title: "Get webhook delivery",
    summary:
      "Fetch a single delivery including its full JSON payload, response snippet, and retry timing. Useful for debugging integrator issues.",
    scope: "webhooks.read",
    direction: "outbound",
    status: "live",
    requiresIdempotency: false,
    response: WebhookDeliveryDetail,
    responseExample: {
      id: "0d7f…",
      endpoint_id: "9a11…",
      env: "production",
      event_id: "4c8b…",
      event_type: "loan.disbursed",
      attempt: 1,
      status: "delivered",
      status_code: 200,
      response_ms: 145,
      response_snippet: "ok",
      next_retry_at: null,
      created_at: "2026-07-22T10:45:00.000Z",
      payload: { status: "disbursed", loan_id: "0d7f…" },
    },
    fields: [
      { path: "id", label: "Delivery id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
      { path: "payload", label: "Signed JSON payload sent to endpoint", type: "object", outbound: true },
      { path: "response_snippet", label: "First bytes of endpoint response", type: "string", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "Delivery not found in caller's company + env." },
    ],
  },
  {
    id: "webhooks.deliveries.replay",
    method: "POST",
    path: "/api/public/v1/webhook-deliveries/{id}/replay",
    resource: "webhooks",
    title: "Replay webhook delivery",
    summary:
      "Clone an existing delivery as a fresh pending row; the background dispatcher will re-sign and re-send it to the original endpoint. Endpoint must still be active.",
    scope: "webhooks.replay",
    direction: "outbound",
    status: "live",
    requiresIdempotency: false,
    response: WebhookReplayResponse,
    responseExample: {
      status: "requeued",
      original_id: "0d7f…",
      new_delivery_id: "b1e2…",
      event_type: "loan.disbursed",
      endpoint_id: "9a11…",
    },
    fields: [
      { path: "id", label: "Delivery id to replay", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
      { path: "new_delivery_id", label: "Newly queued delivery id", type: "uuid", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "Delivery not found in caller's company + env." },
      { code: 409, error: "endpoint_inactive", meaning: "Original endpoint is disabled; re-activate before replaying." },
    ],
  },
  {
    id: "events.list",
    method: "GET",
    path: "/api/public/v1/events",
    resource: "events",
    title: "List domain events",
    summary:
      "Cursor-paginated feed of business events (client.created, loan.disbursed, savings.deposit.posted, etc.) scoped to the caller's company. Use this to reconcile state without polling each resource. Order: occurred_at DESC. Filters: event_type, aggregate_type, aggregate_id, since.",
    scope: "events.read",
    direction: "outbound",
    status: "live",
    requiresIdempotency: false,
    response: DomainEventListResponse,
    responseExample: {
      data: [
        {
          id: "0d7f…",
          event_type: "loan.disbursed",
          domain: "loans",
          aggregate_type: "loan",
          aggregate_id: "9a11…",
          occurred_at: "2026-07-22T10:15:00.000Z",
          created_at: "2026-07-22T10:15:00.000Z",
          idempotency_key: null,
        },
      ],
      next_cursor: "2026-07-22T10:15:00.000Z",
    },
    fields: [
      { path: "cursor", label: "Cursor", type: "string", inbound: true, notes: "Pass next_cursor from a previous page." },
      { path: "limit", label: "Limit", type: "int", inbound: true, notes: "Default 50, max 200." },
      { path: "event_type", label: "Event type filter", type: "string", inbound: true },
      { path: "aggregate_type", label: "Aggregate type filter", type: "string", inbound: true },
      { path: "aggregate_id", label: "Aggregate id filter", type: "uuid", inbound: true },
      { path: "since", label: "Lower bound occurred_at (inclusive ISO datetime)", type: "datetime", inbound: true },
      { path: "data", label: "Events", type: "array", outbound: true },
      { path: "next_cursor", label: "Next cursor", type: "string", outbound: true },
    ],
    errors: COMMON_ERRORS,
  },
  {
    id: "events.get",
    method: "GET",
    path: "/api/public/v1/events/{id}",
    resource: "events",
    title: "Get domain event",
    summary:
      "Fetch a single event with its full payload and metadata. Returns 404 for events belonging to another company.",
    scope: "events.read",
    direction: "outbound",
    status: "live",
    requiresIdempotency: false,
    response: DomainEventDetail,
    responseExample: {
      id: "0d7f…",
      event_type: "loan.disbursed",
      domain: "loans",
      aggregate_type: "loan",
      aggregate_id: "9a11…",
      occurred_at: "2026-07-22T10:15:00.000Z",
      created_at: "2026-07-22T10:15:00.000Z",
      idempotency_key: null,
      payload: { loan_id: "9a11…", amount: 150000, currency: "LKR" },
      metadata: { actor: "system" },
    },
    fields: [
      { path: "id", label: "Event id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
      { path: "event_type", label: "Event type", type: "string", outbound: true },
      { path: "aggregate_type", label: "Aggregate type", type: "string", outbound: true },
      { path: "aggregate_id", label: "Aggregate id", type: "uuid", outbound: true },
      { path: "occurred_at", label: "Occurred at", type: "datetime", outbound: true },
      { path: "payload", label: "Event payload", type: "object", outbound: true },
      { path: "metadata", label: "Metadata", type: "object", outbound: true },
    ],
    errors: [
      ...COMMON_ERRORS,
      { code: 404, error: "not_found", meaning: "Event not found in caller's company." },
    ],
  },
];

function makeApplicationChild(args: {
  id: string;
  slug: string;
  title: string;
  request: ZodTypeAny;
  idempotent: boolean;
  example: Record<string, unknown>;
  fields: ApiFieldDoc[];
  extraErrors?: ApiErrorDoc[];
}): ApiContract[] {
  return [
    {
      id: args.id,
      method: "POST",
      path: `/api/public/v1/loan-applications/{id}/${args.slug}`,
      resource: "loan_applications",
      title: args.title,
      summary: `${args.title}. The parent application must belong to the API key's company.`,
      scope: "loan_applications.write",
      direction: "inbound",
      status: "live",
      requiresIdempotency: args.idempotent,
      request: args.request,
      response: LoanApplicationChildResponse,
      requestExample: args.example,
      responseExample: {
        status: "created",
        id: "…",
        application_id: "9f0e…",
        application_no: "AP000123",
        created_at: "2026-07-22T09:31:00.000Z",
      },
      fields: [
        { path: "id", label: "Application id", type: "uuid", required: true, inbound: true, notes: "Path parameter." },
        ...args.fields,
        { path: "id", label: "Child row id", type: "uuid", outbound: true },
        { path: "application_id", label: "Application id", type: "uuid", outbound: true },
        { path: "application_no", label: "Application no.", type: "string", outbound: true },
      ],
      errors: [
        ...COMMON_ERRORS,
        { code: 404, error: "not_found", meaning: "Loan application not found in caller's company." },
        ...(args.idempotent
          ? [{ code: 409, error: "idempotency_conflict", meaning: "Idempotency-Key was reused with a different body." }]
          : []),
        ...(args.extraErrors ?? []),
      ],
    },
  ];
}

function makeReadPair(args: {
  resource: ApiResource;
  scope: ApiScope;
  id: string;
  label: string;
  listPath: string;
  getPath: string;
  example: Record<string, unknown>;
  outboundFields: Array<Omit<ApiFieldDoc, "outbound" | "inbound">>;
}): ApiContract[] {
  const outbound = args.outboundFields.map((f) => ({ ...f, outbound: true }));
  return [
    {
      id: `${args.id}.list`,
      method: "GET",
      path: args.listPath,
      resource: args.resource,
      title: `List ${args.label}s`,
      summary: `Cursor-paginated list of ${args.label}s belonging to the API key's company. Ordered by newest first.`,
      scope: args.scope,
      direction: "outbound",
      status: "live",
      requiresIdempotency: false,
      responseExample: { data: [args.example], next_cursor: null },
      fields: [
        { path: "cursor", label: "Cursor", type: "string", inbound: true, notes: "Pass next_cursor from a previous page." },
        { path: "limit", label: "Limit", type: "int", inbound: true, notes: "Default 50, max 200." },
        { path: "data", label: `${args.label}s`, type: "array", outbound: true },
        { path: "next_cursor", label: "Next cursor", type: "string", outbound: true },
      ],
      errors: COMMON_ERRORS,
    },
    {
      id: `${args.id}.get`,
      method: "GET",
      path: args.getPath,
      resource: args.resource,
      title: `Get ${args.label}`,
      summary: `Fetch a single ${args.label} by id. Returns 404 for ids belonging to another company (no cross-tenant enumeration).`,
      scope: args.scope,
      direction: "outbound",
      status: "live",
      requiresIdempotency: false,
      responseExample: args.example,
      fields: [
        { path: "id", label: `${args.label} id`, type: "uuid", required: true, inbound: true },
        ...outbound,
      ],
      errors: [
        ...COMMON_ERRORS,
        { code: 404, error: "not_found", meaning: `No ${args.label} with this id in the caller's company.` },
      ],
    },
  ];
}

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
