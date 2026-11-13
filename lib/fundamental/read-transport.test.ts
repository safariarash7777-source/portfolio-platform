import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchFundamentalRows } from './read-transport';

const url = 'https://database.invalid/rest/v1/codal_reports?symbol=eq.test';
const headers = { apikey: 'fixture', Authorization: 'Bearer fixture' };
const hanging = (signal: AbortSignal) => new Promise<Response>((_, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

test('unresponsive first headers retry once with identical read-only identity', async () => {
  const calls: RequestInit[] = [];
  const read: typeof fetch = async (input, options) => {
    assert.equal(input, url);
    calls.push(options!);
    return calls.length === 1 ? hanging(options!.signal!) : Response.json([{ id: 1 }]);
  };
  const response = await fetchFundamentalRows(url, headers, read, { totalMs: 500, firstHeadersMs: 10 });
  assert.deepEqual(await response.json(), [{ id: 1 }]);
  assert.equal(calls.length, 2);
  for (const options of calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.deepEqual(options.headers, headers);
  }
  assert.equal(calls[0].signal!.aborted, true);
});

test('connection timeout retries; TLS, authentication and other failures do not', async () => {
  let calls = 0;
  const response = await fetchFundamentalRows(url, headers, async () => {
    if (++calls === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
    return new Response('', { status: 401 });
  });
  assert.equal(calls, 2);
  assert.equal(response.status, 401);
  for (const code of ['CERT_HAS_EXPIRED', 'ECONNREFUSED', 'UND_ERR_BODY_TIMEOUT']) {
    calls = 0;
    await assert.rejects(fetchFundamentalRows(url, headers, async () => {
      calls++;
      throw Object.assign(new TypeError('fetch failed'), { cause: { code } });
    }));
    assert.equal(calls, 1);
  }
});

test('headers finishing before cutoff leave body usable without retry', async () => {
  let signal: AbortSignal;
  const response = await fetchFundamentalRows(url, headers, async (_, options) => {
    signal = options!.signal!;
    return Response.json([{ id: 2 }]);
  }, { totalMs: 500, firstHeadersMs: 10 });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(signal!.aborted, false);
  assert.deepEqual(await response.json(), [{ id: 2 }]);
});

test('a simultaneous TLS error cannot borrow the header deadline retry', async () => {
  let calls = 0;
  await assert.rejects(fetchFundamentalRows(url, headers, async (_, options) => {
    calls++;
    return new Promise<Response>((_, reject) => options!.signal!.addEventListener('abort', () =>
      reject(Object.assign(new TypeError('certificate failure'), { cause: { code: 'CERT_HAS_EXPIRED' } })), { once: true }));
  }, { totalMs: 500, firstHeadersMs: 10 }), /certificate/);
  assert.equal(calls, 1);
});

test('second attempt shares original deadline instead of gaining another full timeout', async () => {
  let calls = 0;
  const keepAlive = setTimeout(() => {}, 1000);
  const start = performance.now();
  try {
    await assert.rejects(fetchFundamentalRows(url, headers, async (_, options) => {
      calls++;
      return hanging(options!.signal!);
    }, { totalMs: 100, firstHeadersMs: 60 }), /timeout|abort/i);
    assert.equal(calls, 2);
    assert.ok(performance.now() - start < 150);
  } finally { clearTimeout(keepAlive); }
});

test('HTTP failure and malformed body never create another request', async () => {
  for (const status of [403, 500, 200]) {
    let calls = 0;
    const response = await fetchFundamentalRows(url, headers, async () => {
      calls++; return new Response('invalid json', { status });
    });
    await assert.rejects(response.json());
    assert.equal(calls, 1);
  }
});
