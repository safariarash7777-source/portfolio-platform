/** Passive, fixed-destination receipt. Raw /debug is kept in memory only. */
import { appendFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ADMISSION_REASONS } from '../../relay/codal-admission-diagnostics.mjs';
import { evaluateDebug } from '../deploy/relay-gate.mjs';
import { observedBrsTransportPolicy } from '../../relay/brsapi-policy.mjs';

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
  if (/codal_source_challenge/.test(text)) return 'source_access_challenge';
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
// Decode only fixed producer templates; never scan arbitrary messages for codes.
const httpCodes = [400, 401, 402, 403, 404, 408, 409, 422, 429, 500, 502, 503, 504];
const sqlCodes = ['42501', '42P01', '42703', '23505', 'PGRST202', 'PGRST204', 'PGRST205', 'PGRST301'];
function safeErrorCodes(value) {
  const unknown = { httpStatus: null, sqlCode: null };
  if (typeof value !== 'string' || value.length > 1000) return unknown;
  for (const prefix of ['rpc brsapi_budget_lease → ', 'rpc brsapi_budget_release → ', 'codal_feed HTTP ']) {
    for (const status of httpCodes) {
      const header = prefix + status + ': ';
      if (!value.startsWith(header)) continue;
      let sqlCode = null;
      try { const body = JSON.parse(value.slice(header.length)); sqlCode = choice(body?.code, sqlCodes); } catch { /* Truncated body stays unknown. */ }
      return { httpStatus: status, sqlCode };
    }
  }
  return unknown;
}
const integer = x => Number.isSafeInteger(x) && x >= 0 ? x : null;
const integerCounts = (value, names) => Object.fromEntries(names.map(name => [name, integer(value?.[name])]));
const incompleteReasons = ['page_limit', 'invalid_order_or_identity', 'feed_write_failure', 'blocked_report', 'download_limit', 'report_failure', 'feed_failure', 'local_deferred'];
function diagnostics(value, shape) {
  const valid = value?.version === 1;
  const project = name => Object.fromEntries(Object.entries(shape).map(([group, names]) =>
    [group, integerCounts(valid ? value?.[name]?.[group] : null, names)]));
  return { version: valid ? 1 : null, totals: project('totals'), lastCycle: project('lastCycle') };
}
function codalDetails(engine, archive) {
  return {
    // Attempt clocks are not successful ingestion receipts.
    lastAttemptStartedAt: clock(engine?.lastRun),
    schedule: { running: boolean(engine?.schedule?.running), started: boolean(engine?.schedule?.started),
      lastStartedAt: clock(engine?.schedule?.lastStartedAt), lastCompletedAt: clock(engine?.schedule?.lastCompletedAt),
      ...integerCounts(engine?.schedule, ['regularIntervalMs', 'overnightIntervalMs']) },
    failureDiagnostics: diagnostics(engine?.failureDiagnostics, { download: ['exception'], admission: ['rejected', 'exception'], persistence: ['exception'] }),
    admissionDiagnostics: diagnostics(engine?.admissionDiagnostics, ADMISSION_REASONS),
    archive: {
      ok: boolean(archive?.ok), lastAttemptFinishedAt: clock(archive?.lastRun), error: errorCategory(archive?.lastError),
      budgetDate: date(archive?.budgetDate), ...integerCounts(archive, ['dailyCap', 'usedToday', 'cursor', 'queueSize', 'doneSymbols']),
      lastCycle: integerCounts(archive?.lastCycle, ['pages', 'downloaded', 'inserted', 'parseFailed', 'persistenceUnconfirmed']),
      coverage: { ...integerCounts(archive?.coverage, ['n30Symbols', 'n10Symbols', 'universeSize', 'storedRows', 'universeMonthly', 'universeFinancial', 'withoutReports']), basis: choice(archive?.coverage?.basis, ['stored-presence-not-freshness']), error: choice(archive?.coverage?.error, ['inventory_read_failed']), lastChecked: clock(archive?.coverage?.lastChecked) },
    },
  };
}

const operation = x => ({ ok: boolean(x?.ok), lastRun: clock(x?.lastRun), lastDate: date(x?.lastDate ?? x?.lastJdate), rows: number(x?.rows), error: errorCategory(x?.error ?? x?.lastError), skipped: x?.skipped == null ? null : true });
const budget = x => ({ accountingScope: 'internal_allocation_not_provider_usage', accountingState: choice(x?.accountingState, ['confirmed_internal_estimate', 'unknown']), available: boolean(x?.available), persistent: boolean(x?.persistent), day: date(x?.day), ...counts(x, ['softBudget', 'hardCeiling', 'used', 'remaining', 'rejectedByBudget']), softExhausted: boolean(x?.softExhausted), store: { healthy: boolean(x?.store?.healthy), errors: number(x?.store?.errors), error: errorCategory(x?.store?.lastError), ...safeErrorCodes(x?.store?.lastError) } });

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
    codal: { ...operation(d?.codalEngine), ...codalDetails(d?.codalEngine, d?.codalArchive), feed: { ...counts(d?.codalEngine?.feed, ['pages', 'seen', 'matched', 'downloaded', 'inserted', 'parseFailed']), complete: boolean(d?.codalEngine?.feed?.complete), incompleteReason: errorCategory(d?.codalEngine?.feed?.incompleteReason), incompleteReasonCode: choice(d?.codalEngine?.feed?.incompleteReason, incompleteReasons) }, feedTable: { ...counts(d?.codalEngine?.feedTable, ['attempted', 'inserted', 'duplicates']), error: errorCategory(d?.codalEngine?.feedTable?.lastError), ...safeErrorCodes(d?.codalEngine?.feedTable?.lastError) }, backfill: { ...integerCounts(d?.codalEngine?.backfill, ['queueSize', 'inserted', 'downloaded', 'parseFailed', 'skippedCovered', 'cursor', 'symbolLimit']), workWindow: choice(d?.codalEngine?.backfill?.workWindow, ['overnight', 'regular']) }, storedRecovery: { ...counts(d?.codalEngine?.storedRecovery, ['scanned', 'downloaded', 'inserted', 'parseFailed', 'blocked', 'skippedKnown', 'metadataSkipped']), reachedEnd: boolean(d?.codalEngine?.storedRecovery?.reachedEnd) } },
    history: Object.fromEntries(['eodHistory', 'indexHistory', 'marketBreadth', 'historyPrune'].map(k => [k, operation(d?.[k])])),
    commodity: { enabled: boolean(d?.commodity?.enabled), ...counts(d?.commodity, ['rows', 'reqToday', 'dailyCap', 'remaining']), lastFetchAt: clock(d?.commodity?.lastFetchAt), counterScope: choice(d?.commodity?.counterScope, ['process']), dayKey: date(d?.commodity?.dayKey), error: errorCategory(d?.commodity?.lastError) },
    ime: imeReceipt(d?.ime),
    mcpfarsiQuote: { enabled: boolean(d?.mcpfarsiQuote?.enabled), configured: boolean(d?.mcpfarsiQuote?.configured),
      requests: integer(d?.mcpfarsiQuote?.requests), pendingPublication: boolean(d?.mcpfarsiQuote?.pendingPublication),
      publication: choice(d?.mcpfarsiQuote?.publication, ['none', 'confirmed', 'unknown', 'pending_unconfirmed', 'superseded', 'conflict']),
      error: choice(d?.mcpfarsiQuote?.lastError, ['mcpfarsi_quote_refresh_failed', 'mcpfarsi_publication_requires_readback']),
      sourceDateRaw: date(d?.mcpfarsiQuote?.sourceDateRaw), sourceAtUtc: null },
    transport: { enabled: boolean(d?.brsapiTransport?.enabled), scope: choice(d?.brsapiTransport?.scope, ['process']),
      ...counts(d?.brsapiTransport, ['spacingMs', 'pending', 'sent', 'minStartGapMs', 'rollingWindowMs', 'rollingLimit', 'ipWindowMs', 'ipLimit']),
      policy: choice(d?.brsapiTransport?.policy, ['conservative_unverified_plan']),
      windowScope: choice(d?.brsapiTransport?.windowScope, ['process_lifetime']),
      priorProcessWindow: choice(d?.brsapiTransport?.priorProcessWindow, ['unknown']),
      coldStartPolicy: choice(d?.brsapiTransport?.coldStartPolicy, ['full_window_defer']),
      globalEnforced: boolean(d?.brsapiTransport?.globalEnforced), clockValid: boolean(d?.brsapiTransport?.clockValid) },
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
// CLI 9.5.1: env/list.js project.envs; app/logs.js releases/currentRelease.
// The API sends env values too: memory only, never serialized or logged here.
const CONTROL_PROJECT = 'https://api.liara.ir/v1/projects/arsadata';
const CONTROL_RELEASES = CONTROL_PROJECT + '/releases?page=1&count=100';
const releaseId = x => typeof x === 'string' && /^[a-f0-9]{24}$/.test(x) ? x : null;
const releaseState = x => choice(x, ['READY', 'FAILED', 'UNHEALTHY', 'CANCELED', 'TIMEDOUT', 'DEPLOYING', 'BUILDING', 'QUEUED']);
// Single approved value inspection in RAM. No URL normalization is accepted as
// an exact match: whitespace, trailing slash, port aliases and dot paths differ.
function reviewedBackendBinding(envs, namesComplete) {
  const result = { present: false, parseValid: false, noCredentialsQueryHash: false, exactReviewedBackendMatch: false, duplicateNameRejected: false, reason: 'invalid_env_schema' };
  if (!namesComplete) return result;
  const matches = envs.filter(e => e.key === 'SUPABASE_URL');
  result.present = matches.length > 0;
  if (matches.length > 1) return { ...result, duplicateNameRejected: true, reason: 'duplicate_name' };
  if (!matches.length) return { ...result, reason: 'missing' };
  const value = matches[0].value;
  if (typeof value !== 'string' || value !== value.trim() || /[\u0000-\u0020\u007f]/.test(value)) return { ...result, reason: 'invalid_url' };
  let parsed;
  try { parsed = new URL(value); } catch { return { ...result, reason: 'invalid_url' }; }
  result.parseValid = true;
  result.noCredentialsQueryHash = !parsed.username && !parsed.password && !value.includes('?') && !value.includes('#') && !value.slice(value.indexOf('://') + 3).split('/')[0].includes('@');
  if (!result.noCredentialsQueryHash) return { ...result, reason: 'credentials_query_or_hash' };
  result.exactReviewedBackendMatch = value === 'https://62.60.191.24/liara-preview';
  return { ...result, reason: result.exactReviewedBackendMatch ? 'exact_match' : 'different_url' };
}
function projectMetadata(body) {
  const p = body?.project;
  if (!p || p.project_id !== 'arsadata') throw new Error('invalid_schema');
  const envNamesComplete = Array.isArray(p.envs) && p.envs.every(e => typeof e?.key === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(e.key));
  return { projectId: 'arsadata', status: choice(p.status, ['running', 'stopped', 'starting', 'stopping', 'ready', 'failed']),
    // No verified CPU/RAM response contract in the installed CLI.
    cpuLimit: null, ramLimit: null,
    // CLI IProjectDetails declares these DETAIL fields, not running pod counts.
    configuredScale: Number.isSafeInteger(p.scale) && p.scale > 0 ? p.scale : null,
    configuredZeroDowntime: typeof p.zeroDowntime === 'boolean' ? p.zeroDowntime : null,
    configuredNotActual: true,
    reviewedBackendBinding: reviewedBackendBinding(p.envs, envNamesComplete),
    envNames: envNamesComplete ? [...new Set(p.envs.map(e => e.key))].sort() : null, envNamesComplete };
}
function releaseMetadata(body) {
  if (!body || !Array.isArray(body.releases) || body.releases.length > 100) throw new Error('invalid_schema');
  const currentReleaseId = releaseId(body.currentRelease);
  const matched = currentReleaseId ? body.releases.filter(r => r?._id === currentReleaseId) : [];
  const r = matched.length === 1 ? matched[0] : null;
  return { currentReleaseId, match: r ? 'exact' : currentReleaseId ? 'unresolved' : 'unknown',
    release: r ? { id: currentReleaseId, state: releaseState(r.state), createdAt: clock(r.createdAt), finishedAt: clock(r.finishedAt),
      commit: typeof r.gitInfo?.commit === 'string' && /^[a-f0-9]{40}$/.test(r.gitInfo.commit) ? r.gitInfo.commit : null,
      branch: typeof r.gitInfo?.branch === 'string' && /^(?:main|master|codex\/[a-z0-9-]{1,100})$/.test(r.gitInfo.branch) ? r.gitInfo.branch : null } : null };
}
export async function collectControlPlane({ token, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const request = async (url, project) => {
    if (!token) return { status: 'missing_credential', httpStatus: null, data: null };
    const controller = new AbortController(); let timer;
    const work = async () => {
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: controller.signal, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        return { status: response.status === 401 || response.status === 403 ? 'endpoint_authorization_rejected' : response.status === 404 ? 'endpoint_not_found' : 'endpoint_http_error', httpStatus: response.status, data: null };
      }
      const raw = await readBounded(response, 1024 * 1024);
      let data;
      try { const parsed = JSON.parse(raw); data = project ? projectMetadata(parsed) : releaseMetadata(parsed); }
      catch { return { status: 'invalid_schema', httpStatus: response.status, data: null }; }
      return { status: 'read', httpStatus: response.status, data };
    };
    try {
      return await Promise.race([work(), new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ status: 'timeout', httpStatus: null, data: null }); }, timeoutMs); })]);
    } catch (error) {
      return { status: error?.message === 'response_limit' ? 'response_too_large' : 'request_or_body_failed', httpStatus: null, data: null };
    } finally { clearTimeout(timer); controller.abort(); }
  };
  const [project, releases] = await Promise.all([request(CONTROL_PROJECT, true), request(CONTROL_RELEASES, false)]);
  return { project, releases, identity: project.status === 'read' && releases.status === 'read' && releases.data.match === 'exact' ? 'matched_control_plane_metadata' : 'unconfirmed',
    limitations: ['Environment values arrive in API memory only; names and booleans for one reviewed backend URL comparison are emitted.', 'Control-plane metadata is not proof of running process code, collector exclusion, budget or ingestion success.'] };
}

export async function collectReceipt({ token, controlPlaneToken, phase28Applied = false, fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
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
        const spacingPassed = observedBrsTransportPolicy(t);
        return { status: 'read', httpStatus, error: null, acceptance: evaluateDebug(raw, { phase28Applied }).ok ? 'passed' : 'failed', spacing: spacingPassed ? 'passed' : 'failed', data: sanitizeDebug(d) };
      } catch { return { status: 'invalid_response', httpStatus, error: kind === 'storedRead' ? 'invalid_stored_read_payload' : 'invalid_debug_payload' }; }
    } catch (error) { return { status: 'connection_error', httpStatus: null, error: transportError(error) }; }
  };
  const startedAt = now();
  const [health, debug, backend, storedRead, controlPlane] = await Promise.all([request(HEALTH, 'health'), request(DEBUG, 'debug'), request(BACKEND, 'backend'), request(STORED_READ, 'storedRead'), collectControlPlane({ token: controlPlaneToken, fetchImpl })]);
  return { schemaVersion: 1, startedAt, completedAt: now(), sampleCount: 1, mode: 'passive', health, debug, backend, storedRead, controlPlane,
    limitations: ['No source quote clocks are exposed by this debug contract; receipt time is not source time.', 'Process counters are not provider account usage or Liara billing.', 'Backend root HTTP 401 is an expected authentication challenge; HTTP 2xx or 401 alone do not prove database health. A successful stored Codal read proves that bounded public read only, may be cached, and does not prove all database services, deployed identity or fresh/complete reports.'] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const receipt = await collectReceipt({ token: process.env.RELAY_TOKEN, controlPlaneToken: process.env.LIARA_API_TOKEN, phase28Applied: process.env.PHASE28_APPLIED === 'true' });
    await writeFile('relay-health-receipt.json', JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(receipt));
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, '```json\n' + JSON.stringify(receipt, null, 2) + '\n```\n');
    if (receipt.health.status !== 'ok' || receipt.debug.acceptance !== 'passed' || receipt.debug.spacing !== 'passed' || receipt.backend.status !== 'reachable' || (receipt.backend.httpOk !== true && receipt.backend.httpStatus !== 401) || receipt.storedRead.status !== 'read') process.exitCode = 1;
  } catch { console.error('receipt_capture_failed'); process.exitCode = 1; }
}
