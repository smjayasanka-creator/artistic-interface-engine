// Build an OpenAPI 3.1 document and a Postman v2.1 collection from the
// central API_CONTRACTS registry, so the developer portal never ships docs
// or SDKs that drift from the wire contract.
//
// We intentionally do NOT introspect Zod schemas here (they live in a
// .server.ts file and we want this generator client-safe). Instead we
// derive properties from ApiFieldDoc — the same source the API explorer
// and data catalogue render.

import { API_CONTRACTS, type ApiContract, type ApiFieldDoc } from "@/lib/api-contract";

type JsonSchema = Record<string, unknown>;

function fieldToProperty(f: ApiFieldDoc): JsonSchema {
  const base: JsonSchema = { description: f.label + (f.notes ? ` — ${f.notes}` : "") };
  const t = f.type.toLowerCase();
  if (t === "int") return { ...base, type: "integer" };
  if (t === "number") return { ...base, type: "number" };
  if (t === "boolean") return { ...base, type: "boolean" };
  if (t === "date") return { ...base, type: "string", format: "date" };
  if (t === "url") return { ...base, type: "string", format: "uri" };
  if (t === "uuid") return { ...base, type: "string", format: "uuid" };
  if (t === "array") return { ...base, type: "array", items: {} };
  if (t === "enum" || t === "string") return { ...base, type: "string" };
  return { ...base, type: "string" };
}

function assignPath(target: JsonSchema, path: string, prop: JsonSchema): void {
  const parts = path.split(".");
  let node: any = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    node.properties ||= {};
    node.properties[key] ||= { type: "object", properties: {} };
    node = node.properties[key];
  }
  node.properties ||= {};
  node.properties[parts[parts.length - 1]] = prop;
}

function buildObjectSchema(fields: ApiFieldDoc[], direction: "in" | "out"): JsonSchema {
  const root: JsonSchema = { type: "object", properties: {} };
  const required: string[] = [];
  for (const f of fields) {
    if (direction === "in" && !f.inbound) continue;
    if (direction === "out" && !f.outbound) continue;
    assignPath(root, f.path, fieldToProperty(f));
    if (direction === "in" && f.required && !f.path.includes(".")) required.push(f.path);
  }
  if (required.length > 0) root.required = required;
  return root;
}

function contractToOperation(c: ApiContract): JsonSchema {
  const op: JsonSchema = {
    operationId: c.id,
    summary: c.title,
    description: c.summary,
    tags: [c.resource],
  };
  const params: JsonSchema[] = [];
  if (c.requiresIdempotency) {
    params.push({
      in: "header",
      name: "Idempotency-Key",
      required: true,
      description: "Unique key to safely retry money-moving requests.",
      schema: { type: "string" },
    });
  }
  if (params.length > 0) op.parameters = params;

  if (c.method !== "GET") {
    const reqSchema = buildObjectSchema(c.fields, "in");
    op.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: reqSchema,
          ...(c.requestExample ? { example: c.requestExample } : {}),
        },
      },
    };
  }

  const responses: Record<string, JsonSchema> = {
    [c.method === "GET" ? "200" : c.id === "clients.create" ? "201" : "200"]: {
      description: "Success",
      content: {
        "application/json": {
          schema: buildObjectSchema(c.fields, "out"),
          ...(c.responseExample ? { example: c.responseExample } : {}),
        },
      },
    },
  };
  for (const e of c.errors) {
    responses[String(e.code)] = {
      description: `${e.error} — ${e.meaning}`,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              error: { type: "string", example: e.error },
              message: { type: "string" },
              details: { type: "object" },
            },
          },
        },
      },
    };
  }
  op.responses = responses;

  if (c.scope) {
    op.security = [{ bearerAuth: [c.scope] }];
  }
  return op;
}

export function buildOpenApiDocument(baseUrl: string): JsonSchema {
  const paths: Record<string, JsonSchema> = {};
  for (const c of API_CONTRACTS) {
    paths[c.path] ||= {};
    (paths[c.path] as any)[c.method.toLowerCase()] = contractToOperation(c);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Mzizi Platform API",
      version: "1.0.0",
      description:
        "REST API for the Mzizi core banking platform. All requests must be authenticated with a bearer API key. Sandbox keys begin with mz_test_ and production keys with mz_live_.",
    },
    servers: [{ url: baseUrl }],
    tags: Array.from(new Set(API_CONTRACTS.map((c) => c.resource))).map((r) => ({
      name: r,
    })),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API key (mz_test_… / mz_live_…)",
        },
      },
    },
    paths,
  };
}

export function buildPostmanCollection(baseUrl: string): JsonSchema {
  const items = API_CONTRACTS.map((c) => {
    const url = `${baseUrl}${c.path}`;
    const item: JsonSchema = {
      name: `${c.method} ${c.title}`,
      request: {
        method: c.method,
        header: [
          ...(c.scope
            ? [{ key: "Authorization", value: "Bearer {{apiKey}}", type: "text" }]
            : []),
          ...(c.method !== "GET"
            ? [{ key: "Content-Type", value: "application/json", type: "text" }]
            : []),
          ...(c.requiresIdempotency
            ? [{ key: "Idempotency-Key", value: "{{$guid}}", type: "text" }]
            : []),
        ],
        url: {
          raw: url,
          host: ["{{baseUrl}}"],
          path: c.path.replace(/^\//, "").split("/"),
        },
        description: c.summary,
        ...(c.method !== "GET"
          ? {
              body: {
                mode: "raw",
                raw: JSON.stringify(c.requestExample ?? {}, null, 2),
                options: { raw: { language: "json" } },
              },
            }
          : {}),
      },
    };
    return item;
  });

  return {
    info: {
      name: "Mzizi Platform API",
      _postman_id: "mzizi-platform-api",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      description: "Auto-generated from the Mzizi API contract registry.",
    },
    variable: [
      { key: "baseUrl", value: baseUrl },
      { key: "apiKey", value: "mz_test_replace_me" },
    ],
    item: items,
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
