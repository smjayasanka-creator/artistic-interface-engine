/**
 * Regression guards for the canonical Day-End orchestrator.
 *
 * File-level assertions pin the invariants from the 23-point corrective
 * plan so `bun run test:run` catches accidental regressions without
 * spinning up a live database.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const exists = (rel: string) => existsSync(resolve(process.cwd(), rel));

const eod = read("src/lib/eod.functions.ts");
const hook = read("src/routes/api/public/hooks/eod-close.ts");
const tab = read("src/components/mzizi/EodTab.tsx");

describe("EOD — canonical orchestrator surface", () => {
  it("exposes precheck, initiate, approve, runStep, runAllSteps server fns", () => {
    for (const fn of ["runPreCheck", "initiateEod", "approveEod", "runStep", "runAllSteps"]) {
      expect(eod).toContain(`export const ${fn}`);
    }
  });

  it("orchestrator step ordering is complete and stable", () => {
    for (const step of [
      "loan_accrual",
      "fd_accrual",
      "penalty_charges",
      "par_npa",
      "fd_maturity",
      "savings_interest",
      "gl_post",
      "trial_balance",
      "snapshots",
      "reports",
      "rollover",
    ]) {
      expect(eod).toContain(`"${step}"`);
    }
  });

  it("scheduled hook shares the orchestrator step function (req 1, 11)", () => {
    expect(hook).toContain('from "@/lib/eod.functions"');
    expect(hook).toContain("runOrchestratorStep");
  });
});

describe("EOD — dual control and permissions (req 5, 7)", () => {
  it("runStep enforces eod.process permission before executing", () => {
    expect(eod).toMatch(/has_permission[\s\S]{0,300}eod\.process/);
  });
  it("scheduled hook authenticates with cron signature", () => {
    expect(hook).toContain("authenticateCronRequest");
  });
  it("scheduled path uses a dedicated system-initiate RPC (req 5)", () => {
    expect(hook).toContain("eod_system_initiate");
  });
});

describe("EOD — timezone-aware scheduling (req 20, 21)", () => {
  it("hook computes business date per company timezone, not UTC yesterday", () => {
    expect(hook).toMatch(/timeZone: tz/);
    expect(hook).toMatch(/auto_eod_enabled/);
    expect(hook).toMatch(/auto_eod_time/);
    expect(hook).toMatch(/company/);
  });
  it("honours per-branch auto_eod flag", () => {
    expect(hook).toMatch(/auto_eod/);
  });
});

describe("EOD — financial correctness", () => {
  it("FD accrual divides annual rate by 100 (req 12)", () => {
    // principal * (rate / 100) / dayCount
    expect(eod).toMatch(/rate_at_booking\)\s*\/\s*100/);
  });
  it("trial balance step fails when debits and credits diverge (req 16)", () => {
    expect(eod).toMatch(/Trial balance out of balance/);
  });
  it("snapshots step delegates to eod_write_snapshots RPC (req 17, 18)", () => {
    expect(eod).toContain("eod_write_snapshots");
  });
  it("savings interest reuses existing accrual + capitalization RPCs (req 11, 14)", () => {
    expect(eod).toContain("run_savings_interest_accrual");
    expect(eod).toContain("run_savings_interest_capitalization");
  });
  it("step failures are recorded as failed, not skipped (req 15)", () => {
    // The catch block writes `_status: 'failed'` when an error is set.
    expect(eod).toMatch(/_status:\s*error\s*\?\s*"failed"/);
  });
});

describe("EOD — resume / retry safety (req 3, 4)", () => {
  it("runAllSteps skips already-completed steps rather than rejecting the run", () => {
    expect(eod).toMatch(/status\s*===\s*"completed".*continue/s);
  });
  it("uses eod_initiate which is idempotent for resume", () => {
    expect(eod).toContain("eod_initiate");
  });
});

describe("EOD — UI surfaces (req 22)", () => {
  it("EodTab wires precheck, initiate, approve, retry, and audit history", () => {
    for (const symbol of [
      "runPreCheck",
      "initiateEod",
      "approveEod",
      "runAllSteps",
      "runStep",
      "getEodRun",
    ]) {
      expect(tab).toContain(symbol);
    }
    expect(tab).toMatch(/Pre-check/);
    expect(tab).toMatch(/Approve/);
    expect(tab).toMatch(/Retry|Resume/);
    expect(tab).toMatch(/Audit history/);
  });

  it("legacy /eod route redirects into the Admin Day-End tab (req 22)", () => {
    const p = "src/routes/_authenticated/eod.tsx";
    expect(exists(p)).toBe(true);
    expect(read(p)).toMatch(/redirect\(\{\s*to:\s*"\/admin"/);
  });
});
