import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectReceipt, sanitizeDebug, errorCategory, transportError } from './relay-health-receipt.mjs';
const secret = 'NEVER_EMIT_PRIVATE_VALUE';
function debug() {
  return { now: 1793066400000, warmedUp: true, lastRefresh: 1793066300000, ageSec: 100,
    historySections: { written: ['gold', 'currency'], missing: [] },
    brsapiClient: { enabled: false }, brsapiLegacy: { enforced: false, used: { privateProducer: 12 }, budget: { persistent: true, used: 12, remaining: 88, store: { healthy: false, errors: 1, lastError: 'HTTP 404 PGRST202 ' + secret } } },
    brsapiTransport: { enabled: true, scope: 'process', spacingMs: 100, sent: 6508, pending: 0, minStartGapMs: 109.6578 },
    supabase: { enabled: true, ok: false, status: 500, at: 1793066300000, error: 'HTTP 500 ' + secret },
    snapshotQuality: { state: 'partial', attemptedAt: 1793066300000, families: { stocks: { state: 'retained', receivedAt: 1793000000000, retained: true, error: 'timeout ' + secret } } },
    codalEngine: { ok: false, lastRun: 1793066300000, lastError: 'timeout ' + secret, feed: { inserted: 0, complete: false, incompleteReason: secret }, backfill: { symbols: [secret], queueSize: 12 } },
    commodity: { enabled: true, rows: 14, reqToday: 10, dailyCap: 300, remaining: 290, counterScope: 'process', lastFetchAt: 1793066300000 },
    extra: { token: secret }, sources: { brsapi_stocks: { ok: false, stocks: 0, error: 'HTTP 403 ' + secret } } };
}
test('allowlist keeps aggregate clocks and failure categories without raw errors, names, URLs or secrets', () => {
  const d = sanitizeDebug(debug());
  assert.equal(JSON.stringify(d).includes(secret), false);
  assert.equal(JSON.stringify(d).includes('privateProducer'), false);
  assert.equal(d.snapshot.families.stocks.receivedAt, new Date(1793000000000).toISOString());
  assert.equal(d.snapshot.families.stocks.sourceAt, null);
  assert.equal(d.snapshot.families.stocks.error, 'timeout');
  assert.equal(d.storage.error, 'upstream_server');
  assert.equal(d.budget.legacy.budget.store.error, 'missing_endpoint_or_schema');
  assert.equal(d.sources.brsapi_stocks.error, 'authorization');
  assert.equal(d.budget.providerAccountUsage, null);
  assert.equal(d.budget.liaraCost, null);
  assert.equal(d.budget.legacy.usedAggregate, 12);
});
test('missing or malformed fields remain unknown rather than zero or raw strings', () => {
  const d = sanitizeDebug({ now: secret, counts: { stocks: secret }, supabase: { at: secret, error: secret }, brsapiTransport: { scope: secret }, brsapiLegacy: { used: { x: secret } } });
  assert.equal(d.counts.stocks, null);
  assert.equal(d.storage.at, null);
  assert.equal(d.storage.error, 'other');
  assert.equal(d.budget.legacy.usedAggregate, null);
  assert.equal(d.transport.scope, null);
  assert.equal(JSON.stringify(d).includes(secret), false);
});
test('one sample uses only three fixed passive GETs, rejects redirects and sends token only to relay debug', async () => {
  const calls = [];
  const result = await collectReceipt({ token: secret, fetchImpl: async (url, init) => {
    calls.push([url, init]);
    return new Response(url.endsWith('/debug') ? JSON.stringify(debug()) : url.endsWith('/healthz') ? 'ok' : secret);
  } });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(([url]) => url).sort(), ['https://62.60.191.24/liara-preview/', 'https://arsadata.liara.run/debug', 'https://arsadata.liara.run/healthz']);
  for (const [url, init] of calls) {
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    assert.deepEqual(init.headers, url.endsWith('/debug') ? { Authorization: `Bearer ${secret}` } : {});
    assert.equal(init.dispatcher, undefined);
  }
  assert.equal(result.debug.acceptance, 'passed'); assert.equal(result.debug.spacing, 'passed');
  assert.equal(result.sampleCount, 1); assert.equal(result.backend.status, 'reachable');
  assert.equal(JSON.stringify(result).includes(secret), false);
});
test('missing credential skips debug; TLS failures preserve only exact allowed cause code without origin attribution', async () => {
  const calls = [];
  const result = await collectReceipt({ fetchImpl: async url => {
    calls.push(url);
    if (url.includes('62.60')) throw Object.assign(new Error(secret), { cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID', cert: secret } });
    return new Response('ok');
  } });
  assert.equal(calls.length, 2);
  assert.equal(result.debug.status, 'missing_credential');
  assert.equal(result.backend.error, 'ERR_TLS_CERT_ALTNAME_INVALID');
  assert.equal(result.backend.httpStatus, null);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(transportError({ cause: { code: secret } }), 'NETWORK_ERROR');
});
test('HTTP failure bodies are discarded and malformed/oversize debug is rejected without retry', async () => {
  for (const body of [secret, 'x'.repeat(1024 * 1024 + 1), '[]', '{}']) {
    let calls = 0;
    const result = await collectReceipt({ token: secret, fetchImpl: async url => {
      calls++;
      if (url.endsWith('/debug')) return new Response(body);
      return new Response(secret, { status: 503 });
    } });
    assert.equal(calls, 3);
    assert.equal(result.health.httpStatus, 503);
    assert.equal(result.backend.httpStatus, 503);
    assert.equal(result.backend.status, 'reachable');
    assert.equal(result.backend.httpOk, false);
    assert.notEqual(result.debug.acceptance, 'passed');
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});
test('existing acceptance and spacing guards remain fail closed', async () => {
  const d = debug(); d.brsapiLegacy.enforced = true; d.brsapiTransport.minStartGapMs = 99;
  const result = await collectReceipt({ token: secret, fetchImpl: async url => new Response(url.endsWith('/debug') ? JSON.stringify(d) : 'ok') });
  assert.equal(result.debug.acceptance, 'failed'); assert.equal(result.debug.spacing, 'failed');
  assert.equal(errorCategory('invalid schema ' + secret), 'invalid_or_empty_response');
});
test('workflow preserves existing gates and adds one receipt invocation with sanitized artifact', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/relay-health.yml', import.meta.url), 'utf8');
  assert.equal(workflow.includes('schedule:'), false);
  assert.match(workflow, /for i in \$\(seq 1 12\)/);
  assert.match(workflow, /relay-gate.mjs accept/);
  assert.match(workflow, /i < 3/);
  assert.match(workflow, /minStartGapMs < 100/);
  assert.equal((workflow.match(/node scripts\/ops\/relay-health-receipt.mjs/g) ?? []).length, 1);
  assert.match(workflow, /path: relay-health-receipt.json/);
  assert.match(workflow, /contents: read/);
});

test('IME actual debug shape preserves day precision, storage completion and bounded sanitized targets', () => {
  const ime = {
    certificate: { rows: 14, reqToday: 8, lastFetchAt: 1793066300000, lastError: null,
      eod: { lastPushDay: '2026-10-26', pushed: 12, skippedSourceDate: 2, table: 'ok', skip: null, lastError: null } },
    physical: { lastAttemptDay: '2026-10-27', lastRunDay: '2026-10-26', cycleDay: '2026-10-27', inserted: 7,
      lastError: 'physical persistence HTTP 503 ' + secret, table: 'missing (run phase19 SQL)',
      retryScope: 'process-memory-tehran-day', maxProviderRequestsPerDay: 2, maxStorageAttemptsPerTarget: 3,
      targets: [
        { date: '1405-08-05', source: 'ready', sourceAttempts: 1, storageAttempts: 2, nextRetryAt: 1793066400000, complete: false, pendingRows: 5, sourceRows: 5, rejectedRows: 0, error: 'physical persistence HTTP 503 ' + secret, rows: [secret] },
        { date: '1405-08-04', source: 'ready', sourceAttempts: 1, storageAttempts: 1, nextRetryAt: 0, complete: true, pendingRows: 0, sourceRows: 7, rejectedRows: 1, error: null },
        { date: secret, error: secret },
      ] },
  };
  const out = sanitizeDebug({ ime }).ime;
  assert.equal(out.certificate.eod.lastPushDay, '2026-10-26');
  assert.equal(out.certificate.eod.pushed, 12);
  assert.equal(out.certificate.eod.skippedSourceDate, 2);
  assert.equal(out.physical.lastAttemptDay, '2026-10-27');
  assert.equal(out.physical.lastRunDay, '2026-10-26');
  assert.equal(out.physical.dayTimezone, 'Asia/Tehran');
  assert.equal(out.physical.dayCalendar, 'gregorian');
  assert.equal(out.physical.inserted, 7);
  assert.equal(out.physical.table, 'missing');
  assert.equal(out.physical.targetCount, 3);
  assert.equal(out.physical.targetsTruncated, true);
  assert.equal(out.physical.targets.length, 2);
  assert.equal(out.physical.targets[0].date, '1405-08-05');
  assert.equal(out.physical.targets[0].dateCalendar, 'jalali');
  assert.equal(out.physical.targets[0].datePrecision, 'day');
  assert.equal(out.physical.targets[0].storageAttempts, 2);
  assert.equal(out.physical.targets[0].complete, false);
  assert.equal(out.physical.targets[0].error, 'upstream_server');
  assert.equal(out.physical.targets[0].nextRetryAt, new Date(1793066400000).toISOString());
  assert.equal(out.physical.targets[1].nextRetryAt, null);
  assert.equal(out.physical.targets[1].complete, true);
  assert.equal('lastRun' in out.physical, false);
  assert.equal(JSON.stringify(out).includes(secret), false);
  const missing = sanitizeDebug({}).ime;
  assert.equal(missing.physical.targets, null);
  assert.equal(missing.physical.inserted, null);
  assert.equal(missing.certificate.eod.pushed, null);
});

test('actual CLI fails reachable HTTP 502 while preserving transport distinction; HTTP 200 passes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relay-availability-'));
  try {
    const preload = join(directory, 'fake-fetch.mjs');
    const script = fileURLToPath(new URL('./relay-health-receipt.mjs', import.meta.url));
    for (const status of [502, 200]) {
      await writeFile(preload, `globalThis.fetch = async (url) => {
        if (url === 'https://arsadata.liara.run/debug') return Response.json(${JSON.stringify(debug())});
        if (url === 'https://arsadata.liara.run/healthz') return new Response('ok');
        if (url === 'https://62.60.191.24/liara-preview/') return new Response('fixture only', {status: ${status}});
        throw new Error('unexpected destination');
      };`);
      let exitCode = 0;
      try {
        await promisify(execFile)(process.execPath, ['--import', preload, script], {
          cwd: directory, env: { ...process.env, RELAY_TOKEN: 'synthetic', GITHUB_STEP_SUMMARY: '' }, timeout: 10000,
        });
      } catch (error) { exitCode = error.code; }
      assert.equal(exitCode, status === 200 ? 0 : 1);
      const receipt = JSON.parse(await readFile(join(directory, 'relay-health-receipt.json'), 'utf8'));
      assert.equal(receipt.backend.status, 'reachable');
      assert.equal(receipt.backend.httpStatus, status);
      assert.equal(receipt.backend.httpOk, status === 200);
      assert.equal(receipt.backend.error, null);
      assert.ok(receipt.limitations.some(text => text.includes('do not prove database health')));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
