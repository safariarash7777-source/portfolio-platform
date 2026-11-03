import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { codalFeedItems } from "../../../lib/codal-feed";

type RouteGet = typeof import("./route").GET;
interface TestIO {
  fetch: typeof fetch;
  warn: (...args: unknown[]) => void;
  timeout: (milliseconds: number) => AbortSignal;
}

/** Existing VM test pattern: production modules execute with an explicitly isolated environment.
 * No host environment snapshot, global fetch/console/timeout or module-resolver mutation is needed. */
function loadRoute(environment: Record<string, string | undefined>, io: TestIO): RouteGet {
  const requireModule = createRequire(import.meta.url);
  const root = new URL("../../../", import.meta.url);
  const allowed = new Set([
    "app/api/codal-list/route.ts", "lib/fundamental/read-config.server.ts", "lib/liara-public-env.js",
    "lib/codal-feed.ts", "lib/stored-read-diagnostics.ts",
  ].map(file => new URL(file, root).href));
  const fixedNow = Date.UTC(2026, 9, 31);
  class FixedDate extends Date {
    constructor(value: string | number = fixedNow) { super(value); }
    static now() { return fixedNow; }
  }
  const context = vm.createContext({
    process: { env: environment }, console: { warn: (...args: unknown[]) => io.warn(...args) },
    fetch: (...args: Parameters<typeof fetch>) => io.fetch(...args),
    AbortSignal: { timeout: (milliseconds: number) => io.timeout(milliseconds) },
    Date: FixedDate, Buffer, URL, URLSearchParams, Request, Response, Headers, Error, TypeError, SyntaxError,
  });
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const load = (url: URL): Record<string, unknown> => {
    if (!allowed.has(url.href)) throw new Error("unexpected production dependency in route test");
    const cached = modules.get(url.href);
    if (cached) return cached.exports;
    const source = readFileSync(url, "utf8");
    const javascript = url.pathname.endsWith(".ts") ? ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText : source;
    const loaded = { exports: {} as Record<string, unknown> };
    modules.set(url.href, loaded);
    const requireLocal = (specifier: string): unknown => {
      if (specifier === "next/server") return requireModule(specifier);
      if (specifier === "server-only") return requireModule("next/dist/compiled/server-only/empty.js");
      if (specifier.startsWith("@/")) return load(new URL(specifier.slice(2) + ".ts", root));
      if (specifier.startsWith(".")) return load(new URL(specifier, url));
      throw new Error("unexpected external dependency in route test");
    };
    const wrapper = vm.runInContext("(function(exports, require, module) {\n" + javascript + "\n})", context, { filename: url.pathname });
    wrapper(loaded.exports, requireLocal, loaded);
    return loaded.exports;
  };
  return load(new URL("app/api/codal-list/route.ts", root)).GET as RouteGet;
}

// All tokens/configuration below are synthetic; no live credential or IO.
const origin = "https://62.60.191.24/liara-preview";
const jwt = (claims: Record<string, unknown> = {}, algorithm = "HS256") => [
  Buffer.from(JSON.stringify({ alg: algorithm, typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ role: "anon", iss: "supabase", exp: 4102444800, ...claims })).toString("base64url"),
  Buffer.from("synthetic-signature").toString("base64url"),
].join(".");
const envKeys = ["FUNDAMENTAL_READ_URL", "FUNDAMENTAL_READ_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
let environment: Record<string, string | undefined>;
let fixture: TestIO;
let diagnostics: unknown[][];
let GET: RouteGet;
beforeEach(() => {
  environment = {};
  diagnostics = [];
  fixture = {
    fetch: async () => { throw new Error("unexpected test request"); },
    warn: (...args: unknown[]) => { diagnostics.push(args); },
    timeout: () => new AbortController().signal,
  };
  GET = loadRoute(environment, fixture);
});
function configure(key = jwt()) {
  environment.FUNDAMENTAL_READ_URL = origin;
  environment.FUNDAMENTAL_READ_ANON_KEY = key;
  environment.NEXT_PUBLIC_SUPABASE_URL = "https://legacy-fixture.invalid";
  environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-legacy";
}
const request = (symbol = "فولاد") => new Request(`https://candidate.invalid/api/codal-list?symbol=${encodeURIComponent(symbol)}`);

test("announcement list reads feed metadata, including unparsed notices, without fetching financial reports or relay", async () => {
  const previous = { fetch: fixture.fetch, url: environment.NEXT_PUBLIC_SUPABASE_URL, key: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  environment.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.test";
  environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  const requests: URL[] = [];
  fixture.fetch = async (input) => {
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
    assert.doesNotMatch(requests[0].searchParams.get("select")!, /(?:^|,)(raw|data|publish_date)(?:,|$)/);
    assert.equal(body.source, "codal_feed");
    assert.equal(body.coverage, "stored-announcements");
    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].kind, "ن-۲۰");
    assert.equal(body.data[0].dateKind, "sent");
    assert.equal(body.data[1].date, null, "reporting period must not masquerade as source time");
  } finally {
    fixture.fetch = previous.fetch;
    if (previous.url === undefined) delete environment.NEXT_PUBLIC_SUPABASE_URL; else environment.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete environment.NEXT_PUBLIC_SUPABASE_ANON_KEY; else environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
  }
});

test("missing symbol is rejected before DB or provider access", async () => {
  assert.equal((await GET(new Request("https://site.example.test/api/codal-list"))).status, 400);
});

test('transport failure logs only an allowlisted cause and preserves the existing 502 response', async () => {
  const previous = { fetch: fixture.fetch, warn: fixture.warn, url: environment.NEXT_PUBLIC_SUPABASE_URL, key: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  const logs: unknown[][] = [];
  environment.NEXT_PUBLIC_SUPABASE_URL = 'https://database.example.test';
  environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'SECRET_KEY';
  fixture.warn = (...args: unknown[]) => { logs.push(args); };
  let calls = 0;
  fixture.fetch = async () => { calls++; throw new TypeError('fetch failed', { cause: Object.assign(new Error('SECRET_URL_TOKEN'), { code: 'UND_ERR_CONNECT_TIMEOUT' }) }); };
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
    fixture.fetch = previous.fetch; fixture.warn = previous.warn;
    if (previous.url === undefined) delete environment.NEXT_PUBLIC_SUPABASE_URL; else environment.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete environment.NEXT_PUBLIC_SUPABASE_ANON_KEY; else environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
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

test('existing fundamental pair supplies the one feed GET without forwarding incoming headers or mutating shared settings', async () => {
  configure();
  const shared = envKeys.map(key => environment[key]);
  const rows = [{ id: 7, title: 'اطلاعیهٔ مصنوعی بدون زمان', report_code: 'ن-۲۰', sent_date: null,
    publish_date: '۱۴۰۵/۰۷/۲۹', link: 'https://codal.ir/synthetic-notice' }];
  const calls: { url: URL; options?: RequestInit }[] = [];
  const timeouts: number[] = [], originalTimeout = fixture.timeout;
  fixture.timeout = milliseconds => { timeouts.push(milliseconds); return new AbortController().signal; };
  fixture.fetch = async (input, options) => { calls.push({ url: new URL(String(input)), options }); return Response.json(rows); };
  const incoming = request('فولاد&symbol=eq.دیگر');
  incoming.headers.set('Cookie', 'synthetic-private-session');
  incoming.headers.set('Authorization', 'Bearer synthetic-member');
  incoming.headers.set('X-Private', 'synthetic-private');
  try {
    const response = await GET(incoming);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: codalFeedItems(rows),
      codalSearchUrl: `https://codal.ir/ReportList.aspx?search&Symbol=${encodeURIComponent('فولاد&symbol=eq.دیگر')}`,
      source: 'codal_feed', coverage: 'stored-announcements' });
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300, stale-while-revalidate=300');
  } finally { fixture.timeout = originalTimeout; }
  assert.equal(calls.length, 1);
  assert.deepEqual(timeouts, [15000]);
  const { url, options } = calls[0];
  assert.equal(url.origin + url.pathname, `${origin}/rest/v1/codal_feed`);
  assert.deepEqual([...url.searchParams.keys()].sort(), ['limit', 'order', 'select', 'symbol']);
  assert.equal(url.searchParams.get('symbol'), 'eq.فولاد&symbol=eq.دیگر');
  assert.equal(url.searchParams.getAll('symbol').length, 1);
  assert.equal(url.searchParams.get('select'), 'id,title,report_code,sent_date,sent_time,link');
  assert.equal(url.searchParams.get('order'), 'sent_date.desc.nullslast,sent_time.desc.nullslast,id.desc');
  assert.equal(url.searchParams.get('limit'), '60');
  assert.equal(options?.cache, 'no-store');
  assert.equal(options?.body, undefined);
  const headers = new Headers(options?.headers);
  assert.deepEqual([...headers.keys()].sort(), ['accept', 'apikey', 'authorization']);
  assert.equal(headers.get('apikey'), environment.FUNDAMENTAL_READ_ANON_KEY);
  assert.equal(headers.get('authorization'), `Bearer ${environment.FUNDAMENTAL_READ_ANON_KEY}`);
  assert.equal(headers.get('accept'), 'application/json');
  assert.deepEqual(envKeys.map(key => environment[key]), shared);
  assert.deepEqual(diagnostics, []);
});

test('partial/blank/malformed fundamental settings fail closed through the existing resolver without a legacy request', async () => {
  const invalid: Array<Record<string, string | undefined>> = [
    { FUNDAMENTAL_READ_URL: origin }, { FUNDAMENTAL_READ_ANON_KEY: jwt() },
    { FUNDAMENTAL_READ_URL: '', FUNDAMENTAL_READ_ANON_KEY: '' },
    ...[' ', `${origin}/`, `${origin}?x=1`, ` ${origin}`, 'http://62.60.191.24/liara-preview', 'https://other.invalid/liara-preview']
      .map(url => ({ FUNDAMENTAL_READ_URL: url, FUNDAMENTAL_READ_ANON_KEY: jwt() })),
    ...['', ' ', 'not-a-jwt', jwt({ role: 'service_role' }), jwt({ role: 'authenticated' }), jwt({ iss: 'other' }),
      jwt({ exp: 1 }), jwt({ exp: '4102444800' }), jwt({}, 'none')]
      .map(key => ({ FUNDAMENTAL_READ_URL: origin, FUNDAMENTAL_READ_ANON_KEY: key })),
  ];
  let calls = 0;
  fixture.fetch = async () => { calls++; throw Error('unexpected request'); };
  for (const settings of invalid) {
    configure();
    delete environment.FUNDAMENTAL_READ_URL; delete environment.FUNDAMENTAL_READ_ANON_KEY;
    Object.assign(environment, settings);
    const response = await GET(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'supabase not configured',
      codalSearchUrl: 'https://codal.ir/ReportList.aspx?search&Symbol=' + encodeURIComponent('فولاد') });
  }
  assert.equal(calls, 0);
});

test('upstream 402 is still a headers-stage 502 and never a successful empty or freshness claim', async () => {
  configure();
  let calls = 0;
  fixture.fetch = async () => { calls++; return new Response('synthetic upstream body', { status: 402 }); };
  const response = await GET(request());
  assert.equal(calls, 1);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'supabase 402',
    codalSearchUrl: 'https://codal.ir/ReportList.aspx?search&Symbol=' + encodeURIComponent('فولاد') });
  assert.equal(response.headers.get('Cache-Control'), null);
  assert.equal(diagnostics.length, 1);
  const fields = diagnostics[0][1] as Record<string, unknown>;
  assert.equal(diagnostics[0][0], 'stored_read_failed');
  assert.equal(fields.route, 'codal-list');
  assert.equal(fields.phase, 'headers');
  assert.equal(fields.upstreamStatus, 402);
  assert.doesNotMatch(JSON.stringify(diagnostics), /synthetic|billing|FUNDAMENTAL_READ/);
});

test('only a successful empty stored read returns []; invalid body and transport remain errors without retry', async () => {
  configure();
  const responses = [Response.json([]), Response.json(null), new Response('invalid-json')];
  for (const upstream of responses) {
    let calls = 0;
    fixture.fetch = async () => { calls++; return upstream; };
    const response = await GET(request());
    assert.equal(calls, 1);
    const body = await response.json();
    if (upstream === responses[0]) {
      assert.equal(response.status, 200);
      assert.deepEqual(body.data, []);
      assert.equal(body.coverage, 'stored-announcements');
      assert.equal('lastSuccess' in body, false);
      assert.equal('fresh' in body, false);
    } else {
      assert.equal(response.status, 502);
      assert.equal('data' in body, false);
      assert.equal((diagnostics.at(-1)?.[1] as Record<string, unknown>).phase, 'body');
    }
  }
  let calls = 0;
  fixture.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
  assert.equal((await GET(request())).status, 502);
  assert.equal(calls, 1);
});

test('missing or whitespace symbol and absent configuration never issue a request', async () => {
  let calls = 0;
  fixture.fetch = async () => { calls++; throw Error('unexpected request'); };
  configure();
  assert.equal((await GET(new Request('https://candidate.invalid/api/codal-list'))).status, 400);
  assert.equal((await GET(request('   '))).status, 400);
  envKeys.forEach(key => { delete environment[key]; });
  assert.equal((await GET(request())).status, 503);
  assert.equal(calls, 0);
});

test('binding reuses the pinned resolver and introduces no third configuration/helper', () => {
  const source = readFileSync('app/api/codal-list/route.ts', 'utf8');
  assert.match(source, /import \{ fundamentalReadPair \} from "@\/lib\/fundamental\/read-config\.server"/);
  assert.doesNotMatch(source, /CODAL_FEED_READ|codal-feed-reader|JSON\.parse|Buffer\.from|createClient|req\.headers/);
});
