import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { codalFeedWindow } from "../../../lib/codal-feed";

let GET: typeof import("./route").GET;
before(async () => {
  // The app keeps the real server-only boundary; Node tests use Next's alias.
  const require = createRequire(import.meta.url);
  const resolver = Module as unknown as { _resolveFilename: (specifier: string, ...args: unknown[]) => string };
  const original = resolver._resolveFilename;
  resolver._resolveFilename = function (specifier, ...args) {
    return specifier === "server-only" ? require.resolve("next/dist/compiled/server-only/empty.js") : original.call(this, specifier, ...args);
  };
  try { ({ GET } = await import("./route")); }
  finally { resolver._resolveFilename = original; }
});

// Synthetic, unsigned-by-any-real-server fixtures: no live credential or IO.
function anon(claims: Record<string, unknown> = {}) {
  return `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ role: "anon", iss: "supabase", exp: 4102444800, ...claims })).toString("base64url")}.synthetic`;
}
const envKeys = ["CODAL_FEED_READ_URL", "CODAL_FEED_READ_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
let savedEnv: (string | undefined)[];
let savedFetch: typeof fetch;
let savedWarn: typeof console.warn;
let diagnostics: unknown[][];
beforeEach(() => {
  savedEnv = envKeys.map(key => process.env[key]);
  for (const key of envKeys) delete process.env[key];
  savedFetch = globalThis.fetch;
  savedWarn = console.warn;
  diagnostics = [];
  console.warn = (...args: unknown[]) => { diagnostics.push(args); };
});
afterEach(() => {
  envKeys.forEach((key, index) => { if (savedEnv[index] === undefined) delete process.env[key]; else process.env[key] = savedEnv[index]; });
  globalThis.fetch = savedFetch;
  console.warn = savedWarn;
});

const approved = "https://62.60.191.24/liara-preview";
function configureRead(url = approved, key = anon()) {
  process.env.CODAL_FEED_READ_URL = url;
  process.env.CODAL_FEED_READ_ANON_KEY = key;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://legacy.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon({ project: "synthetic-legacy" });
}
const request = (symbol = "فولاد") => new Request(`https://candidate.example.test/api/codal-list?symbol=${encodeURIComponent(symbol)}`);

test("announcement list reads feed metadata, including unparsed notices, without fetching financial reports or relay", async () => {
  const previous = { fetch: globalThis.fetch, url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon();
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    requests.push(new URL(String(input)));
    return Response.json([
      { id: 5, title: "شفاف‌سازی دریافت‌شده", report_code: "ن-۲۰", sent_date: "۱۴۰۵/۰۷/۱۹", sent_time: "۱۱:۰۴:۳۷", link: "https://codal.ir/notice-a" },
      { id: 6, title: "تکرار همان اطلاعیه", link: "https://codal.ir/notice-a" },
      { id: 7, title: "اطلاعیه بدون زمان ارسال", sent_date: null, publish_date: "۱۴۰۵/۰۴/۳۱", link: "https://codal.ir/notice-b" },
    ]);
  };
  try {
    const response = await GET(new Request("https://site.example.test/api/codal-list?symbol=" + encodeURIComponent("نماد")));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].pathname, "/rest/v1/codal_feed");
    assert.equal(requests[0].searchParams.get("symbol"), "eq.نماد");
    assert.equal(requests[0].searchParams.get("order"), "sent_date.desc.nullslast,sent_time.desc.nullslast,id.desc");
    assert.doesNotMatch(requests[0].searchParams.get("select")!, /(?:^|,)(raw|data)(?:,|$)/);
    assert.equal(body.source, "codal_feed");
    assert.equal(body.coverage, "stored-announcements");
    assert.equal(body.data.length, 2);
    assert.ok(requests[0].searchParams.get("select")!.split(",").includes("publish_date"));
    assert.equal(body.data[0].publishedDate, null);
    assert.equal(body.data[1].publishedDate, "۱۴۰۵/۰۴/۳۱");
    assert.equal(body.data[0].kind, "ن-۲۰");
    assert.equal(body.data[0].dateKind, "sent");
    assert.equal(body.data[1].date, null, "reporting period must not masquerade as source time");
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
  }
});

test("missing symbol is rejected before DB or provider access", async () => {
  assert.equal((await GET(new Request("https://site.example.test/api/codal-list"))).status, 400);
});

test('transport failure logs only an allowlisted cause and preserves the existing 502 response', async () => {
  const previous = { fetch: globalThis.fetch, warn: console.warn, url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  const logs: unknown[][] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://database.example.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon();
  console.warn = (...args: unknown[]) => { logs.push(args); };
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed', { cause: Object.assign(new Error('SECRET_URL_TOKEN'), { code: 'UND_ERR_CONNECT_TIMEOUT' }) }); };
  try {
    const response = await GET(new Request('https://site.example.test/api/codal-list?symbol=SECRET_SYMBOL'));
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'fetch failed');
    assert.equal(calls, 1);
    assert.equal(logs.length, 1);
    const fields = logs[0][1] as Record<string, unknown>;
    assert.equal(logs[0][0], 'stored_read_failed');
    assert.equal(fields.phase, 'request');
    assert.equal(fields.causeCode, 'UND_ERR_CONNECT_TIMEOUT');
    assert.equal(fields.errorName, 'TypeError');
    assert.equal(fields.upstreamStatus, null);
    assert.equal(typeof fields.elapsedMs, 'number');
    assert.doesNotMatch(JSON.stringify(logs), /SECRET/);
  } finally {
    globalThis.fetch = previous.fetch; console.warn = previous.warn;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
  }
});

test('diagnostic helper drops injected names/codes and cannot change responses if logging fails', async () => {
  const { logStoredReadFailure } = await import('../../../lib/stored-read-diagnostics');
  const logs: unknown[] = [];
  logStoredReadFailure({ route: 'codal-list', phase: 'request', elapsedMs: NaN, error: { name: 'SECRET_NAME', message: 'SECRET_MESSAGE', code: 'SECRET_CODE', cause: { code: 'SECRET_CAUSE' } } }, (_event, fields) => logs.push(fields));
  assert.doesNotMatch(JSON.stringify(logs), /SECRET/);
  assert.equal((logs[0] as Record<string, unknown>).causeCode, 'unknown');
  assert.doesNotThrow(() => logStoredReadFailure({ route: 'codal-list', phase: 'request', elapsedMs: 1 }, () => { throw new Error('logger failed'); }));
});

test("separate runtime pair changes only this anonymous GET and preserves the exact feed payload", async () => {
  configureRead();
  const publicBefore = envKeys.slice(2).map(key => process.env[key]);
  const rows = Array.from({ length: 60 }, (_, i) => ({
    id: i, title: `اطلاعیه ${i}`, link: `https://codal.ir/${i}`,
    sent_date: i ? "1404/01/01" : null, sent_time: null, publish_date: i ? null : "1403/12/01",
  }));
  const calls: { url: URL; options?: RequestInit }[] = [];
  globalThis.fetch = async (input, options) => { calls.push({ url: new URL(String(input)), options }); return Response.json(rows); };
  const incoming = request("فولاد&symbol=eq.دیگر");
  incoming.headers.set("Cookie", "private-session=synthetic");
  incoming.headers.set("Authorization", "Bearer synthetic-member");
  incoming.headers.set("X-Private", "synthetic-private");
  const response = await GET(incoming);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ...codalFeedWindow(rows), codalSearchUrl: `https://codal.ir/ReportList.aspx?search&Symbol=${encodeURIComponent("فولاد&symbol=eq.دیگر")}`, source: "codal_feed", coverage: "stored-announcements" });
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300, stale-while-revalidate=300");
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url.origin + url.pathname, `${approved}/rest/v1/codal_feed`);
  assert.equal(url.searchParams.get("symbol"), "eq.فولاد&symbol=eq.دیگر");
  assert.equal(url.searchParams.getAll("symbol").length, 1);
  assert.deepEqual([...url.searchParams.keys()].sort(), ["limit", "order", "select", "symbol"]);
  assert.equal(url.searchParams.get("limit"), "60");
  assert.equal(options?.method, "GET");
  assert.equal(options?.redirect, "error");
  assert.equal(options?.credentials, "omit");
  assert.equal(options?.cache, "no-store");
  assert.ok(options?.signal instanceof AbortSignal);
  assert.equal(options?.body, undefined);
  const headers = new Headers(options?.headers);
  assert.deepEqual([...headers.keys()].sort(), ["accept", "apikey", "authorization"]);
  assert.equal(headers.get("apikey"), process.env.CODAL_FEED_READ_ANON_KEY);
  assert.equal(headers.get("authorization"), `Bearer ${process.env.CODAL_FEED_READ_ANON_KEY}`);
  assert.deepEqual(envKeys.slice(2).map(key => process.env[key]), publicBefore, "Auth/write shared pair must not be mutated");
  assert.deepEqual(diagnostics, []);
});

test("absent override keeps the legacy GET; explicit partial/blank pair never borrows legacy members", async () => {
  configureRead();
  delete process.env.CODAL_FEED_READ_URL;
  delete process.env.CODAL_FEED_READ_ANON_KEY;
  let calls = 0;
  globalThis.fetch = async input => { calls++; assert.equal(new URL(String(input)).origin, "https://legacy.example.test"); return Response.json([]); };
  assert.equal((await GET(request())).status, 200);
  assert.equal(calls, 1);
  for (const [url, key] of [[approved, undefined], [undefined, anon()], ["", anon()], [approved, ""], ["", ""]]) {
    configureRead();
    if (url === undefined) delete process.env.CODAL_FEED_READ_URL; else process.env.CODAL_FEED_READ_URL = url;
    if (key === undefined) delete process.env.CODAL_FEED_READ_ANON_KEY; else process.env.CODAL_FEED_READ_ANON_KEY = key;
    const response = await GET(request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "codal feed read configuration invalid");
  }
  assert.equal(calls, 1, "partial settings must not fetch either destination");
});

test("unconfigured route is unavailable, never a false empty feed", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected fetch"); };
  const response = await GET(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "supabase not configured");
  assert.equal(calls, 0);
});

test("override is confined to the approved HTTPS base, not an arbitrary host/path or URL injection", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json([]); };
  for (const url of ["http://62.60.191.24/liara-preview", "https://other.example.test/liara-preview", "https://62.60.191.24/", `${approved}/rest/v1/private`, `${approved}?table=private`, `${approved}#private`, "https://user:password@62.60.191.24/liara-preview", "https://62.60.191.24:444/liara-preview"]) {
    configureRead(url);
    const response = await GET(request());
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(await response.json()), /password|other\.example|table=private/);
  }
  assert.equal(calls, 0);
});

test("server/secret, malformed, expired or non-anon tokens are rejected before any fetch", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json([]); };
  for (const key of ["sb_secret_synthetic", "not-a-jwt", anon({ role: "service_role" }), anon({ role: "authenticated" }), anon({ iss: "other" }), anon({ exp: 0 }), anon({ exp: "4102444800" }), anon({ role: null }), `a.${Buffer.from("null").toString("base64url")}.b`]) {
    configureRead(approved, key);
    const response = await GET(request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "codal feed read configuration invalid");
    assert.doesNotMatch(JSON.stringify(diagnostics), /service_role|sb_secret/);
  }
  assert.equal(calls, 0);
});

test("the inherited pair also cannot use a privileged token", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://legacy.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon({ role: "service_role" });
  globalThis.fetch = async () => { throw new Error("must not fetch"); };
  assert.equal((await GET(request())).status, 503);
});

test("upstream rejection and redirect remain errors with one attempt and no legacy/provider fallback", async () => {
  configureRead();
  for (const status of [301, 302, 401, 402, 403, 404, 429, 500, 503]) {
    let calls = 0;
    globalThis.fetch = async (input, options) => {
      calls++;
      assert.equal(new URL(String(input)).origin, "https://62.60.191.24");
      assert.equal(options?.redirect, "error");
      return new Response("PRIVATE upstream body", { status, headers: { Location: "https://not-allowed.example.test" } });
    };
    const response = await GET(request());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, `supabase ${status}`);
    assert.equal(calls, 1);
    const log = diagnostics.at(-1)?.[1] as Record<string, unknown>;
    assert.equal(log.phase, "headers");
    assert.equal(log.upstreamStatus, status);
    assert.doesNotMatch(JSON.stringify(diagnostics), /PRIVATE|not-allowed/);
  }
});

test("transport exceptions cannot leak raw URLs/keys and cannot trigger a second destination", async () => {
  configureRead();
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error(`PRIVATE ${process.env.CODAL_FEED_READ_ANON_KEY}`); };
  const response = await GET(request());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "fetch failed");
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(diagnostics), /PRIVATE|synthetic/);
});

test("cleanup failures cannot mask an upstream rejection or hold a body-limit error open", async () => {
  configureRead();
  for (const status of [402, 200]) {
    globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { return Promise.reject(new Error("PRIVATE cleanup")); } }), {
      status, ...(status === 200 ? { headers: { "Content-Length": String(512 * 1024 + 1) } } : {}),
    });
    const response = await GET(request());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, status === 402 ? "supabase 402" : "invalid codal feed response");
  }
  assert.doesNotMatch(JSON.stringify(diagnostics), /PRIVATE/);
});

test("invalid JSON, schema, encoding, missing body or excessive row count is error, while [] is empty", async () => {
  configureRead();
  const responses = [new Response("PRIVATE invalid JSON"), Response.json({ data: [] }), Response.json(null), new Response(null), new Response(new Uint8Array([0xff])), Response.json(Array(61).fill({ title: "extra" })), ...[[null], [{}], [1], [{ title: [] }]].map(rows => Response.json(rows))];
  let calls = 0;
  for (const upstream of responses) {
    globalThis.fetch = async () => { calls++; return upstream; };
    const response = await GET(request());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, "invalid codal feed response");
    const log = diagnostics.at(-1)?.[1] as Record<string, unknown>;
    assert.equal(log.phase, "body");
    assert.equal(log.upstreamStatus, 200);
  }
  globalThis.fetch = async () => { calls++; return Response.json([]); };
  const empty = await GET(request());
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).data, []);
  assert.equal(calls, responses.length + 1);
  assert.doesNotMatch(JSON.stringify(diagnostics), /PRIVATE/);
});

test("body size is bounded both with content-length and chunked responses", async () => {
  configureRead();
  for (const declared of [true, false]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(512 * 1024 + 1)); },
      cancel() { cancelled = true; },
    });
    globalThis.fetch = async () => new Response(stream, declared ? { headers: { "Content-Length": String(512 * 1024 + 1) } } : undefined);
    const response = await GET(request());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, "invalid codal feed response");
    assert.equal(cancelled, true);
  }
});

test("15-second signal covers request and body stages, without real waiting or retries", async () => {
  configureRead();
  const original = AbortSignal.timeout;
  try {
    for (const stage of ["request", "body"]) {
      const controller = new AbortController();
      AbortSignal.timeout = milliseconds => { assert.equal(milliseconds, 15000); return controller.signal; };
      let calls = 0;
      let cancelled = false;
      globalThis.fetch = async (_input, options) => {
        calls++;
        setImmediate(() => controller.abort(new DOMException("PRIVATE timeout", "TimeoutError")));
        if (stage === "request") return new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true }));
        return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
      };
      const response = await GET(request());
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, "codal feed read timed out");
      assert.equal(calls, 1);
      if (stage === "body") assert.equal(cancelled, true);
      assert.doesNotMatch(JSON.stringify(diagnostics), /PRIVATE/);
    }
  } finally { AbortSignal.timeout = original; }
});

test("server-only read settings are absent from shared Auth/build constructors and the feed parser", () => {
  for (const file of ["lib/supabase/client.ts", "lib/supabase/server.ts", "lib/liara-public-env.js", "next.config.js", "lib/codal-feed.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /CODAL_FEED_READ_(URL|ANON_KEY)/, file);
  }
  for (const file of ["lib/supabase/client.ts", "lib/supabase/server.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
    assert.match(source, /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  }
  const helper = readFileSync("lib/codal-feed-reader.ts", "utf8");
  assert.match(helper, /^import "server-only";/);
  assert.doesNotMatch(helper, /@supabase|createClient|next\/headers|process\.env\.[A-Z_]+\s*=/);
});

test("actual browser/server SDK constructors still receive only their existing shared pair", async () => {
  configureRead();
  for (const file of ["lib/supabase/client.ts", "lib/supabase/server.ts"]) {
    const calls: unknown[][] = [];
    const taskModule = { exports: {} as { createClient: () => unknown } };
    const sdk = (...args: unknown[]) => { calls.push(args); return { marker: "synthetic-existing-sdk" }; };
    const imports: Record<string, unknown> = {
      "@supabase/ssr": { createBrowserClient: sdk, createServerClient: sdk },
      "next/headers": { cookies: async () => ({ getAll: () => [], set: () => {} }) },
    };
    runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      module: taskModule, exports: taskModule.exports,
      process: { env: Object.fromEntries(envKeys.map(key => [key, process.env[key]])) },
      require(name: string) { assert.ok(name in imports, `unexpected constructor dependency ${name}`); return imports[name]; },
    });
    await taskModule.exports.createClient();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], process.env.NEXT_PUBLIC_SUPABASE_URL);
    assert.equal(calls[0][1], process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    assert.notEqual(calls[0][0], process.env.CODAL_FEED_READ_URL);
    assert.notEqual(calls[0][1], process.env.CODAL_FEED_READ_ANON_KEY);
  }
});
