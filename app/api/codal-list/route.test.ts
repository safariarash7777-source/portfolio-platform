/** DO NOT MERGE. Offline transport mocks only; no fixture enters the deployed route. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GET } from './route';
import { MAX_PUBLIC_BODY_BYTES, PUBLIC_FOOLAD_URL, readPublicFoolad } from './public-integration';

const search = 'https://codal.ir/ReportList.aspx?search&Symbol=' + encodeURIComponent('فولاد');
const row = { title: 'نمونه ساختگی صرفاً برای آزمون', kind: 'ن-۳۰', date: '۱۴۰۵/۰۷/۲۹', time: null, dateKind: 'sent', url: 'https://codal.ir/Reports/Decision.aspx?LetterSerial=offline-test', publishedDate: null };
const payload = () => ({ source: 'codal_feed', coverage: 'stored-announcements', codalSearchUrl: search, data: [{ ...row }] });
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
const request = (query = '?symbol=' + encodeURIComponent('فولاد')) => new Request('https://candidate.example.test/api/codal-list' + query, { headers: { Cookie: 'PRIVATE_COOKIE', Authorization: 'Bearer PRIVATE_AUTH', apikey: 'PRIVATE_KEY', 'X-Forwarded-Host': 'private.example.test' } });
const mock = (fn: (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response>) => fn as typeof fetch;

async function withFetch(fetcher: typeof fetch, run: () => Promise<void>) {
  const old = globalThis.fetch;
  globalThis.fetch = fetcher;
  try { await run(); } finally { globalThis.fetch = old; }
}

test('fixed one-purpose public GET: no credentials/private headers/env, no redirects, one call', async () => {
  const calls: Array<{ input: unknown; init?: RequestInit }> = [];
  await withFetch(mock(async (input, init) => { calls.push({ input, init }); return json(payload()); }), async () => {
    const response = await GET(request());
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input, PUBLIC_FOOLAD_URL);
    const u = new URL(String(calls[0].input));
    assert.equal(u.origin, 'https://portfolio-platform-fawn.vercel.app');
    assert.equal(u.pathname, '/api/codal-list');
    assert.deepEqual([...u.searchParams], [['symbol', 'فولاد']]);
    assert.equal(calls[0].init?.method, 'GET');
    assert.equal(calls[0].init?.credentials, 'omit');
    assert.equal(calls[0].init?.redirect, 'error');
    assert.equal(calls[0].init?.cache, 'no-store');
    assert.deepEqual([...new Headers(calls[0].init?.headers)], [['accept', 'application/json']]);
    assert.ok(calls[0].init?.signal instanceof AbortSignal);
    assert.doesNotMatch(JSON.stringify(calls), /PRIVATE|supabase|rest\/v1|market|relay/i);
    assert.equal(response.headers.get('X-Integration-Only'), 'P07-DO-NOT-MERGE');
    assert.equal(response.headers.get('X-Public-Source-URL'), PUBLIC_FOOLAD_URL);
    assert.equal(response.headers.get('X-Upstream-Status'), '200');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  });
});

test('wrong/missing/ambiguous symbol and user-controlled origin/path fail before any IO', async () => {
  let calls = 0;
  await withFetch(mock(async () => { calls++; throw new Error('not allowed'); }), async () => {
    for (const query of ['', '?symbol=other', '?symbol=%20%D9%81%D9%88%D9%84%D8%A7%D8%AF', '?symbol=فولاد&symbol=other', '?symbol=فولاد&url=https://evil.test', '?symbol=فولاد&path=/private']) {
      const response = await GET(request(query));
      assert.ok([400, 422].includes(response.status), query);
      assert.ok((await response.json()).error);
    }
    assert.equal(calls, 0);
  });
});

test('successful UTF8 payload is byte-identical: order, null, absent publication, source/provenance retained', async () => {
  const value = payload();
  const withoutPublication = { ...row }; delete (withoutPublication as Partial<typeof row>).publishedDate;
  value.data.push(withoutPublication);
  const text = '  ' + JSON.stringify(value, null, 1) + '\n';
  const response = await readPublicFoolad('فولاد', { fetcher: mock(async () => new Response(text, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': 'PRIVATE_COOKIE' } })) });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), text);
  assert.equal(response.headers.get('Set-Cookie'), null);
});

test('source/coverage/search-symbol/schema and extra fields are checked, never substituted with empty', async () => {
  const bad: unknown[] = [
    { ...payload(), source: 'codal_reports' }, { ...payload(), coverage: 'complete-history' },
    { ...payload(), codalSearchUrl: search.replace(encodeURIComponent('فولاد'), 'other') },
    { ...payload(), data: {} }, { ...payload(), data: [null] },
    { ...payload(), data: [{ ...row, symbol: 'other' }] }, { ...payload(), privateBody: 'SECRET' },
    { ...payload(), data: [{ ...row, publishedDate: 0 }] }, { ...payload(), data: [{ ...row, dateKind: 'publication' }] },
    { ...payload(), data: Array.from({ length: 31 }, () => ({ ...row })) },
  ];
  for (const value of bad) {
    let calls = 0;
    const response = await readPublicFoolad('فولاد', { fetcher: mock(async () => { calls++; return json(value); }) });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.phase, 'body');
    assert.equal(body.error, 'public_source_schema_or_symbol_mismatch');
    assert.ok(!('data' in body)); assert.equal(calls, 1);
  }
});

test('official source references reject credential URLs and lookalike/untrusted origins', async () => {
  for (const url of ['https://codal.ir.evil.test/a', 'https://user:password@codal.ir/a', 'http://codal.ir/a', 'https://codal.ir:444/a', 'javascript:alert(1)']) {
    const response = await readPublicFoolad('فولاد', { fetcher: mock(async () => json({ ...payload(), data: [{ ...row, url }] })) });
    assert.equal(response.status, 502);
  }
});

test('real empty source is preserved only as its own validated successful payload', async () => {
  const value = { ...payload(), data: [] };
  const response = await readPublicFoolad('فولاد', { fetcher: mock(async () => json(value)) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), value);
});

test('public upstream 402/502/503 errors keep status and exact bounded error payload; no fallback/retry', async () => {
  for (const status of [402, 502, 503]) {
    let calls = 0;
    const text = JSON.stringify({ error: status === 502 ? 'supabase 402' : 'public source failed', codalSearchUrl: search }, null, 1);
    const response = await readPublicFoolad('فولاد', { fetcher: mock(async () => { calls++; return new Response(text, { status, headers: { 'Content-Type': 'application/json' } }); }) });
    assert.equal(response.status, status);
    assert.equal(await response.text(), text);
    assert.equal(response.headers.get('X-Upstream-Status'), String(status));
    assert.equal(calls, 1);
  }
});

test('redirect is not followed, and redirected/error/login HTML cannot become success', async () => {
  let calls = 0;
  const response = await readPublicFoolad('فولاد', { fetcher: mock(async (_input, init) => {
    calls++; assert.equal(init?.redirect, 'error'); return new Response(null, { status: 302, headers: { Location: 'https://evil.test/login' } });
  }) });
  assert.equal(response.status, 502); assert.equal(calls, 1);
  assert.equal((await response.json()).error, 'public_source_redirect_rejected');
  for (const status of [200, 503]) {
    const html = await readPublicFoolad('فولاد', { fetcher: mock(async () => new Response('<html>login</html>', { status, headers: { 'Content-Type': 'text/html' } })) });
    assert.equal(html.status, status === 200 ? 502 : status);
    assert.equal((await html.json()).error, 'public_source_non_json');
  }
});

test('fetch deadline aborts even an unresponsive transport, without retry', async () => {
  let calls = 0; let signal: AbortSignal | null | undefined;
  const response = await readPublicFoolad('فولاد', { timeoutMs: 5, fetcher: mock(async (_input, init) => { calls++; signal = init?.signal; return new Promise<Response>(() => {}); }) });
  assert.equal(response.status, 504); assert.equal(calls, 1);
  assert.equal((await response.json()).error, 'public_source_timeout');
  assert.equal(signal?.aborted, true);
});

test('deadline covers a stalled streamed body and cancels it', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const response = await readPublicFoolad('فولاد', { timeoutMs: 5, fetcher: mock(async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } })) });
  assert.equal(response.status, 504);
  assert.equal((await response.json()).phase, 'body');
  assert.equal(cancelled, true);
});

test('body limit applies to both declared length and actual streamed bytes', async () => {
  for (const declared of [true, false]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(MAX_PUBLIC_BODY_BYTES + 1)); }, cancel() { cancelled = true; } });
    const response = await readPublicFoolad('فولاد', { fetcher: mock(async () => new Response(stream, { headers: { 'Content-Type': 'application/json', ...(declared ? { 'Content-Length': String(MAX_PUBLIC_BODY_BYTES + 1) } : {}) } })) });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'public_source_body_limit');
    assert.equal(cancelled, true);
  }
});

test('invalid UTF8/JSON and malformed error bodies are explicit errors, without data or leaked transport message', async () => {
  for (const body of ['{', new Uint8Array([0xff])]) {
    const response = await readPublicFoolad('فولاد', { fetcher: mock(async () => new Response(body, { headers: { 'Content-Type': 'application/json' } })) });
    assert.equal(response.status, 502); assert.equal((await response.json()).error, 'public_source_invalid_json');
  }
  const badError = await readPublicFoolad('فولاد', { fetcher: mock(async () => json({ data: [] }, 503)) });
  assert.equal(badError.status, 503); assert.equal((await badError.json()).error, 'public_source_invalid_error_body');
  const failed = await readPublicFoolad('فولاد', { fetcher: mock(async () => { throw new Error('PRIVATE_TOKEN_PRIVATE_URL'); }) });
  assert.equal(failed.status, 502); assert.doesNotMatch(await failed.text(), /PRIVATE/);
});

test('integration route/helper contain no env access, private readers, model, fixture or alternate destination', () => {
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8') + readFileSync(new URL('./public-integration.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /process\.env|NEXT_PUBLIC_|Authorization|apikey|supabase|codal_reports|readGlobalMarket|readIranMarket|inferResearch|fixture/i);
  assert.match(source, /DO NOT MERGE/);
});
