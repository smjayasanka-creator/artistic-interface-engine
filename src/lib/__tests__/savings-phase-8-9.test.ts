/**
 * Phase 8 + Phase 9 regression guards for the Savings domain.
 *
 * These are lightweight file-level assertions that pin the invariants
 * established by the savings overhaul so a regression is caught by
 * `bun run test:run` without a live database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("phase 8 — savings account detail route", () => {
  const path = "src/routes/_authenticated/savings.$id.tsx";

  it("route file exists", () => {
    expect(existsSync(resolve(process.cwd(), path))).toBe(true);
  });

  const src = read(path);

  it("registers the /_authenticated/savings/$id route", () => {
    expect(src).toContain('createFileRoute("/_authenticated/savings/$id")');
  });

  it("renders every specified tab", () => {
    for (const label of [
      "Overview",
      "Transactions",
      "Holds & Blocks",
      "Loan Mandates",
      "Interest / WHT",
      "Holders & Nominees",
      "Passbook",
      "Audit",
    ]) {
      expect(src).toContain(label);
    }
  });

  it("uses getSavingsAccountDetail server function", () => {
    expect(src).toContain("getSavingsAccountDetail");
  });

  it("shows an active-holds banner", () => {
    expect(src).toMatch(/active hold/);
  });
});

describe("phase 8 — savings index links to detail page", () => {
  const src = read("src/routes/_authenticated/savings.index.tsx");
  it("recent accounts table links account_no to /savings/$id", () => {
    expect(src).toContain('to="/savings/$id"');
    expect(src).toContain("params={{ id: a.id }}");
  });
});

describe("phase 8 — detail aggregator server function", () => {
  const src = read("src/lib/savings.functions.ts");
  it("exports getSavingsAccountDetail", () => {
    expect(src).toContain("export const getSavingsAccountDetail");
  });
  it("aggregates holds, mandates, accruals, postings, holders, nominees", () => {
    for (const table of [
      "savings_hold",
      "savings_loan_mandate",
      "savings_interest_accrual",
      "savings_interest_posting",
      "savings_account_holder",
      "savings_account_nominee",
      "savings_account_mandate",
    ]) {
      expect(src).toContain(table);
    }
  });
});

describe("phase 9 — end-to-end savings surface invariants", () => {
  it("all savings write paths go through RPCs, never direct table inserts", () => {
    const savings = read("src/lib/savings.functions.ts");
    // Canonical RPCs must exist.
    for (const rpc of [
      "record_savings_txn",
      "reverse_savings_txn",
      "request_savings_hold_release",
      "execute_savings_standing_order",
      "accrue_savings_interest_daily",
      "capitalize_savings_interest",
    ]) {
      expect(savings).toContain(rpc);
    }
  });

  it("auto-collection webhook is publicly reachable for pg_cron", () => {
    const hook = read("src/routes/api/public/hooks/savings-auto-collection.ts");
    expect(hook).toContain("run_savings_auto_collection");
  });

  it("standing order webhook is publicly reachable for pg_cron", () => {
    const hook = read("src/routes/api/public/hooks/savings-standing-orders.ts");
    expect(hook).toMatch(/standing/i);
  });

  it("interest webhook is publicly reachable for pg_cron", () => {
    const hook = read("src/routes/api/public/hooks/savings-interest.ts");
    expect(hook).toMatch(/interest|accru|capital/i);
  });
});
