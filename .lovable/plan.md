# Dynamic Delegation Authority & Workflow Engine

Replace the current fixed `delegation_authority` (security-type / LTV / amount / rate ranges only) with a rules-driven authority engine that resolves loan approval chains at submission time — no code changes needed to adjust limits.

## 1. Data model (new tables, old kept for back-compat until cutover)

### `delegation_authority` (redesigned — MASTER)

Replaces current table. Fields:

- `code` (unique per company, e.g. `L1`, `BM`, `CREDIT_CMTE`)
- `name`, `description`
- `level` int (1 = lowest, higher = stronger; used for escalation ordering)
- `effective_from`, `effective_to` (nullable), `status` (`active`/`inactive`)
- `company_id`, timestamps, `created_by`

### `delegation_authority_member`

Who can act as this authority. One authority ↔ many members.

- `authority_id`
- `member_type` (`user` | `custom_role` | `staff_role`)
- `member_ref` (uuid for user/custom_role, text for staff_role enum)
- `is_backup` bool (used for absence delegation)

### `delegation_authority_delegate` (absence delegation)

- `authority_id`, `from_user_id`, `to_user_id`, `from_date`, `to_date`, `reason`

### `delegation_rule`

Configurable matcher → authority chain.

- `company_id`, `name`, `active`, `priority` int (lower = evaluated first)
- `rule_scope` enum: `user` | `branch` | `region` | `product` | `default` (drives tie-break per spec)
- Filters (all nullable — NULL = wildcard):
  - `user_id`, `custom_role_id`, `branch_id`, `region` text,
  - `product_id`, `security_type_id` (equipment type),
  - `amount_min`, `amount_max`,
  - `rate_min`, `rate_max`,
  - `risk_grade` text (matches `client.risk_grade`)
- `effective_from`, `effective_to`, timestamps

### `delegation_rule_step`

Ordered approval chain for a rule.

- `rule_id`, `seq` int, `authority_id`, `mode` (`sequential` default),
- `sla_hours` int (for escalation), `escalate_to_authority_id` nullable

### Audit

Extend existing `workflow_action` + add `workflow_instance.applied_rule_id`, `workflow_step.authority_id`, `workflow_step.escalated_at`. Existing `audit_log` captures decisions/comments.

RLS: company-scoped read for members; write for company admins + `workflow.manage` permission. GRANTs to `authenticated` + `service_role`.

## 2. Rule resolution engine (server function)

`resolveLoanApprovalChain({ loan_id })` — pure server function, called at loan submission.

Algorithm:

1. Load loan + client + product + branch + region.
2. Query active rules in company, `effective_from <= now < effective_to`.
3. Score each rule by scope priority per spec: `user` (1) → `branch` (2) → `region` (3) → `product` (4) → `default` (5); ties broken by rule `priority`, then most-specific (fewer NULL filters wins).
4. First matching rule (after filters pass) wins. Return its ordered `delegation_rule_step[]` → authorities.
5. If no rule matches → fall back to `rule_scope='default'` else throw "No delegation rule matches".

## 3. Workflow generation

Replace hard-coded `loan_disbursement` workflow lookup for loan approvals:

- On `submitLoanApplication`, call `resolveLoanApprovalChain`, then create a `workflow_instance` with dynamically materialised `workflow_step` rows (`authority_id` per step).
- Approver eligibility = user matches any `delegation_authority_member` of the current step's authority, OR is an active delegate.
- Existing modal supports approve / reject / send-back — reuse. Add "resubmission" path on reject: initiator can edit & resubmit → re-resolves chain.
- Escalation: cron/EOD hook checks steps past `sla_hours`; auto-advances to `escalate_to_authority_id` and logs escalation.

## 4. UI changes

Replace `src/components/mzizi/DelegationAuthorityTab.tsx` (currently one flat form) with a 3-tab admin surface:

1. **Authorities** — CRUD list of masters + members panel.
2. **Rules** — CRUD list with filters, priority, chain builder (drag-order steps → pick authority, SLA, escalation).
3. **Delegates (absence)** — CRUD absence delegations.

Add a **read-only "Approval chain preview"** on the loan application page so users see who will approve before submitting.

Audit trail already visible in the approval modal (extend to show `applied_rule` name + `authority` per step).

## 5. Migration/back-compat

- Keep old `delegation_authority` columns for read; add new columns via migration; back-fill any existing rows into scope=`product` rules where possible.
- Old `security-type` LTV/amount/rate ranges become one `delegation_rule` per existing row (scope=`product`, filters populated).

## Technical notes

- All resolution logic in Postgres `SECURITY DEFINER` function `resolve_loan_approval_chain(loan_id uuid)` returning `jsonb` (rule_id + steps). Server function wraps it.
- `workflow_step.authority_id` FK to `delegation_authority`; approver check via new `has_authority(user_id, authority_id)` SQL function that checks members + active delegates.
- Escalation runs inside existing EOD orchestrator as a new step.
- Full audit via existing `workflow_action` + `audit_log` (emit `workflow.rule_applied`, `workflow.escalated`).

## Files to add/change

- Migration: new tables, columns, functions, RLS, GRANTs.
- `src/lib/delegation.functions.ts` (new) — CRUD + `resolveLoanApprovalChain`.
- `src/lib/workflow.functions.ts` — use resolver when starting loan approval instance; expose `previewApprovalChain`.
- `src/lib/mzizi.functions.ts` — `submitApplication` calls resolver.
- `src/components/mzizi/DelegationAuthorityTab.tsx` — rewritten as tabbed admin.
- `src/components/mzizi/InstanceDetailModal.tsx` — show applied rule + authority per step.
- `src/routes/_authenticated/loans.new.tsx` — approval chain preview panel.

## Rollout

1. Ship migration + resolver + admin UI (rules default to "everyone stays as-is").
2. Cut submission path over to resolver.
3. Remove legacy fields after one release.

Shall I proceed with the migration first?
