# API & Integration Hub — Phased Plan

The current `/api` page is ~955 lines with 4 tabs (Overview, Endpoints, Keys, Logs) and 8 live public endpoints. Your request is a **complete developer portal** — realistically 15–25 files, one migration, contract registry, OpenAPI generator, mapping studio, webhook config, test suite. Too large for a single change without risking regressions.

I want to confirm scope + order before I start. Below is the phased plan I recommend.

## Immediate hotfix (do first, always)

- Fix `endpointSpec()` fall-through: add explicit `clients.create` case sourced from the real Zod schema in `src/routes/api/public/v1/clients.create.ts` (not a duplicate literal). Currently it silently shows the Health endpoint's spec.
- Add a Vitest regression: every entry in `ENDPOINTS` must have a matching `endpointSpec()` case.

## Phase 1 — Contract Registry (foundation, everything else depends on it)

New file: `src/lib/api-contract.ts` — single source of truth per endpoint:
```
{ id, method, path, scope, direction, status: 'live'|'planned',
  request: ZodSchema, response: ZodSchema, requestExample, responseExample,
  fields: [{ path, label, type, required, sensitive, inbound, outbound, notes }],
  errors, idempotency, pagination, webhookEvents }
```
- Registry re-exports the existing Zod schemas from `api-schemas.server.ts` (no duplication).
- Route handlers (`src/routes/api/public/v1/*`) import their contract entry for validation.
- UI reads from registry — no more parallel `ENDPOINTS` array + `endpointSpec()` switch.
- Test: every file under `src/routes/api/public/v1/*` (except health) must appear in registry with matching path.

## Phase 2 — Page shell + Quick Start + API Explorer

- Rename to "API & Integration Hub" with subtitle + "API-first platform" badge.
- Summary cards: Live endpoints, Resources, Inbound, Outbound, Active keys, 24h success rate (query `api_transaction_log`).
- Tabs: Quick start · API explorer · Data catalogue · Field mapping · Webhooks · Integration guides · API keys · Request logs.
- **Quick start**: 9-step flow, base URL, auth, idempotency, pagination, rate limits, standard error format. Copyable code samples in cURL / JS / Python / C# / PHP (generated from contract).
- **API explorer**: search + filter (resource, method, direction, scope, env, status), expandable per-endpoint view driven by registry, field table with all requested columns.
- Preserve existing API keys tab and Request logs tab; enhance logs with filters (endpoint, direction, key, env, status, idempotency key, correlation id) and a masked detail drawer.

## Phase 3 — Data catalogue + Field mapping studio

- **Data catalogue**: cards per resource (Clients, Loans, Loan applications, Repayments, Savings, FDs, Payments, Workflow, Events…) — description, IDs, read/write ops, related resources, published events, field dictionary from registry.
- **Field mapping studio**: side-by-side external ↔ platform, paste sample JSON → auto-flatten → suggested matches (string similarity, no AI initially), transformations (rename, concat/split name, date fmt, phone normalize, enum map, defaults), preview, required-field validation, save/duplicate/export templates. New table `api_mapping_template` (company-scoped, RLS). No AI-assisted mapping in this phase.

## Phase 4 — Webhooks

- Migration: `webhook_endpoint` (url, env, events[], secret_hash, status, retry policy, timeout, headers), `webhook_delivery` (event_id, endpoint_id, attempt, status_code, response_ms, next_retry_at, dead_letter). RLS by company.
- Wire into existing `dispatch-domain-events.ts` cron hook so registered endpoints receive matching events with HMAC-SHA256 signature (`X-Signature-256`, timestamp header for replay protection).
- UI: create/edit/disable, event picker, "Send test webhook", delivery history with status codes and retry timeline. Secret shown **once** on creation, then only `whsec_...abcd` last-4.
- Event catalogue: `client.created/updated`, `loan_application.submitted/approved/rejected`, `loan.disbursed`, `repayment.received`, `savings.transaction.posted`, `fixed_deposit.opened/matured`, `payment.completed/failed`, `eod.completed`.

## Phase 5 — Read endpoints (new GET APIs)

Currently only POST write endpoints exist publicly. Add paginated, cursor-based, company-scoped GET DTOs (RPC-backed, no raw table exposure):
- `GET /api/public/v1/clients`, `/clients/{id}`
- `GET /api/public/v1/loan-applications`, `/{id}`
- `GET /api/public/v1/loans`, `/{id}`, `/{id}/schedule`, `/{id}/repayments`
- `GET /api/public/v1/savings-accounts`, `/{id}`, `/{id}/transactions`
- `GET /api/public/v1/fixed-deposits`, `/{id}`
- `GET /api/public/v1/branches`, `/products/loan`, `/products/savings`
- `GET /api/public/v1/workflow/{id}`
- `GET /api/public/v1/events` (event stream tail)

New scopes: `clients.read`, `loans.read`, `loan_applications.read`, `repayments.read`, `savings.read`, `fixed_deposits.read`, `payments.read`, `workflow.read`, `events.read`, `reference.read`. Existing scopes preserved.

## Phase 6 — Integration guides + Developer assets

- Static guide content for the 10 integration archetypes (core banking, mobile, IB, LOS, payment gateway, ERP, CEFT switch, CRIB, DWH, webhook-only).
- OpenAPI 3.1 generator from registry via `zod-to-json-schema` (already Zod-based). Serve at `/api/public/v1/openapi.json`. "Download OpenAPI" + "Download Postman collection" (generated from OpenAPI).
- Standard error catalogue, webhook event catalogue, versioning & deprecation section.

## Phase 7 — Tests + hardening

Vitest cases for all 12 acceptance criteria you listed.

## Files & migrations (aggregate)

- New: `src/lib/api-contract.ts`, `src/lib/openapi.ts`, `src/lib/webhooks.functions.ts`, `src/lib/mappings.functions.ts`, `src/routes/_authenticated/api.tsx` (rewrite), plus tab components under `src/components/api/*`, plus new GET route files, plus `src/routes/api/public/v1/openapi.json.ts`.
- Migrations: `webhook_endpoint`, `webhook_delivery`, `api_mapping_template` (all with GRANTs + RLS + `service_role`). New scopes added to existing scope enum/allowlist without breaking legacy.

## Non-goals (unless you say otherwise)

- AI-assisted mapping (mentioned as optional).
- Sandbox environment isolation beyond an `env` flag on keys/webhooks (true separate-DB sandbox is a much bigger change).
- Rewriting or replacing existing write endpoints — reused as-is.

## Confirm before I start

**Q1.** Ship in phases (I recommend hotfix + Phase 1 + Phase 2 this turn, then Phases 3–7 in follow-ups) or attempt everything in one enormous change?
**Q2.** For sandbox: is an `env: 'sandbox'|'production'` flag on API keys & webhooks enough, or do you want separate data?
**Q3.** Field-mapping AI suggestions — skip for now (string similarity only), or use Lovable AI Gateway for the "suggest matches" button?

Once you answer, I'll start with the hotfix + Phase 1 immediately.
