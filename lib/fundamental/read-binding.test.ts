// Synthetic configuration and mocked responses only; never installs a binding or reads private env.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFundamentalsFromSupabase, type CodalRow } from "./supabase";

const require = createRequire(import.meta.url);
const resolver = require("node:module") as { _resolveFilename: (specifier: string, ...args: unknown[]) => string };
const originalResolve = resolver._resolveFilename;
resolver._resolveFilename = function (specifier, ...args) {
  return specifier === "server-only" ? require.resolve("next/dist/compiled/server-only/empty.js") : originalResolve.call(this, specifier, ...args);
};
const originalFetch = globalThis.fetch, originalWarn = console.warn, originalNow = Date.now;
const warnings: unknown[][] = [];
console.warn = (...args: unknown[]) => { warnings.push(args); };
after(() => {
  try {
    const text = JSON.stringify(warnings);
    assert.equal([...syntheticKeys].some(key => text.includes(key)), false, "logs never contain fixture credentials");
    assert.equal(text.includes(origin), false, "logs never print the binding URL");
    const events = warnings.map(([event, metadata]) => {
      const item = metadata as Record<string, unknown>;
      assert.equal(event, "fundamental_read_failed");
      assert(["configuration", "headers", "body", "request-or-body"].includes(String(item.phase)));
      assert(item.reason === undefined || ["invalid-response", "AbortError", "TimeoutError", "TypeError", "SyntaxError", "read-error"].includes(String(item.reason)));
      assert(item.status === undefined || typeof item.status === "number");
      assert(item.kind === undefined || ["ن-۱۰", "ن-۳۰"].includes(String(item.kind)));
      return { event, phase: item.phase, status: item.status, reason: item.reason, kind: item.kind };
    });
    console.log("FUNDAMENTAL_READ_MOCK_LOG " + JSON.stringify({ count: events.length, events }));
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; Date.now = originalNow; resolver._resolveFilename = originalResolve; }
});
const origin = "https://62.60.191.24/liara-preview";
type Environment = Readonly<Record<string, string | undefined>>;
const syntheticKeys = new Set<string>();
const jwt = (claims: Record<string, unknown> = {}, algorithm = "HS256") => { const key = [
  Buffer.from(JSON.stringify({ alg: algorithm, typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ role: "anon", iss: "supabase", exp: 4102444800, ...claims })).toString("base64url"),
  Buffer.from("synthetic-signature").toString("base64url"),
].join("."); syntheticKeys.add(key); return key; };
const pair = (key = jwt()): Environment => Object.freeze({ FUNDAMENTAL_READ_URL: origin, FUNDAMENTAL_READ_ANON_KEY: key });
const legacy: Environment = Object.freeze({ NEXT_PUBLIC_SUPABASE_URL: "https://legacy-fixture.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-legacy" });
const read = (symbol: string, environment: Environment) => readFundamentalsFromSupabase(symbol, { environment });
function row(symbol: string, amount = 2): CodalRow {
  return { id: amount, symbol, report_kind: "ن-۳۰", period_end: "1405-06-31", title: "synthetic monthly fixture", source_url: null, raw: null,
    data: { symbol, report_kind: "ن-۳۰", period_end: "1405-06-31", fiscal_year: 1405, unit: "میلیون ریال", period_total_amount: amount, fy_cumulative_amount: null, products: [] } };
}
const amount = (value: Awaited<ReturnType<typeof read>>) => value.data?.n30?.data[0].period_total_amount;
function fixture(rows: CodalRow[] = []) {
  const calls: { url: URL; options: RequestInit }[] = [];
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input)); calls.push({ url, options: options ?? {} });
    return Response.json(rows.filter(r => url.searchParams.get("report_kind") === `eq.${r.report_kind}` && url.searchParams.get("symbol") === `eq.${r.symbol}`));
  };
  return calls;
}

test("new pair uses only its own headers and the same two bounded GETs; no env object mutation", async () => {
  const key = jwt({ fixture: "transport" }), environment = pair(key), before = JSON.stringify(environment);
  const calls = fixture([row("transport")]);
  const timeouts: number[] = [], originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = ms => { timeouts.push(ms); return new AbortController().signal; };
  try { assert.equal((await read("transport", environment)).state, "ready"); }
  finally { AbortSignal.timeout = originalTimeout; }
  assert.equal(calls.length, 2); assert.deepEqual(timeouts, [8000, 8000]);
  for (const { url, options } of calls) {
    assert.equal(url.origin + url.pathname, `${origin}/rest/v1/codal_reports`);
    assert.equal(url.searchParams.get("select"), "id,symbol,report_kind,period_end,title,source_url,data,raw");
    assert.equal(url.searchParams.get("order"), "period_end.desc,id.desc");
    assert.equal(url.searchParams.get("symbol"), "eq.transport"); assert.equal(url.searchParams.get("data"), "not.is.null");
    assert.equal(url.searchParams.get("limit"), url.searchParams.get("report_kind") === "eq.ن-۱۰" ? "400" : "200");
    assert.equal(options.method, "GET"); assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit");
    const headers = new Headers(options.headers);
    assert.deepEqual([...headers.keys()].sort(), ["apikey", "authorization"]);
    assert(headers.get("apikey") === key, "uses this pair's API key");
    assert(headers.get("authorization") === `Bearer ${key}`, "uses this pair's anonymous bearer");
    assert.equal(headers.has("cookie"), false);
  }
  assert.equal(JSON.stringify(environment), before);
});

test("absent new pair preserves legacy transport and successful empty remains cacheable", async () => {
  const calls = fixture();
  assert.equal((await read("legacy-empty", legacy)).state, "empty");
  assert.equal((await read("legacy-empty", legacy)).state, "empty");
  assert.equal(calls.length, 2);
  assert(calls.every(c => c.url.origin === "https://legacy-fixture.invalid"));
});

test("partial/blank/invalid pairs fail with zero GET, even with a valid legacy pair", async () => {
  const invalid: Environment[] = [
    { FUNDAMENTAL_READ_URL: origin }, { FUNDAMENTAL_READ_ANON_KEY: jwt() },
    { FUNDAMENTAL_READ_URL: "", FUNDAMENTAL_READ_ANON_KEY: "" },
    ...[" ", "http://62.60.191.24/liara-preview", `${origin}/`, `${origin}?x=1`, `${origin}#x`, "https://other.invalid/liara-preview", ` ${origin}`, "https://user:pass@62.60.191.24/liara-preview"].map(url => ({ FUNDAMENTAL_READ_URL: url, FUNDAMENTAL_READ_ANON_KEY: jwt() })),
    ...["", " ", "not-a-jwt", "a..b", jwt({ role: "service_role" }), jwt({ iss: "other" }), jwt({ exp: 1 }), jwt({ exp: "4102444800" }), jwt({}, "none")].map(key => ({ FUNDAMENTAL_READ_URL: origin, FUNDAMENTAL_READ_ANON_KEY: key })),
  ];
  const calls = fixture([row("invalid")]);
  for (const environment of invalid) {
    const result = await read("invalid", { ...legacy, ...environment });
    assert.equal(result.state, "error"); assert.equal(result.data, null);
  }
  assert.equal(calls.length, 0);
});

test("absent override with a missing legacy pair remains an error with zero GET", async () => {
  const calls = fixture();
  for (const environment of [{}, { NEXT_PUBLIC_SUPABASE_URL: "https://legacy-fixture.invalid" }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-legacy" }]) {
    assert.equal((await read("missing-legacy", environment)).state, "error");
  }
  assert.equal(calls.length, 0);
});

test("valid or invalid new mode never reads the legacy key as fallback", async () => {
  const calls = fixture();
  const environment = { ...pair(), get NEXT_PUBLIC_SUPABASE_URL(): string { throw new Error("legacy must stay isolated"); }, get NEXT_PUBLIC_SUPABASE_ANON_KEY(): string { throw new Error("legacy must stay isolated"); } };
  assert.equal((await read("isolated", environment)).state, "empty");
  assert.equal((await read("isolated", { ...pair(), FUNDAMENTAL_READ_ANON_KEY: "bad", get NEXT_PUBLIC_SUPABASE_URL(): string { throw new Error("legacy must stay isolated"); } })).state, "error");
  assert.equal(calls.length, 2);
});

test("invalid configuration clears a warm same-symbol cache; returning to legacy reads again", async () => {
  const calls = fixture([row("warm")]);
  assert.equal(amount(await read("warm", legacy)), 2);
  assert.equal((await read("warm", { ...pair(), FUNDAMENTAL_READ_URL: "" })).state, "error");
  assert.equal(calls.length, 2);
  assert.equal(amount(await read("warm", legacy)), 2);
  assert.equal(calls.length, 4);
});

test("key, origin and mode changes cannot reuse another binding's cache", async () => {
  const calls = fixture([row("switch")]);
  const a = pair(jwt({ fixture: "a" })), b = pair(jwt({ fixture: "b" }));
  for (const environment of [a, a, b, { NEXT_PUBLIC_SUPABASE_URL: origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: b.FUNDAMENTAL_READ_ANON_KEY }, { ...legacy, NEXT_PUBLIC_SUPABASE_URL: "https://second-fixture.invalid" }])
    assert.equal((await read("switch", environment)).state, "ready");
  assert.equal(calls.length, 8);
});

test("expiry is revalidated before cache, and TTL never silently extends", async () => {
  const now = 1800000000000; Date.now = () => now;
  try {
    const calls = fixture([row("expires")]), environment = pair(jwt({ exp: now / 1000 + 1 }));
    assert.equal((await read("expires", environment)).state, "ready");
    Date.now = () => now + 2000;
    assert.equal((await read("expires", environment)).state, "error"); assert.equal(calls.length, 2);
    const stable = pair(jwt());
    assert.equal((await read("ttl", stable)).state, "empty");
    Date.now = () => now + 63000;
    assert.equal((await read("ttl", stable)).state, "empty"); assert.equal(calls.length, 6);
  } finally { Date.now = originalNow; }
});

test("expiry during async fingerprinting cannot unlock a warm cache", async () => {
  const now = 1800000000000, subtle = globalThis.crypto.subtle, digest = subtle.digest;
  Date.now = () => now;
  try {
    const calls = fixture([row("expiry-race")]), environment = pair(jwt({ exp: now / 1000 + 1 }));
    assert.equal((await read("expiry-race", environment)).state, "ready");
    subtle.digest = async (algorithm, data) => { Date.now = () => now + 2000; return digest.call(subtle, algorithm, data); };
    assert.equal((await read("expiry-race", environment)).state, "error");
    assert.equal(calls.length, 2);
  } finally { Date.now = originalNow; subtle.digest = digest; }
});

test("HTTP errors, redirect, malformed body and request failure never retry or fall back", async () => {
  for (const failure of [402, 401, 503, 302, "object", "json", "request"] as const) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (typeof failure === "number") return new Response("", { status: failure });
      if (failure === "request") throw new TypeError("synthetic request failure");
      if (failure === "json") return new Response("not json");
      return Response.json({ invalid: "not an array" });
    };
    const result = await read(`failure-${failure}`, { ...legacy, ...pair() });
    assert.equal(result.state, "error"); assert.equal(result.data, null); assert.equal(calls, 2);
  }
  const calls = fixture();
  assert.equal((await read("failure-402", pair())).state, "empty"); assert.equal(calls.length, 2);
});

test("a pending old read cannot poison a new binding's cache", async () => {
  const a = pair(jwt({ fixture: "pending-a" })), b = pair(jwt({ fixture: "pending-b" }));
  let release!: () => void, started!: () => void, calls = 0, aCalls = 0;
  const blocked = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { started = resolve; });
  globalThis.fetch = async (input, options) => {
    calls++; const isA = new Headers(options?.headers).get("apikey") === a.FUNDAMENTAL_READ_ANON_KEY;
    if (isA) { if (++aCalls === 2) started(); await blocked; }
    return Response.json(new URL(String(input)).searchParams.get("report_kind") === "eq.ن-۳۰" ? [row("pending", isA ? 10 : 20)] : []);
  };
  const pending = read("pending", a); await ready;
  assert.equal(amount(await read("pending", b)), 20); release();
  assert.equal(amount(await pending), 10);
  assert.equal(amount(await read("pending", b)), 20); assert.equal(calls, 4);
});

test("the request pair is captured before any async loading, and failures cannot print a key", async () => {
  const key = jwt({ fixture: "capture" }), environment = { ...pair(key) }, calls = fixture();
  const pending = read("capture", environment); environment.FUNDAMENTAL_READ_ANON_KEY = jwt({ fixture: "changed" });
  await pending;
  assert(calls.every(c => new Headers(c.options.headers).get("apikey") === key), "same captured pair for both requests");
  globalThis.fetch = async () => { const error = new Error(key); error.name = key; throw error; };
  assert.equal((await read("redaction", pair(key))).state, "error");
  assert.equal(JSON.stringify(warnings).includes(key), false, "logs contain no credential or uncontrolled Error name/message");
});

test("concurrent different symbols retain independent caches on the same binding", async () => {
  const environment = pair(jwt({ fixture: "parallel" }));
  let release!: () => void, started!: () => void, calls = 0, blockedCalls = 0;
  const blocked = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { started = resolve; });
  globalThis.fetch = async input => {
    calls++; const url = new URL(String(input)), symbol = url.searchParams.get("symbol")!.slice(3);
    if (symbol === "parallel-a") { if (++blockedCalls === 2) started(); await blocked; }
    return Response.json(url.searchParams.get("report_kind") === "eq.ن-۳۰" ? [row(symbol)] : []);
  };
  const pending = read("parallel-a", environment); await ready;
  assert.equal((await read("parallel-b", environment)).state, "ready"); release();
  assert.equal((await pending).state, "ready");
  assert.equal((await read("parallel-a", environment)).state, "ready");
  assert.equal((await read("parallel-b", environment)).state, "ready");
  assert.equal(calls, 4);
});

test("cycling a binding A-to-B-to-A cannot resurrect an old in-flight A cache", async () => {
  const a = pair(jwt({ fixture: "cycle-a" })), b = pair(jwt({ fixture: "cycle-b" }));
  let release!: () => void, started!: () => void, calls = 0, aCalls = 0;
  const blocked = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { started = resolve; });
  globalThis.fetch = async (input, options) => {
    calls++; const isA = new Headers(options?.headers).get("apikey") === a.FUNDAMENTAL_READ_ANON_KEY;
    const oldA = isA && ++aCalls <= 2;
    if (oldA) { if (aCalls === 2) started(); await blocked; }
    return Response.json(new URL(String(input)).searchParams.get("report_kind") === "eq.ن-۳۰" ? [row("cycle", oldA ? 10 : isA ? 30 : 20)] : []);
  };
  const pending = read("cycle", a); await ready;
  assert.equal(amount(await read("cycle", b)), 20);
  assert.equal(amount(await read("cycle", a)), 30); release(); await pending;
  assert.equal(amount(await read("cycle", a)), 30); assert.equal(calls, 6);
});
