import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { NextRequest, NextResponse } from "next/server";
import ts from "typescript";
import * as returnPaths from "../../../components/account/returnPath";

function callbackHost(outcome: "success" | "error" | "rejection") {
  const codes: string[] = []; let creates = 0;
  const loaded = { exports: {} as { GET: (request: NextRequest) => Promise<Response> } };
  const source = readFileSync(resolve("app/auth/callback/route.ts"), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: loaded.exports, URL, process: { env: {} },
    require(name: string) {
      if (name === "next/server") return { NextResponse };
      if (name === "@/components/account/returnPath") return returnPaths;
      if (name === "@supabase/ssr") return { createServerClient: (_url: unknown, _key: unknown, options: {
        cookies: { getAll(): { name: string; value: string }[]; setAll(values: { name: string; value: string; options: { path: string; httpOnly: boolean; sameSite: "lax" } }[]): void };
      }) => {
        creates++; assert.ok(options.cookies.getAll().some(cookie => cookie.name === "fixture-input"));
        return { auth: { exchangeCodeForSession: async (code: string) => {
          codes.push(code);
          if (outcome === "rejection") throw new Error("private exchange diagnostic");
          if (outcome === "success") options.cookies.setAll([{ name: "fixture-session", value: "synthetic", options: { path: "/", httpOnly: true, sameSite: "lax" } }]);
          return { error: outcome === "error" ? { message: "private exchange diagnostic", code: "private-code" } : null };
        } } };
      } };
      throw new Error("Unexpected callback dependency: " + name);
    },
  });
  return { codes, get creates() { return creates; }, get: (url: string) => loaded.exports.GET(new NextRequest(url, { headers: { cookie: "fixture-input=synthetic" } })) };
}

for (const next of ["/admin/research?tab=notes#item", "/symbol/طلا?tab=overview#chart", "https://evil.example", "//evil.example", "/\\evil.example", "/market\nnext", "javascript:alert(1)", "", "/" + "a".repeat(2048)]) {
  for (const hasCode of [false, true]) {
    test("actual GET failure preserves only sanitized next: code=" + hasCode + " next=" + JSON.stringify(next).slice(0,80), async () => {
      const host = callbackHost("error"), request = new URL("https://site.example/auth/callback");
      request.searchParams.set("next", next); if (hasCode) request.searchParams.set("code", "fixture-code-private");
      const response = await host.get(request.href), target = new URL(response.headers.get("location")!);
      assert.equal(target.origin, request.origin); assert.equal(target.pathname, "/login");
      assert.equal(target.searchParams.get("error"), "auth_callback_failed");
      assert.equal(target.searchParams.get("next"), next.startsWith("/admin/") || next.startsWith("/symbol/") ? next : "/dashboard");
      assert.deepEqual([...target.searchParams.keys()].sort(), ["error", "next"]);
      assert.doesNotMatch(target.href, /private|diagnostic|fixture-code/);
      assert.equal(host.creates, hasCode ? 1 : 0);
      assert.deepEqual(host.codes, hasCode ? ["fixture-code-private"] : []);
    });
  }
}

test("a rejected callback exchange returns the same safe generic failure", async () => {
  const response = await callbackHost("rejection").get("https://site.example/auth/callback?code=fixture-code&next=%2Fadmin%2Fresearch");
  const target = new URL(response.headers.get("location")!);
  assert.equal(target.pathname, "/login"); assert.equal(target.searchParams.get("next"), "/admin/research");
  assert.equal(target.searchParams.get("error"), "auth_callback_failed");
  assert.doesNotMatch(target.href, /private|diagnostic|fixture-code/);
});

for (const next of ["/admin/research?tab=notes#item", "//evil.example"]) {
  test("successful actual GET preserves existing cookie behavior and safe destination: " + next, async () => {
    const host = callbackHost("success");
    const response = await host.get("https://site.example/auth/callback?code=fixture-code&next=" + encodeURIComponent(next));
    assert.equal(response.headers.get("location"), "https://site.example" + (next.startsWith("/admin/") ? next : "/dashboard"));
    assert.match(response.headers.get("set-cookie") ?? "", /fixture-session=synthetic; Path=\/; HttpOnly; SameSite=lax/i);
    assert.deepEqual(host.codes, ["fixture-code"]);
  });
}
