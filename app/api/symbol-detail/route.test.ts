import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";

test("retained detail uses its own clock, never the latest batch clock, and bypasses HTTP cache", async () => {
  const previous = { fetch: globalThis.fetch, url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  let entryAt: number | undefined;
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).pathname, "/rest/v1/ir_market_snapshots");
    assert.equal(init?.cache, "no-store");
    return Response.json([{ key: "symbol_details", payload: { at: Date.now(), details: { TEST: { at: entryAt, data: { marker: "synthetic" } } } } }]);
  };
  try {
    const req = new Request("https://site.example.test/api/symbol-detail?l18=TEST");
    const unknown = await GET(req);
    assert.equal((await unknown.json()).at, null);
    assert.equal(unknown.headers.get("cache-control"), "no-store");
    entryAt = 1_700_000_000_000;
    assert.equal((await (await GET(req)).json()).at, entryAt);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
  }
});

test('dated quote-only response preserves units and cannot masquerade as full live details', async () => {
  const old = { fetch: globalThis.fetch, url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://database.example.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-key';
  const quote = { symbol: 'فملی', instrumentCode: '35425587644337450', unit: 'rial', lastRial: 29170,
    closeRial: 29090, sourceDateRaw: '2026-11-04', sourceTimeRaw: '13:16:54', sourceAtUtc: null,
    sourceDateCalendar: 'gregorian', freshness: 'unknown' };
  let candidate: Record<string, unknown> = quote;
  globalThis.fetch = async input => {
    assert.equal(new URL(String(input)).searchParams.get('key'), 'in.(symbol_details,mcpfarsi_quotes)');
    return Response.json([{ key: 'mcpfarsi_quotes', payload: { schema: 'mcpfarsi-quotes.v1', quotes: { 'فملی': candidate } } }]);
  };
  try {
    const request = new Request('https://site.example.test/api/symbol-detail?l18=' + encodeURIComponent('فملی'));
    const response = await GET(request); assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.data, null); assert.equal(body.at, null);
    assert.equal(body.quoteLive, false); assert.equal(body.quote.lastRial, 29170);
    for (const invalid of [{ unit: 'toman' }, { instrumentCode: 'wrong' }, { sourceDateRaw: '2026-02-30' },
      { sourceTimeRaw: '25:00:00' }, { sourceDateRaw: '2099-01-01' }, { lastRial: -1 }, { sourceAtUtc: '2026-11-04T13:16:54Z' }]) {
      candidate = { ...quote, ...invalid }; assert.equal((await GET(request)).status, 404);
    }
  } finally {
    globalThis.fetch = old.fetch;
    if (old.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = old.url;
    if (old.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = old.key;
  }
});

test('upstream and body failures log their distinct stages without messages or response content', async () => {
  const previous = { fetch: globalThis.fetch, warn: console.warn, url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  const logs: unknown[][] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://database.example.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'SECRET_KEY';
  console.warn = (...args: unknown[]) => { logs.push(args); };
  try {
    const req = new Request('https://site.example.test/api/symbol-detail?l18=SECRET_SYMBOL');
    globalThis.fetch = async () => new Response('SECRET_BODY', { status: 503 });
    const upstream = await GET(req);
    assert.equal(upstream.status, 502); assert.equal((await upstream.json()).error, 'supabase 503');
    globalThis.fetch = async () => new Response('SECRET_NOT_JSON', { status: 200 });
    assert.equal((await GET(req)).status, 502);
    assert.equal(logs.length, 2);
    const [headers, body] = logs.map(log => log[1] as Record<string, unknown>);
    assert.equal(headers.phase, 'headers'); assert.equal(headers.upstreamStatus, 503);
    assert.equal(body.phase, 'body'); assert.equal(body.upstreamStatus, 200); assert.equal(body.errorName, 'SyntaxError');
    assert.doesNotMatch(JSON.stringify(logs), /SECRET/);
  } finally {
    globalThis.fetch = previous.fetch; console.warn = previous.warn;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
  }
});
