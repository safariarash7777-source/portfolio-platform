import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Handler regression with SDK doubles. Real Postgres policy/RPC tests are separate.
const requireLocal = createRequire(import.meta.url);
for (const role of ["user", "admin"] as const) {
  for (const method of ["GET", "POST", "PATCH"] as const) {
    test(`entitlements ${method} retains the DB role gate: ${role}`, async () => {
      let writes = 0;
      const client = {
        auth: { getUser: async () => ({ data: { user: { id: "synthetic-actor" } } }) },
        from: (table: string) => {
          if (table !== "profiles") writes++;
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role } }) }) }) };
        },
      };
      const loaded = { exports: {} as Record<string, (request: Request) => Promise<Response>> };
      runInNewContext(ts.transpileModule(readFileSync(new URL("../../app/api/admin/entitlements/route.ts", import.meta.url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText, {
        exports: loaded.exports,
        require: (name: string) => name === "@/lib/supabase/server"
          ? { createClient: async () => client } : requireLocal(name),
        URL,
      });
      const response = await loaded.exports[method](new Request("https://site.example/api/admin/entitlements", {
        method, ...(method === "GET" ? {} : { body: "{}", headers: { "Content-Type": "application/json" } }),
      }));
      assert.equal(response.status, role === "user" ? 403 : 400);
      assert.equal(writes, 0);
    });
  }
}
