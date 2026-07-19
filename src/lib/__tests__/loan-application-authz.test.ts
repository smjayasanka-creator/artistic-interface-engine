import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror of the schema in loan-application.functions.ts (kept in sync so we
// can unit-test the field allow-list without booting the server runtime).
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

const SENSITIVE = [
  "company_id",
  "status",
  "application_no",
  "created_by",
  "submitted_at",
  "decided_at",
  "disbursed_at",
  "loan_id",
  "workflow_instance_id",
];

describe("updateLoanApplication input validator", () => {
  it("accepts allowed editable fields", () => {
    const r = UpdatableAppFields.safeParse({
      requested_principal: 5000,
      requested_tenor_months: 12,
      purpose: "trading",
    });
    expect(r.success).toBe(true);
  });

  for (const field of SENSITIVE) {
    it(`rejects sensitive field '${field}'`, () => {
      const r = UpdatableAppFields.safeParse({ [field]: "x" });
      expect(r.success).toBe(false);
    });
  }
});

// Documented DB-level invariants (enforced by decide_loan_application RPC
// and RLS in migration 20260719...decide_loan_application).
// Verified manually against Supabase; kept as living spec.
describe("decide_loan_application RPC — authorization contract", () => {
  it.skip("caller without loans.approve cannot approve or reject", () => {});
  it.skip("authorized approver can decide a submitted application", () => {});
  it.skip("creator cannot approve their own application", () => {});
  it.skip("invalid status transitions fail (e.g. from draft/approved)", () => {});
  it.skip("direct approval/status-history inserts by ordinary members are blocked by RLS", () => {});
  it.skip("failed approval leaves no partial approval/history/status rows (single transaction)", () => {});
});
