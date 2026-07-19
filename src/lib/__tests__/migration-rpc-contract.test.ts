/**
 * Migration ↔ RPC contract test.
 *
 * Statically scans src/**\/*.{ts,tsx} for every `.rpc("name", ...)` call and
 * verifies that a matching `CREATE (OR REPLACE) FUNCTION public.<name>(...)`
 * exists somewhere under supabase/migrations. This catches misspelled or
 * deleted RPC names in CI without needing a live database.
 *
 * When a legitimate RPC is provided by an extension or otherwise cannot be
 * discovered by scanning migrations, add it to KNOWN_EXTERNAL_RPCS below with
 * a short note explaining why.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

const KNOWN_EXTERNAL_RPCS = new Set<string>([
  // pg_net / postgres extensions, if any get called by name — none today.
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function collectRpcCalls(): Map<string, string[]> {
  const calls = new Map<string, string[]>();
  const files = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
  const rpcRe = /\.rpc\(\s*["'`]([a-zA-Z_][a-zA-Z0-9_]*)["'`]/g;
  for (const f of files) {
    if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
    const src = readFileSync(f, "utf8");
    let m: RegExpExecArray | null;
    while ((m = rpcRe.exec(src))) {
      const name = m[1];
      const list = calls.get(name) ?? [];
      list.push(f.replace(ROOT + "/", ""));
      calls.set(name, list);
    }
  }
  return calls;
}

function collectMigrationFunctions(): Set<string> {
  const names = new Set<string>();
  const dir = join(ROOT, "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(/gi;
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) names.add(m[1]);
  }
  return names;
}

describe("migration ↔ RPC contract", () => {
  const calls = collectRpcCalls();
  const defined = collectMigrationFunctions();

  it("finds at least one .rpc call and one CREATE FUNCTION (self-check)", () => {
    expect(calls.size).toBeGreaterThan(0);
    expect(defined.size).toBeGreaterThan(0);
  });

  it("every RPC referenced from src/** is defined in a migration", () => {
    const missing: { name: string; callers: string[] }[] = [];
    for (const [name, callers] of calls) {
      if (KNOWN_EXTERNAL_RPCS.has(name)) continue;
      if (!defined.has(name)) missing.push({ name, callers });
    }
    if (missing.length > 0) {
      const msg = missing
        .map((m) => `  - ${m.name}  ← called from:\n      ${m.callers.join("\n      ")}`)
        .join("\n");
      throw new Error(
        `The following RPCs are called from application code but have no matching ` +
          `CREATE FUNCTION in supabase/migrations:\n${msg}\n\n` +
          `Either add a migration that creates the function or fix the misspelled name.`,
      );
    }
    expect(missing).toEqual([]);
  });
});
