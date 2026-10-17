import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import * as preferences from "../../../../../lib/desk/preferences";
import { authSessionFailure } from "../../../../../lib/auth/session-error";
const validReceipt = {
  preferences: { schemaVersion: 1, layout: 2, hiddenTools: [] },
  revision: 1,
  updatedAt: "2026-10-17T12:00:00Z",
  allowedTools: [...preferences.DESK_TOOLS],
};
function route(
  options: {
    user?: boolean;
    authError?: unknown;
    role?: string;
    roleError?: boolean;
    rpcCode?: string;
    data?: unknown;
  } = {},
) {
  const calls: { name: string; args: unknown }[] = [];
  const db = {
    auth: {
      getUser: async () => ({
        data: {
          user: options.user === false ? null : { id: "synthetic-admin" },
        },
        error: options.authError ?? null,
      }),
    },
    from: (table: string) => {
      assert.equal(table, "profiles");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { role: options.role ?? "admin" },
              error: options.roleError ? { code: "synthetic" } : null,
            }),
          }),
        }),
      };
    },
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return {
        data: options.data === undefined ? validReceipt : options.data,
        error: options.rpcCode ? { code: options.rpcCode } : null,
      };
    },
  };
  const exported: {
    GET: () => Promise<Response>;
    PUT: (req: NextRequest) => Promise<Response>;
  } = {} as never;
  const source = ts.transpileModule(
    readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(source, {
    exports: exported,
    require: (id: string) => {
      if (id === "next/server") return { NextResponse };
      if (id === "@/lib/supabase/server")
        return { createClient: async () => db };
      if (id === "@/lib/desk/preferences") return preferences;
      if (id === "@/lib/auth/session-error") return { authSessionFailure };
      throw new Error(id);
    },
  });
  return { ...exported, calls };
}
const body = {
  schemaVersion: 1,
  layout: 2,
  hiddenTools: [],
  expectedRevision: 0,
};
const request = (value: unknown = body, origin = "https://site.example.test") =>
  new NextRequest("https://site.example.test/api/admin/desk/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(value),
  });
const status = (response: Response, expected: number) => {
  assert.equal(response.status, expected);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
};
test("actual GET/PUT deny missing session and ordinary member before RPC; auth/role outages are 503", async () => {
  for (const [options, expected] of [
    [{ user: false }, 401],
    [{ authError: { status: 401 } }, 401],
    [{ authError: { status: 503 } }, 503],
    [{ role: "member" }, 403],
    [{ roleError: true }, 503],
  ] as const) {
    const api = route(options);
    status(await api.GET(), expected);
    status(await api.PUT(request()), expected);
    assert.equal(api.calls.length, 0);
  }
});
test("actual PUT rejects cross-origin, forged identity and invalid schema before RPC", async () => {
  const api = route();
  status(await api.PUT(request(body, "https://external.example.test")), 403);
  status(await api.PUT(request({ ...body, actor_id: "other" })), 400);
  status(await api.PUT(request({ ...body, schemaVersion: 2 })), 400);
  assert.equal(api.calls.length, 0);
});
test("actual API returns validated private receipts and only allowlisted RPC arguments", async () => {
  const api = route();
  status(await api.GET(), 200);
  status(await api.PUT(request()), 200);
  assert.equal(api.calls[1].name, "save_admin_desk_preferences");
  assert.equal(
    JSON.stringify(api.calls[1].args),
    JSON.stringify({
      p_schema_version: 1,
      p_layout: 2,
      p_hidden_tools: [],
      p_expected_revision: 0,
    }),
  );
});
test("actual API distinguishes CAS conflict, late permission denial and infrastructure failure; malformed receipts fail closed", async () => {
  for (const [code, expected] of [
    ["40001", 409],
    ["42501", 403],
    ["PGRST202", 503],
  ]) {
    const api = route({ rpcCode: code as string });
    status(await api.PUT(request()), expected as number);
  }
  status(await route({ rpcCode: "42501" }).GET(), 403);
  const invalid = route({ data: { ...validReceipt, role: "admin" } });
  status(await invalid.GET(), 503);
  status(await invalid.PUT(request()), 503);
});
