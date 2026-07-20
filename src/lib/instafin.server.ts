// Server-only helper for Instafin (Oradian) core banking integration.
// Never import from client/route module scope — use inside handlers only.

export type InstafinCreatePersonInput = {
  first_name: string;
  last_name: string;
  phone_country_code: string; // e.g. "+94"
  phone: string;
  date_of_birth?: string | null;
  email?: string | null;
  gender?: string | null;
  address?: string | null;
  gn_division?: string | null;
  divisional_secretariat?: string | null;
  district?: string | null;
  province?: string | null;
};

export type InstafinCreatePersonResult = {
  ID?: string;
  clientID?: number | string;
  [k: string]: unknown;
};

export class InstafinError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// ISO2 region code inferred from country calling code (best-effort; Sri Lanka default).
function regionCodeFromCallingCode(cc: string): string {
  const c = cc.replace(/[^\d+]/g, "").replace(/^\+/, "");
  const map: Record<string, string> = {
    "94": "LK",
    "91": "IN",
    "1": "US",
    "44": "GB",
    "61": "AU",
    "65": "SG",
    "60": "MY",
    "971": "AE",
    "966": "SA",
    "234": "NG",
    "254": "KE",
  };
  return map[c] ?? "LK";
}

export function buildCreatePersonPayload(input: InstafinCreatePersonInput) {
  const regionCode = regionCodeFromCallingCode(input.phone_country_code);
  const payload: Record<string, unknown> = {
  // NOTE: The CreatePerson endpoint does not accept the "IndividualClient" role
  // (Instafin returns "Cannot create a person with the following roles using this endpoint").
  // Also, the free-text address block is validated against Instafin's hierarchical
  // "Address" custom lookup and will be rejected — omit it here and let the local
  // record retain the address.
  const genderID = mapGenderID(input.gender);
  const payload: Record<string, unknown> = {
    name: "",
    beneficiaries: [],
    tagsID: [],
    personal: {
      firstName: input.first_name,
      lastName: input.last_name,
      sourceOfIncomeIDs: [],
      dependants: [],
      ownedBusinessesIDs: [],
      ...(genderID ? { genderID } : {}),
      ...(input.date_of_birth ? { dateOfBirth: input.date_of_birth } : {}),
    },
    mobile: { regionCode, number: input.phone },
  };
  if (input.email) payload.email = input.email;
  return payload;
}

function mapGenderID(g?: string | null): string | null {
  if (!g) return null;
  const v = g.trim().toLowerCase();
  if (v === "m" || v === "male") return "Male";
  if (v === "f" || v === "female") return "Female";
  if (v === "other" || v === "o") return "Other";
  return g;
}

export async function instafinCreatePerson(input: InstafinCreatePersonInput): Promise<{
  result: InstafinCreatePersonResult;
  requestBody: unknown;
  responseBody: unknown;
  status: number;
}> {
  const baseUrl = process.env.INSTAFIN_BASE_URL;
  const user = process.env.INSTAFIN_USERNAME;
  const pass = process.env.INSTAFIN_PASSWORD;
  if (!baseUrl || !user || !pass) {
    throw new InstafinError(500, "Instafin credentials are not configured on the server.", null);
  }
  const url = `${baseUrl.replace(/\/$/, "")}/submit/instafin.CreatePerson`;
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const requestBody = buildCreatePersonPayload(input);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (e) {
    throw new InstafinError(0, `Could not reach Instafin: ${(e as Error).message}`, null);
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg = friendlyError(res.status, body);
    throw new InstafinError(res.status, msg, body);
  }
  return {
    result: (body as InstafinCreatePersonResult) ?? {},
    requestBody,
    responseBody: body,
    status: res.status,
  };
}

function friendlyError(status: number, body: unknown): string {
  if (status === 401 || status === 403)
    return "Instafin credentials rejected — check backend secrets.";
  if (status === 409) return "Instafin conflict — please retry.";
  if (status === 429) return "Instafin is busy, please retry in a moment.";
  if (status >= 500) return `Instafin server error (${status}).`;
  // 400 FieldErrors — try to surface field messages
  try {
    const b = body as {
      fieldErrors?: Array<{ field?: string; message?: string }>;
      message?: string;
    };
    if (b?.fieldErrors?.length) {
      return (
        "Instafin rejected: " +
        b.fieldErrors.map((f) => `${f.field ?? "?"}: ${f.message ?? ""}`).join("; ")
      );
    }
    if (b?.message) return `Instafin rejected: ${b.message}`;
  } catch {
    /* ignore */
  }
  return `Instafin rejected the request (${status}).`;
}
