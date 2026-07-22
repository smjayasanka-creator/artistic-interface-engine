import { describe, expect, it } from "vitest";
import {
  API_CONTRACTS,
  contractsByResource,
  getContractById,
} from "@/lib/api-contract";

describe("api-contract registry", () => {
  it("has unique ids and paths", () => {
    const ids = API_CONTRACTS.map((c) => c.id);
    const paths = API_CONTRACTS.map((c) => `${c.method} ${c.path}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("every non-system write contract declares a response schema", () => {
    for (const c of API_CONTRACTS) {
      if (c.resource === "system") continue;
      if (c.method === "GET") continue;
      expect(c.response, `${c.id} missing response`).toBeTruthy();
      expect(c.fields.length, `${c.id} missing field docs`).toBeGreaterThan(0);
      // Endpoints that accept a JSON body must declare a request schema.
      const takesBody = c.method === "POST" || c.method === "PATCH" || c.method === "PUT";
      const hasBodyField = c.fields.some((f) => f.inbound && !f.notes?.includes("Path parameter"));
      if (takesBody && hasBodyField) {
        expect(c.request, `${c.id} missing request`).toBeTruthy();
      }
    }
  });

  it("every scoped endpoint carries a standard error catalogue", () => {
    for (const c of API_CONTRACTS) {
      if (!c.scope) continue;
      const codes = c.errors.map((e) => e.code);
      expect(codes, `${c.id} missing 401`).toContain(401);
      expect(codes, `${c.id} missing 403`).toContain(403);
      expect(codes, `${c.id} missing 400`).toContain(400);
    }
  });

  it("clients.create is registered and documents duplicate_client", () => {
    const c = getContractById("clients.create");
    expect(c).toBeTruthy();
    expect(c!.errors.some((e) => e.error === "duplicate_client")).toBe(true);
    expect(c!.requiresIdempotency).toBe(true);
  });

  it("resource grouping covers every contract", () => {
    const grouped = contractsByResource();
    const total = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(API_CONTRACTS.length);
  });
});
