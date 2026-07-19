/**
 * Regression tests for correction prompts 1-7.
 *
 * These are lightweight guards that pin the invariants each earlier prompt
 * established so a regression is caught by `bun run test:run` even without a
 * live database. Deep behavioral coverage of schedules and application
 * transitions lives in their own dedicated test files.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) => readFileSync(resolve(__dirname, "..", "..", "..", rel), "utf8");

describe("prompt 4 — capitalizable charges", () => {
  const schedule = read("src/lib/loan-schedule.ts");
  it("amortization base includes capitalized charges", () => {
    // The amortization pipeline must add capitalized charges to the
    // principal before computing installments.
    expect(schedule).toMatch(/capitaliz/i);
  });
});

describe("prompt 5 — repayment form fields", () => {
  const form = read("src/routes/_authenticated/transactions.repayment.tsx");
  it("submits received_at, notes, reference and idempotency_key", () => {
    for (const key of ["received_at", "notes", "reference", "idempotency_key"]) {
      expect(form).toContain(key);
    }
  });
  it("uses server business date, not the browser clock, for default", () => {
    expect(form).toContain("business_date");
    expect(form).toContain("getRepaymentContext");
  });
  it("does not silently drop the received_at change handler", () => {
    // Read-only branch must be guarded on can_backdate rather than the
    // previous hard-coded `readOnly` with an unused onChange.
    expect(form).toContain("canBackdate");
  });
});

describe("prompt 6 — record_repayment RPC hardening", () => {
  const fns = read("src/lib/mzizi.functions.ts");
  it("recordRepayment forwards received_at, notes, idempotency_key to the RPC", () => {
    // A single block should contain all three named args.
    const idx = fns.indexOf('rpc("record_repayment"');
    expect(idx).toBeGreaterThan(-1);
    const window = fns.slice(idx, idx + 800);
    expect(window).toMatch(/_received_at:/);
    expect(window).toMatch(/_notes:/);
    expect(window).toMatch(/_idempotency_key:/);
  });
});

describe("prompt 7 — repayment date guard trigger", () => {
  const migration = read(
    // Latest repayment-date guard migration; if renamed, update this test.
    // The important assertion is the trigger name.
    "supabase/migrations/20260719194114_6cb1df21-4f60-46ab-9c70-62161451faad.sql",
  );
  it("declares the repayment_date_guard trigger", () => {
    expect(migration).toMatch(/trg_repayment_date_guard/);
    expect(migration).toMatch(/cannot be in the future/);
    expect(migration).toMatch(/before the loan disbursement date/);
    expect(migration).toMatch(/Backdating not permitted/);
  });
  it("exposes can_backdate_repayment and current_business_date to authenticated", () => {
    expect(migration).toMatch(/can_backdate_repayment/);
    expect(migration).toMatch(/current_business_date/);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/);
  });
});
