// Synthetic JWTs and mocked transport only. No installed binding or live network.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contentHub from "../content-hub";
import { withDeadline } from "../deadline";
import type { readMediaContent } from "./content-read.server";

const require = createRequire(import.meta.url);
const origin = "https://62.60.191.24/liara-preview";
const source = readFileSync(new URL("./content-read.server.ts", import.meta.url), "utf8");
const jwt = (claims: Record<string, unknown> = {}, alg = "HS256") => [
  Buffer.from(JSON.stringify({ typ: "JWT", alg })).toString("base64url"),
  Buffer.from(JSON.stringify({ role: "anon", iss: "supabase", exp: 4102444800, ...claims })).toString("base64url"),
  Buffer.from("synthetic-signature").toString("base64url"),
].join(".");
const pair = (key = jwt()) => ({ VERCEL_ENV: "preview", FUNDAMENTAL_READ_URL: origin, FUNDAMENTAL_READ_ANON_KEY: key });
const row = (id = "synthetic-id") => ({ id, platform: "telegram", kind: "post", content_url: "https://t.me/example/1", title: "synthetic", description: null, published_at: "2026-11-04T12:00:00Z" });

function evaluate(text: string, imports: Record<string, unknown>, context: Record<string, unknown> = {}) {
  const mod = { exports: {} as Record<string, unknown> };
  runInNewContext(text, {
    module: mod, exports: mod.exports, Buffer, URLSearchParams, Object, Date,
    require: (id: string) => { if (!(id in imports)) throw new Error(`Unexpected dependency: ${id}`); return imports[id]; },
    ...context,
  });
  return mod.exports;
}
const compile = (text: string) => ts.transpileModule(text, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
// Use the actual approved selector and its actual public-key validator.
const selector = evaluate(compile(readFileSync(new URL("../fundamental/read-config.server.ts", import.meta.url), "utf8")), {
  "server-only": {}, "../liara-public-env.js": require("../liara-public-env.js"),
});
function reader(fetcher: typeof fetch, environment: Record<string, string | undefined> = {}, deadline = withDeadline, text = compile(source)) {
  return evaluate(text, {
    "server-only": {}, "../fundamental/read-config.server": selector,
    "../content-hub": contentHub, "../deadline": { withDeadline: deadline },
  }, { process: { env: environment }, fetch: fetcher }).readMediaContent as typeof readMediaContent;
}
const forbiddenLegacy = () => { throw new Error("legacy must not be used"); };

test("approved binding sends one exact bounded anonymous GET and preserves the existing content filter", async () => {
  const key = jwt({ fixture: "transport" }), environment = Object.freeze(pair(key));
  const calls: { url: URL; init: RequestInit }[] = [], limits: number[] = [];
  const read = reader(async (input, init) => {
    calls.push({ url: new URL(String(input)), init: init! });
    return Response.json([row(), { ...row("unknown-platform"), platform: "not-supported" }]);
  }, {}, (load, ms) => { limits.push(ms); return withDeadline(load, ms); });
  const result = await read(forbiddenLegacy, { environment });
  assert.equal(result.error, null);
  assert.equal(result.data?.length, 1);
  assert.equal(result.data?.[0].description, null);
  assert.equal(JSON.stringify(result.data?.[0]), JSON.stringify(row()));
  assert.deepEqual(limits, [4000]);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url.origin + url.pathname, `${origin}/rest/v1/content_hub`);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    select: "id,platform,kind,content_url,title,description,published_at", deleted_at: "is.null",
    published_at: "not.is.null", order: "published_at.desc", limit: "60",
  });
  assert.equal(init.method, "GET"); assert.equal(init.cache, "no-store");
  assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error");
  assert(init.signal instanceof AbortSignal);
  const headers = new Headers(init.headers);
  assert.deepEqual([...headers.keys()].sort(), ["apikey", "authorization"]);
  assert.equal(headers.get("apikey"), key); assert.equal(headers.get("authorization"), `Bearer ${key}`);
});

test("both overrides absent preserve the legacy result, session query and four-second bound with no public GET", async () => {
  const limits: number[] = [], legacyError = { code: "synthetic-RLS-error" };
  const read = reader(async () => { throw new Error("unexpected public fetch"); }, { VERCEL_ENV: "preview" }, (load, ms) => { limits.push(ms); return withDeadline(load, ms); });
  let calls = 0;
  const result = await read(async signal => { calls++; assert(signal instanceof AbortSignal); return { data: null, error: legacyError }; });
  assert.equal(result.error, legacyError); assert.equal(calls, 1); assert.deepEqual(limits, [4000]);
  const empty = await read(async () => ({ data: [], error: null }));
  assert.equal(empty.data?.length, 0); assert.equal(empty.error, null);
  const thrown = await read(async () => { throw new Error("synthetic legacy failure"); });
  assert.equal(thrown.data, null); assert.equal(thrown.error, true);
});

test("Production and unknown/local default environments always use exact legacy results regardless of FUND overrides", async () => {
  let network = 0, legacy = 0;
  for (const vercelEnv of ["production", undefined, "development", "local", "", "Preview"]) {
    for (const binding of [pair(), pair("invalid"), { FUNDAMENTAL_READ_URL: origin }, {}]) {
      const read = reader(async () => { network++; return Response.json([]); }, { ...binding, VERCEL_ENV: vercelEnv });
      const legacyResult = { data: null, error: { code: "synthetic-session-result" } };
      const result = await read(async signal => { legacy++; assert(signal instanceof AbortSignal); return legacyResult; });
      assert.equal(result, legacyResult);
    }
  }
  assert.equal(network, 0); assert.equal(legacy, 24);
});

test("any partial blank invalid expired or privileged override fails closed with zero network and zero legacy requests", async () => {
  let network = 0, legacy = 0;
  const read = reader(async () => { network++; return Response.json([]); });
  const invalid = [
    { FUNDAMENTAL_READ_URL: origin }, { FUNDAMENTAL_READ_ANON_KEY: jwt() },
    { FUNDAMENTAL_READ_URL: "", FUNDAMENTAL_READ_ANON_KEY: "" },
    ...[" ", "https://other.invalid/liara-preview", `${origin}/`, `${origin}?x=1`, `${origin}#x`, "http://62.60.191.24/liara-preview", "https://user:pass@62.60.191.24/liara-preview"].map(url => ({ ...pair(), FUNDAMENTAL_READ_URL: url })),
    ...["", " ", "invalid", jwt({ role: "service_role" }), jwt({ iss: "other" }), jwt({ exp: 1 }), jwt({}, "none")].map(key => pair(key)),
  ];
  for (const environment of invalid) {
    const result = await read(async () => { legacy++; return { data: [], error: null }; }, { environment: { ...environment, VERCEL_ENV: "preview" } });
    assert.equal(result.data, null); assert.equal(result.error, true);
  }
  assert.equal(network, 0); assert.equal(legacy, 0);
});

test("valid empty differs from HTTP body shape and request failures; failures neither retry nor fall back", async () => {
  let calls = 0;
  for (const response of [
    () => Response.json([]),
    () => new Response("synthetic failure", { status: 500 }),
    () => new Response("redirect", { status: 302, headers: { location: "https://other.invalid/" } }),
    () => new Response("not-json"), () => Response.json({ error: "synthetic" }),
    () => Response.json([{ ...row(), content_url: null }]),
    () => Response.json(Array.from({ length: 61 }, (_, i) => row(String(i)))),
    () => { throw new TypeError("synthetic transport failure"); },
  ]) {
    const read = reader(async () => { calls++; return response(); });
    const result = await read(forbiddenLegacy, { environment: pair() });
    if (calls === 1) { assert.equal(result.data?.length, 0); assert.equal(result.error, null); }
    else { assert.equal(result.data, null); assert.equal(result.error, true); }
  }
  assert.equal(calls, 8);
});

test("deadline aborts slow headers or body, even when the provider ignores abort", async () => {
  for (const slowBody of [false, true]) {
    let observed: AbortSignal | null | undefined;
    const read = reader(async (_input, init) => {
      observed = init?.signal;
      if (!slowBody) return new Promise<Response>(() => {});
      return { ok: true, json: () => new Promise(() => {}) } as Response;
    }, {}, (load, ms) => { assert.equal(ms, 4000); return withDeadline(load, 20); });
    const result = await read(forbiddenLegacy, { environment: pair() });
    assert.equal(result.error, true); assert.equal(result.data, null);
    assert.equal((observed as AbortSignal | null | undefined)?.aborted, true);
  }
});

test("concurrent reads capture their own pairs before await and do not mutate or cache across environments", async () => {
  const firstKey = jwt({ fixture: "first" }), secondKey = jwt({ fixture: "second" });
  const firstEnvironment = pair(firstKey), secondEnvironment = Object.freeze(pair(secondKey));
  const calls: string[] = [];
  const read = reader(async (_input, init) => {
    const key = new Headers(init?.headers).get("apikey")!; calls.push(key);
    await Promise.resolve();
    return Response.json([row(key === firstKey ? "first" : "second")]);
  });
  const first = read(forbiddenLegacy, { environment: firstEnvironment });
  firstEnvironment.FUNDAMENTAL_READ_ANON_KEY = "invalid-after-call";
  firstEnvironment.VERCEL_ENV = "production";
  const second = read(forbiddenLegacy, { environment: secondEnvironment });
  const results = await Promise.all([first, second]);
  assert.deepEqual(calls, [firstKey, secondKey]);
  assert.deepEqual(results.map(r => r.data?.[0].id), ["first", "second"]);
  assert.equal(secondEnvironment.FUNDAMENTAL_READ_ANON_KEY, secondKey);
});

test("compiled default reader captures direct binding fields rather than unmapped runtime aliases", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "media-read-binding-"));
  const bundled = require("next/dist/compiled/webpack/webpack"); bundled.init();
  const webpack = bundled.webpack, key = jwt({ fixture: "compiled" });
  try {
    await writeFile(join(temporary, "entry.js"), ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText);
    const compiler = webpack({
      mode: "development", target: "node", devtool: false, entry: join(temporary, "entry.js"),
      output: { path: temporary, filename: "reader.cjs", library: { type: "commonjs2" } },
      externals: [({ request }: { request?: string }, callback: (error?: Error | null, result?: string) => void) => callback(null, request?.startsWith(".") || request === "server-only" ? `commonjs ${request}` : undefined)],
      plugins: [new webpack.DefinePlugin({
        "process.env.VERCEL_ENV": JSON.stringify("preview"),
        "process.env.FUNDAMENTAL_READ_URL": JSON.stringify(origin),
        "process.env.FUNDAMENTAL_READ_ANON_KEY": JSON.stringify(key),
      })],
    });
    try {
      await new Promise<void>((accept, reject) => compiler.run((error: Error | null, stats?: { hasErrors: () => boolean; toString: () => string }) => {
        if (error || !stats || stats.hasErrors()) reject(error ?? new Error(stats?.toString() ?? "missing compiler stats")); else accept();
      }));
    } finally { await new Promise<void>((accept, reject) => compiler.close((error?: Error) => error ? reject(error) : accept())); }
    let calls = 0;
    const read = reader(async (input, init) => {
      calls++; assert.equal(new URL(String(input)).origin + new URL(String(input)).pathname, `${origin}/rest/v1/content_hub`);
      assert.equal(new Headers(init?.headers).get("apikey"), key);
      return Response.json([]);
    }, { VERCEL_ENV: "production", FUNDAMENTAL_READ_URL: "https://unmapped-runtime.invalid", FUNDAMENTAL_READ_ANON_KEY: "invalid-runtime" }, withDeadline, await readFile(join(temporary, "reader.cjs"), "utf8"));
    const result = await read(forbiddenLegacy);
    assert.equal(result.error, null); assert.equal(result.data?.length, 0); assert.equal(calls, 1);
  } finally {
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); assert(basename(temporary).startsWith("media-read-binding-"));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("insights consumer retains the exact legacy query and independent appearance client", async () => {
  const calls: unknown[][] = [];
  let clientCalls = 0, appearanceCalls = 0;
  const chain = {
    select: (...args: unknown[]) => { calls.push(["select", ...args]); return chain; },
    is: (...args: unknown[]) => { calls.push(["is", ...args]); return chain; },
    not: (...args: unknown[]) => { calls.push(["not", ...args]); return chain; },
    order: (...args: unknown[]) => { calls.push(["order", ...args]); return chain; },
    limit: (...args: unknown[]) => { calls.push(["limit", ...args]); return chain; },
    abortSignal: async (signal: AbortSignal) => { assert(signal instanceof AbortSignal); return { data: [row()], error: null }; },
  };
  const client = { from: (table: string) => { calls.push(["from", table]); return chain; } };
  const realRead = reader(async () => { throw new Error("unexpected public GET without override"); });
  const page = evaluate(compile(readFileSync(new URL("../../app/insights/page.tsx", import.meta.url), "utf8")), {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/lib/supabase/server": { createClient: async () => { clientCalls++; return client; } },
    "@/components/layout/Navbar": { default: "navbar" }, "@/components/layout/Footer": { default: "footer" },
    "@/components/insights/MediaHub": { default: "media-hub" }, "@/lib/content-hub": contentHub,
    "@/lib/media/content-read.server": { readMediaContent: realRead },
    "@/lib/metadata": { pageMetadata: () => ({}) },
    "@/lib/appearance/site-layout-server": { readSiteAppearance: async (receivedClient: unknown) => {
      appearanceCalls++; assert.equal(receivedClient, client);
      return { state: "ready", globalLayout: 2, previewLayout: null };
    } },
  }).default as (props: { searchParams: Promise<Record<string, string>> }) => Promise<{ props: { children: { type: string; props: Record<string, unknown> }[] } }>;
  const output = await page({ searchParams: Promise.resolve({}) });
  assert.equal(clientCalls, 1); assert.equal(appearanceCalls, 1);
  assert.equal(JSON.stringify(calls), JSON.stringify([
    ["from", "content_hub"], ["select", "id, platform, kind, content_url, title, description, published_at"],
    ["is", "deleted_at", null], ["not", "published_at", "is", null],
    ["order", "published_at", { ascending: false }], ["limit", 60],
  ]));
  const media = output.props.children.find(child => child.type === "media-hub")!;
  assert.equal(media.props.globalLayout, 2); assert.equal(media.props.initialMode, "ready");
  assert.equal(JSON.stringify(media.props.items), JSON.stringify([row()]));
});
