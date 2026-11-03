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
    assert.equal(url.searchParams.get("select"), "id,symbol,report_kind,period_end,title,source_url,data,raw,captured_at");
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

test("cold binding preserves both symbol caches when two digests overlap", { timeout: 5000 }, async () => {
  const environment = pair(jwt({ fixture: "cold-overlap" }));
  assert.equal((await read("cold-reset", { FUNDAMENTAL_READ_URL: origin })).state, "error");
  const calls = fixture([row("cold-a", 11), row("cold-b", 22)]);
  const subtle = globalThis.crypto.subtle, originalDigest = subtle.digest;
  let releaseFirst!: () => void, releaseSecond!: () => void, enteredFirst!: () => void, enteredBoth!: () => void, digests = 0;
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
  const secondGate = new Promise<void>(resolve => { releaseSecond = resolve; });
  const firstStarted = new Promise<void>(resolve => { enteredFirst = resolve; });
  const both = new Promise<void>(resolve => { enteredBoth = resolve; });
  subtle.digest = async (algorithm, data) => {
    const index = digests++;
    const result = originalDigest.call(subtle, algorithm, data);
    if (index === 0) enteredFirst();
    if (index === 1) enteredBoth();
    if (index < 2) await (index === 0 ? firstGate : secondGate);
    return result;
  };
  const first = read("cold-a", environment);
  let second: ReturnType<typeof read> | undefined;
  try {
    await firstStarted; second = read("cold-b", environment);
    await both; assert.equal(digests, 2); assert.equal(calls.length, 0);
    releaseFirst(); assert.equal(amount(await first), 11); assert.equal(calls.length, 2);
    releaseSecond(); assert.equal(amount(await second), 22); assert.equal(calls.length, 4);
    assert.equal(amount(await read("cold-a", environment)), 11);
    assert.equal(amount(await read("cold-b", environment)), 22);
    assert.equal(calls.length, 4, "both completed reads must remain cached after the two digest barriers");
  } finally {
    releaseFirst(); releaseSecond(); await Promise.allSettled(second ? [first, second] : [first]); subtle.digest = originalDigest;
  }
});

test("a newer invalid decision blocks an older digest from reviving the binding", { timeout: 5000 }, async () => {
  const environment = pair(jwt({ fixture: "invalid-supersedes-digest" }));
  const calls = fixture([row("superseded", 33)]);
  const subtle = globalThis.crypto.subtle, originalDigest = subtle.digest;
  let release!: () => void, entered!: () => void, held = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  subtle.digest = async (algorithm, data) => {
    const result = originalDigest.call(subtle, algorithm, data);
    if (!held) { held = true; entered(); await gate; }
    return result;
  };
  const pending = read("superseded", environment);
  try {
    await started;
    assert.equal((await read("newer-invalid", { ...pair(), FUNDAMENTAL_READ_URL: "" })).state, "error");
    assert.equal(calls.length, 0);
    release(); assert.equal((await pending).state, "error", "a superseded configuration must not start GETs");
    assert.equal(calls.length, 0);
    assert.equal(amount(await read("superseded", environment)), 33);
    assert.equal(amount(await read("superseded", environment)), 33); assert.equal(calls.length, 2);
  } finally { release(); await Promise.allSettled([pending]); subtle.digest = originalDigest; }
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

// Metadata fixtures only: the existing request/binding/cache tests above remain
// unchanged apart from the one additive SELECT column assertion.
function monthlyRecord(id: number, symbol: string, period = "1405-06-31"): CodalRow {
  return { ...row(symbol), id, period_end: "2026-09-22",
    source_url: `https://codal.ir/Reports/Decision.aspx?LetterSerial=synthetic-${id}#pv2`,
    captured_at: "2026-10-25T10:15:56.894105+00:00",
    raw: { parser_version: 2, date_publish: "۱۴۰۵/۰۷/۲۹", time_publish: "۲۰:۵۰:۲۶" },
    data: { symbol, report_kind: "ن-۳۰", period_end: period, fiscal_year: 1405,
      unit: "میلیون ریال", unit_basis: "header+arithmetic", qty_unit: null,
      period_total_amount: 2, fy_cumulative_amount: null,
      products: [{ product_name: "کالای مصنوعی", market: "نامشخص", market_basis: "unknown",
        qty_unit: null, production_qty: null, sales_qty: null, sales_rate: null, sales_amount: 2 }] } };
}
function financialRecord(id: number, symbol: string): CodalRow {
  return { id, symbol, report_kind: "ن-۱۰", period_end: "2026-09-22", title: "صورت‌های مالی شرکت",
    source_url: `https://codal.ir/Reports/Decision.aspx?LetterSerial=synthetic-n10-${id}#pv2`,
    captured_at: "2026-10-25T10:15:56Z", raw: { parser_version: 2 },
    data: { symbol, company_name: "شرکت مصنوعی", report_kind: "ن-۱۰", period_end: "1405-06-31",
      period_months: 6, audited: false, restated_prior: false, unit: "میلیون ریال", capital: 100,
      standalone: { revenue: 10, cogs: 6, gross_profit: 4, operating_profit: 3, net_profit: 2 } } };
}

test("selected monthly records retain their own identity, link, two periods and raw clocks without inventing UTC", async () => {
  const symbol = "provenance-monthly";
  const latest = monthlyRecord(601, symbol), prior = monthlyRecord(602, symbol, "1405-05-31");
  prior.period_end = "2026-08-22";
  prior.captured_at = "2026-10-20T12:00:00+03:30";
  prior.source_url = "https://codal.ir/Reports/Decision.aspx?LetterSerial=synthetic-prior#pv3";
  prior.raw = { parser_version: 3, date_publish: "۱۴۰۵/۰۶/۲۹", time_publish: "۰۸:۳۰:۰۰" };
  const inputBefore = JSON.stringify([latest, prior]);
  const calls = fixture([latest, prior]);
  const result = await read(symbol, pair());
  assert.equal(result.state, "ready"); assert.equal(calls.length, 2);
  const records = result.data?.n30?.source.records;
  assert.deepEqual(records, [
    { id: 601, sourceUrl: "https://codal.ir/Reports/Decision.aspx?LetterSerial=synthetic-601",
      storedPeriodEnd: "2026-09-22", financialPeriodEnd: "1405-06-31",
      publishedAt: "1405/07/29 20:50:26", publishedDateRaw: "۱۴۰۵/۰۷/۲۹", publishedTimeRaw: "۲۰:۵۰:۲۶",
      publishedAtUtc: null, publicationUtcConfidence: "unknown", capturedAtRaw: "2026-10-25T10:15:56.894105+00:00",
      capturedAt: "2026-10-25T10:15:56.894Z",
      parserVersion: 2, parserVersionSource: "raw", amendment: false },
    { id: 602, sourceUrl: "https://codal.ir/Reports/Decision.aspx?LetterSerial=synthetic-prior",
      storedPeriodEnd: "2026-08-22", financialPeriodEnd: "1405-05-31",
      publishedAt: "1405/06/29 08:30:00", publishedDateRaw: "۱۴۰۵/۰۶/۲۹", publishedTimeRaw: "۰۸:۳۰:۰۰",
      publishedAtUtc: null, publicationUtcConfidence: "unknown", capturedAtRaw: "2026-10-20T12:00:00+03:30",
      capturedAt: "2026-10-20T08:30:00.000Z",
      parserVersion: 3, parserVersionSource: "raw", amendment: false },
  ]);
  assert.deepEqual(result.data?.n30?.data, [latest.data, prior.data].map(data => ({ ...data, period_months: 1 })),
    "unit/quantity/market/amount fields and the existing monthly period normalization are unchanged");
  assert.equal(JSON.stringify([latest, prior]), inputBefore);
  assert.equal((await read(symbol, pair())).data, result.data, "metadata uses the existing cache");
  assert.equal(calls.length, 2, "records do not cause a third read");
});

test("financial provenance belongs only to the selected amendment, not a higher ID or later capture", async () => {
  const symbol = "provenance-amendment";
  const amendment = financialRecord(11, symbol), original = financialRecord(999, symbol);
  amendment.title = "صورت‌های مالی شرکت (اصلاحيه)";
  amendment.raw = { parser_version: 2, date_publish: "۱۴۰۵/۰۷/۱۰", time_publish: "۱۱:۴۲:۰۳" };
  original.raw = { parser_version: 2, date_publish: "۱۴۰۵/۰۷/۳۰", time_publish: "۲۲:۰۰:۰۰" };
  original.captured_at = "2026-10-30T20:00:00Z";
  const calls = fixture([original, amendment]);
  const result = await read(symbol, pair());
  assert.equal(calls.length, 2);
  assert.deepEqual(result.data?.n10?.source.records?.map(r => [r.id, r.amendment, r.publishedAt]), [[11, true, "1405/07/10 11:42:03"]]);
  assert.equal(result.data?.n10?.source.records?.[0].sourceUrl, amendment.source_url?.replace(/#pv2$/, ""));
  assert.equal(result.data?.n10?.source.publishedAt, "1405/07/10 11:42:03");
  assert.deepEqual(result.data?.n10Periods?.map(r => r.id), [11]);
  assert.deepEqual(result.data?.n10?.data.standalone, amendment.data.standalone);
});

test("missing, malformed and impossible capture timestamps stay null independently of publication", async () => {
  const stamps = [undefined, null, "", "0", "not-a-clock", "2026-02-29T12:00:00Z", "2026-02-30T12:00:00Z", "2026-10-25T24:00:00Z",
    "2026-10-25T10:15:56", "2026-10-25T10:15:56+99:99"];
  for (const [index, stamp] of stamps.entries()) {
    const r = monthlyRecord(700 + index, `provenance-capture-${index}`); r.captured_at = stamp;
    const calls = fixture([r]);
    const selected = (await read(r.symbol, pair())).data?.n30?.source.records?.[0];
    assert.equal(calls.length, 2); assert.equal(selected?.capturedAt, null);
    assert.equal(selected?.capturedAtRaw, null);
    assert.equal(selected?.publishedAt, "1405/07/29 20:50:26");
    assert.equal(selected?.publishedAtUtc, null); assert.equal(selected?.publicationUtcConfidence, "unknown");
  }
});

test("only explicit parser evidence is disclosed; the legacy selection fallback remains unchanged", async () => {
  const cases = [
    { raw: { parser_version: 4 }, suffix: "#pv8", expected: 4, source: "raw" },
    { raw: {}, suffix: "#pv3", expected: 3, source: "source_url" },
    { raw: null, suffix: "", expected: null, source: null },
    { raw: {}, suffix: "#pv0", expected: null, source: null },
    { raw: { parser_version: -1 }, suffix: "#pv3", expected: null, source: null },
    { raw: {}, suffix: "#pv99999999999999999999", expected: null, source: null },
  ];
  for (const [index, c] of cases.entries()) {
    const r = monthlyRecord(800 + index, `provenance-version-${index}`);
    r.raw = c.raw; r.source_url = `https://codal.ir/Reports/Decision.aspx?LetterSerial=synthetic-version-${index}${c.suffix}`;
    fixture([r]);
    const record = (await read(r.symbol, pair())).data?.n30?.source.records?.[0];
    assert.equal(record?.parserVersion, c.expected); assert.equal(record?.parserVersionSource, c.source);
  }
  const legacyRow = monthlyRecord(811, "provenance-default-one"), zero = monthlyRecord(999, legacyRow.symbol);
  legacyRow.source_url = "https://codal.ir/Reports/Decision.aspx?LetterSerial=synthetic-default"; legacyRow.raw = null;
  zero.source_url = legacyRow.source_url + "#pv0"; zero.raw = {};
  fixture([zero, legacyRow]);
  const result = (await read(legacyRow.symbol, legacy)).data;
  assert.equal(result?.n30?.source.records?.[0].id, 811, "selection still uses its legacy version1 fallback over explicit0");
  assert.equal(result?.n30?.source.records?.[0].parserVersion, null, "default1 is not explicit evidence");
  assert.equal(result?.n30?.source.records?.[0].parserVersionSource, null);
});

test("nonfinite metadata cannot become an identity, capture or proven parser version", async () => {
  for (const [index, value] of [NaN, Infinity, -Infinity].entries()) {
    const r = monthlyRecord(900 + index, `provenance-nonfinite-${index}`);
    r.id = value; r.captured_at = value as unknown as string; r.raw = { parser_version: value };
    r.source_url = null;
    let calls = 0;
    // Deliberately bypass JSON's NaN-to-null serialization for this boundary test.
    globalThis.fetch = async input => {
      calls++; const response = Response.json([]);
      response.json = async () => new URL(String(input)).searchParams.get("report_kind") === "eq.ن-۳۰" ? [r] : [];
      return response;
    };
    const result = await read(r.symbol, pair());
    assert.equal(calls, 2); assert.equal(result.state, "ready");
    const record = result.data?.n30?.source.records?.[0];
    assert.equal(record?.id, null); assert.equal(record?.capturedAt, null);
    assert.equal(record?.capturedAtRaw, null);
    assert.equal(record?.parserVersion, null); assert.equal(record?.parserVersionSource, null);
    assert.equal(record?.sourceUrl, null);
    assert.equal(result.data?.n30?.data[0].period_total_amount, 2);
  }
});

test("raw publication fields are separate bounded scalars; missing or invalid clocks never create UTC", async () => {
  const cases = [
    { date: "۱۴۰۵/۰۷/۲۹", time: undefined, rawDate: "۱۴۰۵/۰۷/۲۹", rawTime: null },
    { date: "not-a-date", time: "bad-time", rawDate: "not-a-date", rawTime: "bad-time" },
    { date: "x".repeat(65), time: " ", rawDate: null, rawTime: null },
    { date: 42, time: null, rawDate: null, rawTime: null },
  ];
  for (const [index, c] of cases.entries()) {
    const r = monthlyRecord(950 + index, `provenance-publication-${index}`);
    r.raw = { date_publish: c.date as string, time_publish: c.time as string };
    Object.assign(r.raw, { private_fixture: "synthetic-private-body-not-metadata" });
    fixture([r]);
    const record = (await read(r.symbol, pair())).data?.n30?.source.records?.[0];
    assert.equal(record?.publishedDateRaw, c.rawDate); assert.equal(record?.publishedTimeRaw, c.rawTime);
    assert.equal(record?.publishedAt, null); assert.equal(record?.publishedAtUtc, null);
    assert.equal(record?.publicationUtcConfidence, "unknown");
    assert.doesNotMatch(JSON.stringify(record), /private_fixture|synthetic-private-body/);
  }
});

test("omitted units and rejected private URLs cannot borrow metadata from another selected report", async () => {
  const known = monthlyRecord(980, "provenance-unit-selection"), omitted = monthlyRecord(981, known.symbol, "1405-07-30");
  omitted.data.unit = null as unknown as string;
  known.source_url = "https://codal.ir/Reports/Decision.aspx?LetterSerial=synthetic&token=private-fixture";
  const calls = fixture([omitted, known]);
  const result = (await read(known.symbol, pair())).data;
  assert.equal(calls.length, 2);
  assert.deepEqual(result?.n30?.source.records?.map(r => r.id), [980]);
  assert.equal(result?.n30?.source.records?.[0].sourceUrl, null);
  assert.equal(result?.n30Unavailable?.unitUnknown, 1);
  assert.equal(result?.n30?.data[0].qty_unit, null);
  assert.equal(result?.n30?.data[0].unit, "میلیون ریال");
  assert.equal(result?.n30?.data[0].unit_basis, "header+arithmetic");
  assert.equal(result?.n30?.data[0].products[0].market_basis, "unknown");
  assert.equal(result?.n30?.source.records?.[0].publishedAtUtc, null);
  assert.equal(result?.n30?.source.verified, true, "existing amount-basis check is unchanged, not a time/unit-quantity confidence");
});

test("valid offset/leap-day capture retains raw fractional precision separately from UTC milliseconds", async () => {
  const stamps = [
    ["2024-02-29T12:00:00.123456+03:30", "2024-02-29T08:30:00.123Z"],
    ["2026-10-25T01:02:03.123456789-04:00", "2026-10-25T05:02:03.123Z"],
    ["2026-10-25T10:15:56Z", "2026-10-25T10:15:56.000Z"],
  ];
  for (const [index, [stamp, normalized]] of stamps.entries()) {
    const r = monthlyRecord(990 + index, `provenance-precision-${index}`); r.captured_at = stamp;
    const calls = fixture([r]);
    const record = (await read(r.symbol, pair())).data?.n30?.source.records?.[0];
    assert.equal(calls.length, 2); assert.equal(record?.capturedAtRaw, stamp);
    assert.equal(record?.capturedAt, normalized);
    assert.equal(record?.publishedDateRaw, "۱۴۰۵/۰۷/۲۹");
    assert.equal(record?.publishedAtUtc, null); assert.equal(record?.publicationUtcConfidence, "unknown");
  }
});
