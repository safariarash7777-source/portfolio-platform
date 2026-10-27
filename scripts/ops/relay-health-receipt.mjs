/** Passive, fixed-destination receipt. Raw /debug is kept in memory only. */
import { appendFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evaluateDebug } from '../deploy/relay-gate.mjs';

const DEBUG = 'https://arsadata.liara.run/debug';
const HEALTH = 'https://arsadata.liara.run/healthz';
const STORED_READ = 'https://portfolio-platform-fawn.vercel.app/api/codal-list?symbol=' + encodeURIComponent('فولاد');
const BACKEND = 'https://62.60.191.24/liara-preview/';
const families = ['gold', 'currency', 'crypto', 'stocks', 'funds', 'options', 'indices'];
const number = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
const boolean = x => typeof x === 'boolean' ? x : null;
const choice = (x, values) => values.includes(x) ? x : null;
const date = x => typeof x === 'string' && /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(x) ? x : null;
const clock = x => {
  if (typeof x === 'number') return x > 0 && Number.isSafeInteger(x) && x <= 8640000000000000 ? new Date(x).toISOString() : null;
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(x)) return null;
  return Number.isFinite(Date.parse(x)) ? new Date(x).toISOString() : null;
};
const counts = (object, keys) => Object.fromEntries(keys.map(k => [k, number(object?.[k])]));
const sum = object => object && typeof object === 'object' && !Array.isArray(object) && Object.values(object).every(x => number(x) !== null)
  ? number(Object.values(object).reduce((a, b) => a + b, 0)) : null;
const errorCodes = ['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET'];
export function transportError(error) {
  return errorCodes.includes(error?.cause?.code) ? error.cause.code : errorCodes.includes(error?.code) ? error.code : ['TimeoutError', 'AbortError'].includes(error?.name) ? 'TIMEOUT' : 'NETWORK_ERROR';
}
export function errorCategory(value) {
  if (value == null || value === '') return null;
  const text = typeof value === 'string' ? value.slice(0, 1000) : '';
  if (/timeout|timed out|aborted/i.test(text)) return 'timeout';
  if (/certificate|cert_|tls/i.test(text)) return 'tls';
  if (/\b(401|403)\b|unauthor|forbidden/i.test(text)) return 'authorization';
  if (/\b429\b|budget|quota|daily cap/i.test(text)) return 'budget_or_rate_limit';
  if (/\b404\b|PGRST202|table missing|does not exist/i.test(text)) return 'missing_endpoint_or_schema';
  if (text === 'http') return 'http';
  if (/\b5\d\d\b/.test(text)) return 'upstream_server';
  if (/disabled|missing.key/i.test(text)) return 'disabled_or_missing_configuration';
  if (/invalid|schema|parse|empty|shape/i.test(text)) return 'invalid_or_empty_response';
  if (/fetch|network|connect|socket/i.test(text)) return 'network';
  return 'other';
}
const operation = x => ({ ok: boolean(x?.ok), lastRun: clock(x?.lastRun), lastDate: date(x?.lastDate ?? x?.lastJdate), rows: number(x?.rows), error: errorCategory(x?.error ?? x?.lastError), skipped: x?.skipped == null ? null : true });
const budget = x => ({ available: boolean(x?.available), persistent: boolean(x?.persistent), day: date(x?.day), ...counts(x, ['softBudget', 'hardCeiling', 'used', 'remaining', 'rejectedByBudget']), softExhausted: boolean(x?.softExhausted), store: { healthy: boolean(x?.store?.healthy), errors: number(x?.store?.errors), error: errorCategory(x?.store?.lastError) } });

// IME scheduling days are Gregorian Tehran days, not timestamps. Target
// disclosure dates are Jalali days. Preserve both precisions explicitly.
function imeReceipt(ime) {
  const cert = ime?.certificate, eod = cert?.eod, physical = ime?.physical;
  const table = value => value === 'missing (run phase19 SQL)' ? 'missing' : choice(value, ['ok', 'unknown']);
  const targets = Array.isArray(physical?.targets) ? physical.targets : null;
  return {
    certificate: {
      ...counts(cert, ['rows', 'reqToday']), lastFetchAt: clock(cert?.lastFetchAt), error: errorCategory(cert?.lastError),
      eod: { dayCalendar: 'gregorian', dayTimezone: 'Asia/Tehran', lastPushDay: date(eod?.lastPushDay),
        ...counts(eod, ['pushed', 'skippedSourceDate']), table: table(eod?.table),
        skip: choice(eod?.skip, ['before-close', 'no-source-session-date']), error: errorCategory(eod?.lastError) },
    },
    physical: {
      dayCalendar: 'gregorian', dayTimezone: 'Asia/Tehran', lastAttemptDay: date(physical?.lastAttemptDay),
      lastRunDay: date(physical?.lastRunDay), cycleDay: date(physical?.cycleDay),
      ...counts(physical, ['inserted', 'maxProviderRequestsPerDay', 'maxStorageAttemptsPerTarget']),
      table: table(physical?.table), error: errorCategory(physical?.lastError),
      retryScope: choice(physical?.retryScope, ['process-memory-tehran-day']),
      targetCount: targets?.length ?? null, targetsTruncated: targets === null ? null : targets.length > 2,
      targets: targets === null ? null : targets.slice(0, 2).map(target => ({
        date: date(target?.date), dateCalendar: 'jalali', datePrecision: 'day',
        source: choice(target?.source, ['unattempted', 'failed', 'ready']),
        ...counts(target, ['sourceAttempts', 'storageAttempts', 'pendingRows', 'sourceRows', 'rejectedRows']),
        complete: boolean(target?.complete), nextRetryAt: clock(target?.nextRetryAt), error: errorCategory(target?.error),
      })),
    },
  };
}

export function sanitizeDebug(d) {
  const familyStatus = x => ({ state: choice(x?.state, ['received', 'empty', 'retained', 'stale', 'cached', 'unavailable']), receivedAt: clock(x?.receivedAt), retained: boolean(x?.retained), error: errorCategory(x?.error), sourceAt: null });
  const sources = ['brsapi_gold_currency', 'brsapi_stocks', 'brsapi_index', 'brsapi_nav', 'brsapi_fund_meta'];
  return {
    relayAt: clock(d?.now), warmedUp: boolean(d?.warmedUp), ageSec: number(d?.ageSec), lastRefresh: clock(d?.lastRefresh), lastAttempt: clock(d?.lastAttempt), error: errorCategory(d?.lastError),
    counts: counts(d?.counts, families),
    snapshot: { state: choice(d?.snapshotQuality?.state, ['complete', 'partial', 'error', 'unavailable']), attemptedAt: clock(d?.snapshotQuality?.attemptedAt), families: Object.fromEntries(families.map(k => [k, familyStatus(d?.snapshotQuality?.families?.[k])])) },
    baseline: { state: choice(d?.baseline?.state, ['unknown', 'loaded', 'absent', 'failed']), error: errorCategory(d?.baseline?.error) },
    sources: Object.fromEntries(sources.map(k => [k, { ok: boolean(d?.sources?.[k]?.ok), ...counts(d?.sources?.[k], ['gold', 'currency', 'stocks', 'funds', 'cached', 'updated', 'failed']), error: errorCategory(d?.sources?.[k]?.error) }])),
    storage: { enabled: boolean(d?.supabase?.enabled), ok: boolean(d?.supabase?.ok), httpStatus: number(d?.supabase?.status), at: clock(d?.supabase?.at), error: errorCategory(d?.supabase?.error) },
    codal: { ...operation(d?.codalEngine), feed: { ...counts(d?.codalEngine?.feed, ['pages', 'seen', 'matched', 'downloaded', 'inserted', 'parseFailed']), complete: boolean(d?.codalEngine?.feed?.complete), incompleteReason: errorCategory(d?.codalEngine?.feed?.incompleteReason) }, feedTable: { ...counts(d?.codalEngine?.feedTable, ['attempted', 'inserted', 'duplicates']), error: errorCategory(d?.codalEngine?.feedTable?.lastError) }, backfill: counts(d?.codalEngine?.backfill, ['queueSize', 'inserted', 'parseFailed', 'skippedCovered']) },
    history: Object.fromEntries(['eodHistory', 'indexHistory', 'marketBreadth', 'historyPrune'].map(k => [k, operation(d?.[k])])),
    commodity: { enabled: boolean(d?.commodity?.enabled), ...counts(d?.commodity, ['rows', 'reqToday', 'dailyCap', 'remaining']), lastFetchAt: clock(d?.commodity?.lastFetchAt), counterScope: choice(d?.commodity?.counterScope, ['process']), dayKey: date(d?.commodity?.dayKey), error: errorCategory(d?.commodity?.lastError) },
    ime: imeReceipt(d?.ime),
    transport: { enabled: boolean(d?.brsapiTransport?.enabled), scope: choice(d?.brsapiTransport?.scope, ['process']), ...counts(d?.brsapiTransport, ['spacingMs', 'pending', 'sent', 'minStartGapMs']) },
    budget: { providerAccountUsage: null, providerResetAt: null, liaraCost: null, clientEnabled: boolean(d?.brsapiClient?.enabled), client: budget(d?.brsapiClient?.budget), legacy: { enforced: boolean(d?.brsapiLegacy?.enforced), usedAggregate: sum(d?.brsapiLegacy?.used), rejectedAggregate: sum(d?.brsapiLegacy?.rejected), overBudgetPassedAggregate: sum(d?.brsapiLegacy?.overBudgetPassed), unmetered: number(d?.brsapiLegacy?.unmetered), budget: budget(d?.brsapiLegacy?.budget) }, stopped: boolean(d?.brsapiBudgetStop?.active), servedAgeMs: number(d?.brsapiBudgetStop?.servedAgeMs) },
  };
}

async function readBounded(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('response_limit');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); }
}
export async function collectReceipt({ token, fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  const request = async (url, kind) => {
    if (kind === 'debug' && !token) return { status: 'missing_credential', httpStatus: null, error: null };
    try {
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000), headers: kind === 'debug' ? { Authorization: `Bearer ${token}` } : {} });
      const httpStatus = response.status;
      if (kind === 'backend') { await response.body?.cancel(); return { status: 'reachable', httpStatus, httpOk: response.ok, error: null }; }
      if (!response.ok) { await response.body?.cancel(); return { status: 'http_error', httpStatus, error: null }; }
      let raw;
      try { raw = await readBounded(response, kind === 'health' ? 32 : 1024 * 1024); }
      catch { return { status: 'invalid_response', httpStatus, error: 'body_unreadable_or_too_large' }; }
      if (kind === 'health') return { status: raw.trim() === 'ok' ? 'ok' : 'invalid_response', httpStatus, error: null };
      try {
        const d = JSON.parse(raw);
        if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error();
        if (kind === 'storedRead') {
          if (d.source !== 'codal_feed' || d.coverage !== 'stored-announcements' || !Array.isArray(d.data)) throw new Error();
          return { status: 'read', httpStatus, error: null, rowCount: d.data.length };
        }
        const t = d.brsapiTransport;
        const spacingPassed = t?.enabled === true && t.scope === 'process' && t.spacingMs === 100 && Number.isSafeInteger(t.sent) && t.sent >= 2 && Number.isFinite(t.minStartGapMs) && t.minStartGapMs >= 100;
        return { status: 'read', httpStatus, error: null, acceptance: evaluateDebug(raw, { phase28Applied: false }).ok ? 'passed' : 'failed', spacing: spacingPassed ? 'passed' : 'failed', data: sanitizeDebug(d) };
      } catch { return { status: 'invalid_response', httpStatus, error: kind === 'storedRead' ? 'invalid_stored_read_payload' : 'invalid_debug_payload' }; }
    } catch (error) { return { status: 'connection_error', httpStatus: null, error: transportError(error) }; }
  };
  const startedAt = now();
  const [health, debug, backend, storedRead] = await Promise.all([request(HEALTH, 'health'), request(DEBUG, 'debug'), request(BACKEND, 'backend'), request(STORED_READ, 'storedRead')]);
  return { schemaVersion: 1, startedAt, completedAt: now(), sampleCount: 1, mode: 'passive', health, debug, backend, storedRead,
    limitations: ['No source quote clocks are exposed by this debug contract; receipt time is not source time.', 'Process counters are not provider account usage or Liara billing.', 'Backend root HTTP 401 is an expected authentication challenge; HTTP 2xx or 401 alone do not prove database health. A successful stored Codal read proves that bounded public read only, may be cached, and does not prove all database services, deployed identity or fresh/complete reports.'] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const receipt = await collectReceipt({ token: process.env.RELAY_TOKEN });
    await writeFile('relay-health-receipt.json', JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(receipt));
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, '```json\n' + JSON.stringify(receipt, null, 2) + '\n```\n');
    if (receipt.health.status !== 'ok' || receipt.debug.acceptance !== 'passed' || receipt.debug.spacing !== 'passed' || receipt.backend.status !== 'reachable' || (receipt.backend.httpOk !== true && receipt.backend.httpStatus !== 401) || receipt.storedRead.status !== 'read') process.exitCode = 1;
  } catch { console.error('receipt_capture_failed'); process.exitCode = 1; }
}
