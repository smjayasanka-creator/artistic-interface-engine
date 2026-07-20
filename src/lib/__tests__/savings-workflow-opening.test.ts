/**
 * Regression guards for the workflow-controlled Savings account opening
 * + initial-deposit funding flow.
 *
 * File-level assertions — pinning the invariants without a live DB so
 * `bun run test:run` catches accidental removal.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const exists = (rel: string) => existsSync(resolve(process.cwd(), rel));

describe("savings opening — server functions", () => {
  const src = read("src/lib/savings.functions.ts");

  it("exposes submit_savings_account_opening via a server function", () => {
    expect(src).toContain("submit_savings_account_opening");
  });

  it("exposes activate_savings_account via a server function", () => {
    expect(src).toContain("activate_savings_account");
  });

  it("submission handler is auth-gated with requireSupabaseAuth", () => {
    // Both RPC calls must live within createServerFn chains guarded by
    // requireSupabaseAuth so anonymous users cannot open or activate.
    expect(src).toMatch(/requireSupabaseAuth/);
  });
});

describe("savings opening — workflow completion hook", () => {
  const src = read("src/lib/workflow.functions.ts");
  it("calls finalize_savings_account_opening when workflow approves", () => {
    expect(src).toContain("finalize_savings_account_opening");
  });
});

describe("savings opening — UI wiring", () => {
  it("wizard routes through submit_savings_account_opening lifecycle", () => {
    const src = read("src/routes/_authenticated/savings.new.tsx");
    expect(src).toMatch(/pending_approval/);
    expect(src).toMatch(/pending_funding/);
  });

  it("detail page shows lifecycle banner and inline activation form", () => {
    const path = "src/routes/_authenticated/savings.$id.tsx";
    expect(exists(path)).toBe(true);
    const src = read(path);
    expect(src).toMatch(/pending_approval/);
    expect(src).toMatch(/pending_funding/);
    // Inline activation must call the server function.
    expect(src).toMatch(/activateSavingsAccount|activate_savings_account/);
  });
});

describe("savings opening — deposits gated to active accounts", () => {
  // record_savings_txn must refuse pending_approval / pending_funding
  // except through the activation flow.
  const src = read("src/lib/savings.functions.ts");
  it("posts nothing before activation (no direct deposit path from opening)", () => {
    // Guardrail: the opening submit function must not call record_savings_txn.
    const submitBlock = src.slice(
      src.indexOf("submit_savings_account_opening"),
      src.indexOf("submit_savings_account_opening") + 2000,
    );
    expect(submitBlock).not.toMatch(/record_savings_txn/);
  });
});
