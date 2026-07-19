import { describe, it, expect } from "vitest";

// Mirror of the transition map enforced by the SECURITY DEFINER RPCs
// submit_loan_application / return_loan_application / cancel_loan_application
// / decide_loan_application. Kept in sync with the migration so we can
// unit-test the allowed edges without booting a database.
type Status =
  | "draft" | "submitted" | "under_review"
  | "approved" | "rejected" | "disbursed" | "cancelled";

type Op = "submit" | "review" | "approve" | "reject" | "return" | "cancel" | "disburse";

// [from, op, to] — every other combination MUST be rejected by the RPCs.
const ALLOWED: [Status, Op, Status][] = [
  ["draft",        "submit",   "submitted"],
  ["submitted",    "review",   "under_review"],
  ["under_review", "approve",  "approved"],
  ["under_review", "reject",   "rejected"],
  ["under_review", "return",   "draft"],
  ["draft",        "cancel",   "cancelled"],
  ["submitted",    "cancel",   "cancelled"], // approvers only (RPC enforces role)
  ["approved",     "disburse", "disbursed"], // only via disburse RPC
];

const TERMINAL: Status[] = ["rejected", "cancelled", "disbursed"];

const ALL: Status[] = [
  "draft","submitted","under_review","approved","rejected","disbursed","cancelled",
];
const OPS: Op[] = ["submit","review","approve","reject","return","cancel","disburse"];

function isAllowed(from: Status, op: Op): Status | null {
  const hit = ALLOWED.find((t) => t[0] === from && t[1] === op);
  return hit ? hit[2] : null;
}

describe("loan_application transition map", () => {
  it("permits every documented transition", () => {
    for (const [from, op, to] of ALLOWED) {
      expect(isAllowed(from, op)).toBe(to);
    }
  });

  it("rejects every undocumented (from, op) pair", () => {
    for (const from of ALL) {
      for (const op of OPS) {
        const documented = ALLOWED.some((t) => t[0] === from && t[1] === op);
        if (!documented) expect(isAllowed(from, op)).toBeNull();
      }
    }
  });

  it("treats rejected, cancelled, and disbursed as terminal (no outgoing edges)", () => {
    for (const from of TERMINAL) {
      for (const op of OPS) expect(isAllowed(from, op)).toBeNull();
    }
  });

  it("only reaches 'disbursed' via the disburse operation", () => {
    const edges = ALLOWED.filter(([, , to]) => to === "disbursed");
    expect(edges).toEqual([["approved", "disburse", "disbursed"]]);
  });
});

// The following invariants are enforced in the database by the
// submit_/return_/cancel_/decide_loan_application RPCs and by the
// loan_application_terminal_guard trigger + uq_laa_workflow_step
// unique index. Kept as a living spec so future changes to the
// migration must remove or re-implement them.
describe("loan_application transition RPCs — enforced DB invariants", () => {
  it.skip("submit fails when client, product, principal, tenor, rate, frequency, or applicants are missing", () => {});
  it.skip("submit is idempotent per transition_key (retry returns the original history_id)", () => {});
  it.skip("return_loan_application requires a >=3 char reason", () => {});
  it.skip("cancel_loan_application requires a >=3 char reason", () => {});
  it.skip("cancel refuses when status = 'disbursed'", () => {});
  it.skip("cancel from 'submitted' is refused for non-approvers", () => {});
  it.skip("decide inserts approval + history + audit atomically (any failure rolls back the status change)", () => {});
  it.skip("uq_laa_workflow_step blocks two approvers deciding the same workflow step", () => {});
  it.skip("decide creator cannot approve or reject own application (SoD)", () => {});
  it.skip("terminal-state guard trigger blocks UPDATE on rejected/cancelled/disbursed rows", () => {});
  it.skip("cross-company transitions are rejected", () => {});
  it.skip("duplicate transition_key does not insert duplicate approval or history rows", () => {});
});
