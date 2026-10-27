import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import * as zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { SOURCES, remoteRead, projectRow, command, parseCapture, safeRemoteFailure, failureReceipt } from './research-source-read.mjs';
const secret = 'SECRET_DO_NOT_EMIT';
const env = { SUPABASE_URL: 'https://62.60.191.24/liara-preview', SUPABASE_SERVICE_ROLE_KEY: secret };
const row = source => ({ id: 4047, symbol: 'فولاد', report_kind: source.kind, title: 'صورت‌های مالی اصلاحیه', source_url: source.url + '#pv3', published_at: null, captured_at: '2026-10-27T10:00:00Z',
  announcement_link: source.url, link_excel: 'https://codal.ir/Reports/Excel.aspx?id=public', date_publish: '۱۴۰۵/۰۵/۰۳', time_publish: '۱۶:۵۴:۵۳', parser_version: 3,
  data: { symbol: 'فولاد', report_kind: source.kind, unit: 'میلیون ریال', standalone: { revenue: 100, cogs: 60, gross_profit: 40, net_profit: 10, private: secret }, products: [{ product_name: 'ورق', market: 'داخلی', sales_qty: null, sales_rate: null, sales_amount: 100, private: secret }], private: secret }, private: secret });
const marker = packet => 'FOLAD_PACKET=' + Buffer.from(JSON.stringify({ ok: true, packet })).toString('base64') + '\n';
test('two fixed stored-source queries use existing credential in-place, bounded versions and exact source filters', async () => {
  let calls = 0;
  const packet = await remoteRead(SOURCES, projectRow, env, async (url, init) => {
    const u = new URL(url), source = SOURCES[calls++];
    assert.equal(u.origin + u.pathname, 'https://62.60.191.24/liara-preview/rest/v1/codal_reports');
    assert.equal(u.searchParams.get('symbol'), 'eq.فولاد');
    assert.equal(u.searchParams.get('raw->>announcement_link'), 'eq.' + source.url);
    assert.equal(u.searchParams.get('report_kind'), 'eq.' + source.kind);
    assert.equal(u.searchParams.get('limit'), '11');
    assert.equal(u.searchParams.get('select').split(',').includes('raw'), false);
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    assert.equal(init.headers.apikey, secret);
    return Response.json([row(source)]);
  });
  assert.equal(calls, 2);
  assert.equal(packet.packets[0].rows[0].raw.parser_version, 3);
  assert.equal(packet.packets[1].rows[0].data.products[0].sales_qty, null);
  assert.equal(JSON.stringify(packet).includes(secret), false);
  const parsed = parseCapture('CLI banner ' + secret + '\n' + marker(packet), 0);
  assert.equal(JSON.stringify(parsed).includes(secret), false);
  assert.equal(parsed.primaryDocumentsFetched, false);
  assert.deepEqual(parseCapture('\x1b[?25l\r\x1b[2K  ' + marker(packet).trim() + '  \r\n\x1b[?25h', 0), parsed);
});
test('wrong endpoint, wrong symbol/source, excessive versions, and remote HTTP errors fail closed', async () => {
  let calls = 0;
  await assert.rejects(remoteRead(SOURCES, projectRow, { ...env, SUPABASE_URL: 'https://evil.test' }, async () => { calls++; }));
  assert.equal(calls, 0);
  for (const result of [[{ ...row(SOURCES[0]), symbol: 'دیگر' }], [{ ...row(SOURCES[0]), announcement_link: 'https://evil.test' }], Array(11).fill(row(SOURCES[0]))]) {
    await assert.rejects(remoteRead(SOURCES, projectRow, env, async () => Response.json(result)));
  }
  await assert.rejects(remoteRead(SOURCES, projectRow, env, async () => new Response(secret, { status: 500 })), /stored_http_error/);
});
test('CLI exit zero alone is not completion proof and failure/raw logs are never returned', () => {
  for (const capture of ['', secret, 'FOLAD_PACKET=' + Buffer.from(JSON.stringify({ ok: false, reason: secret })).toString('base64')]) assert.throws(() => parseCapture(capture, 0));
  assert.throws(() => parseCapture(secret, 1));
});
test('generated single-token compressed command executes fixed reads and produces a validated completion marker', async () => {
  const decoded = decodeURIComponent(command());
  assert.equal(decoded.split(' ').length, 3);
  assert.equal(decoded.startsWith('node -e eval(require(/node:zlib/.source).inflateRawSync(Buffer.from('), true);
  const loader = decoded.slice('node -e '.length);
  assert.doesNotMatch(loader, /[\s'"+&?#%]/);
  assert.match(loader, /Buffer\.from\(\/[A-Za-z0-9_-]+\/\.source,\/base64url\/\.source\)/);
  assert.equal(decoded.includes(secret), false);
  assert.ok(command().length <= 6000);
  const output = []; let calls = 0;
  await runInNewContext(decoded.slice('node -e '.length), {
    require: name => { assert.equal(name, 'node:zlib'); return zlib; },
    Buffer, URL, URLSearchParams, AbortSignal, process: { env },
    console: { log: line => output.push(line) },
    fetch: async () => Response.json([row(SOURCES[calls++])]),
  });
  assert.equal(calls, 2);
  assert.equal(output.length, 1);
  assert.equal(parseCapture(output[0], 0).packets.length, 2);
  assert.equal(JSON.stringify(parseCapture(output[0], 0)).includes(secret), false);
  const failed = [];
  await runInNewContext(decoded.slice('node -e '.length), {
    require: () => zlib, Buffer, URL, URLSearchParams, AbortSignal, process: { env: {} },
    console: { log: line => failed.push(line) }, fetch: async () => { throw new Error('must not call'); },
  });
  assert.throws(() => parseCapture(failed[0], 0), error => failureReceipt(error).remoteFailure.reason === 'endpoint_missing');
});

test('safe capture diagnosis distinguishes CLI, marker and explicit remote failures without raw log reflection', () => {
  const check = (raw, code) => { try { parseCapture(raw, code); assert.fail('must fail'); } catch (error) { return failureReceipt(error); } };
  assert.equal(check(secret, 2).reason, 'cli_exit');
  assert.equal(check(secret, 0).reason, 'completion_marker_missing');
  assert.equal(check('FOLAD_PACKET=invalid!', 0).reason, 'malformed_marker');
  const remote = failure => 'FOLAD_PACKET=' + Buffer.from(JSON.stringify({ ok: false, failure })).toString('base64');
  const failure = check(remote({ reason: 'stored_http_error', httpStatus: 400, body: secret }), 0);
  assert.equal(failure.reason, 'remote_failure');
  assert.deepEqual(failure.remoteFailure, { reason: 'stored_http_error', httpStatus: 400 });
  assert.equal(check(remote({ reason: secret, httpStatus: secret }), 0).remoteFailure.reason, 'unknown_remote_failure');
  assert.deepEqual(safeRemoteFailure(new Error(secret)), { reason: 'unknown_remote_failure', httpStatus: null });
  assert.equal(JSON.stringify(failure).includes(secret), false);
  assert.equal(JSON.stringify(failureReceipt({ message: secret, stack: secret })).includes(secret), false);
});

test('nonzero CLI always fails but preserves one valid sanitized remote failure marker', () => {
  const diagnostic = value => { try { parseCapture(value, 2); assert.fail('nonzero exit must fail'); } catch (error) { return failureReceipt(error); } };
  const remote = payload => 'FOLAD_PACKET=' + Buffer.from(JSON.stringify(payload)).toString('base64');
  const failed = diagnostic(remote({ ok: false, failure: { reason: 'stored_http_error', httpStatus: 403, body: secret } }));
  assert.equal(failed.reason, 'cli_exit'); assert.equal(failed.exitCode, 2); assert.equal(failed.markerPresent, true);
  assert.deepEqual(failed.remoteFailure, { reason: 'stored_http_error', httpStatus: 403 });
  assert.equal(diagnostic(remote({ ok: true, packet: secret })).remoteFailure, null);
  assert.equal(diagnostic(remote({ ok: true, packet: secret })).reason, 'cli_exit');
  assert.equal(diagnostic(secret).markerPresent, false);
  assert.equal(diagnostic(remote({ ok: false, failure: { reason: secret } })).remoteFailure.reason, 'unknown_remote_failure');
  assert.equal(diagnostic(remote({ ok: false }) + '\n' + remote({ ok: false })).remoteFailure, null);
  assert.equal(JSON.stringify(failed).includes(secret), false);
});
