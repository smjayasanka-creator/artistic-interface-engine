import { describe, expect, it } from "vitest";
import { ENDPOINTS, endpointSpec } from "@/routes/_authenticated/api";

// Regression: `clients.create` (and every other listed endpoint) must have
// an explicit case in endpointSpec(). Missing cases silently fall through
// to the health endpoint's spec, which is what shipped before this test.
describe("API endpoint spec registry", () => {
  const HEALTH_MARKER = "service_unavailable";

  it("every ENDPOINTS entry has a dedicated spec (not the health fallback)", () => {
    for (const e of ENDPOINTS) {
      if (e.scope === "—") continue; // health itself
      const spec = endpointSpec(e.scope, e.method);
      const onlyHealthError =
        spec.errors.length === 1 && spec.errors[0].error === HEALTH_MARKER;
      expect(
        onlyHealthError,
        `Endpoint "${e.channel}" (scope="${e.scope}") is falling through to the health spec — add a case in endpointSpec().`,
      ).toBe(false);
    }
  });

  it("clients.create returns a client_id in the example response", () => {
    const spec = endpointSpec("clients.create", "POST");
    const body = spec.responseExample as Record<string, unknown>;
    expect(body.status).toBe("created");
    expect(typeof body.client_id).toBe("string");
    expect(body.client_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("clients.create request example matches the documented required fields", () => {
    const spec = endpointSpec("clients.create", "POST");
    const req = spec.requestExample as Record<string, unknown>;
    for (const key of [
      "first_name",
      "last_name",
      "phone_country_code",
      "phone",
      "national_id",
      "date_of_birth",
      "gender",
      "address",
      "gn_division",
      "divisional_secretariat",
      "district",
      "province",
    ]) {
      expect(req[key], `clients.create example missing ${key}`).toBeDefined();
    }
  });
});
