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
  LoanApplicationApplicantRequest,
  LoanApplicationBusinessRequest,
  LoanApplicationChildResponse,
  LoanApplicationCollateralRequest,
  LoanApplicationCreateRequest,
  LoanApplicationCreateResponse,
  LoanApplicationEmploymentRequest,
  LoanApplicationExistingFacilityRequest,
  LoanApplicationGuarantorRequest,
  LoanApplicationNoteRequest,
  LoanApplicationSubmitRequest,
  LoanApplicationSubmitResponse,
  RepaymentCreateRequest,
  RepaymentCreateResponse,
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
  | "clients.create"
  | "clients.read"
  | "loans.read"
  | "loans.repayments.write"
  | "loan_applications.write"
  | "savings.read"
  | "fixed_deposits.read";

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
];

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
