import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectControlPlane, collectReceipt, sanitizeDebug, errorCategory, transportError } from './relay-health-receipt.mjs';
const storedUrl = 'https://portfolio-platform-fawn.vercel.app/api/codal-list?symbol=' + encodeURIComponent('فولاد');
const storedBody = { source: 'codal_feed', coverage: 'stored-announcements', data: [{ private: 'NEVER_EMIT_PRIVATE_VALUE' }] };
const secret = 'NEVER_EMIT_PRIVATE_VALUE';
test('enforced runtime requires explicit installed-schema evidence in passive acceptance', async () => {
  const d = debug(); d.brsapiLegacy.enforced = true;
  const fetchImpl = async url => new Response(url.endsWith('/debug') ? JSON.stringify(d)
    : url.endsWith('/healthz') ? 'ok' : JSON.stringify(storedBody));
  for (const applied of [false, true]) {
    const r = await collectReceipt({ token: secret, phase28Applied: applied, fetchImpl });
    assert.equal(r.debug.acceptance, applied ? 'passed' : 'failed');
    assert.equal(r.debug.data.budget.providerAccountUsage, null);
    assert.equal(r.debug.data.budget.legacy.budget.accountingScope, 'internal_allocation_not_provider_usage');
  }
});
function debug() {
  return { now: 1793066400000, warmedUp: true, lastRefresh: 1793066300000, ageSec: 100,
    historySections: { written: ['gold', 'currency'], missing: [] },
    brsapiClient: { enabled: false }, brsapiLegacy: { enforced: false, used: { privateProducer: 12 }, budget: { persistent: true, used: 12, remaining: 88, store: { healthy: false, errors: 1, lastError: 'HTTP 404 PGRST202 ' + secret } } },
    brsapiTransport: { enabled: true, scope: 'process', spacingMs: 300, sent: 6508, pending: 0, minStartGapMs: 309.6578,
      rollingWindowMs: 300000, rollingLimit: 300, ipWindowMs: 1000, ipLimit: 20,
      policy: 'conservative_unverified_plan', windowScope: 'process_lifetime', priorProcessWindow: 'unknown',
      coldStartPolicy: 'full_window_defer', globalEnforced: false, clockValid: true },
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
test('one sample uses only four fixed passive GETs, rejects redirects and sends token only to relay debug', async () => {
  const calls = [];
  const result = await collectReceipt({ token: secret, fetchImpl: async (url, init) => {
    calls.push([url, init]);
    return new Response(url === storedUrl ? JSON.stringify(storedBody) : url.endsWith('/debug') ? JSON.stringify(debug()) : url.endsWith('/healthz') ? 'ok' : secret);
  } });
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map(([url]) => url).sort(), ['https://62.60.191.24/liara-preview/', 'https://arsadata.liara.run/debug', 'https://arsadata.liara.run/healthz', storedUrl]);
  for (const [url, init] of calls) {
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    assert.deepEqual(init.headers, url.endsWith('/debug') ? { Authorization: `Bearer ${secret}` } : {});
    assert.equal(init.dispatcher, undefined);
  }
  assert.equal(result.debug.acceptance, 'passed'); assert.equal(result.debug.spacing, 'passed');
  assert.equal(result.storedRead.status, 'read'); assert.equal(result.storedRead.rowCount, 1);
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
  assert.equal(calls.length, 3);
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
    assert.equal(calls, 4);
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
  assert.match(workflow, /observedBrsTransportPolicy\(t\)/);
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

test('actual CLI accepts protected root401 only with valid public stored read; rejects502 and invalid read', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relay-availability-'));
  try {
    const preload = join(directory, 'fake-fetch.mjs');
    const script = fileURLToPath(new URL('./relay-health-receipt.mjs', import.meta.url));
    for (const [status, body, expectedExit] of [[502, storedBody, 1], [200, storedBody, 0], [401, storedBody, 0], [401, { ...storedBody, data: null }, 1], [401, { ...storedBody, source: 'other' }, 1]]) {
      await writeFile(preload, `globalThis.fetch = async (url) => {
        if (url === 'https://arsadata.liara.run/debug') return Response.json(${JSON.stringify(debug())});
        if (url === 'https://arsadata.liara.run/healthz') return new Response('ok');
        if (url === 'https://62.60.191.24/liara-preview/') return new Response('fixture only', {status: ${status}});
        if (url === ${JSON.stringify(storedUrl)}) return Response.json(${JSON.stringify(body)});
        throw new Error('unexpected destination');
      };`);
      let exitCode = 0;
      try {
        await promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href, script], {
          cwd: directory, env: { ...process.env, RELAY_TOKEN: 'synthetic', LIARA_API_TOKEN: '', GITHUB_STEP_SUMMARY: '' }, timeout: 10000,
        });
      } catch (error) { exitCode = error.code; }
      assert.equal(exitCode, expectedExit);
      const receipt = JSON.parse(await readFile(join(directory, 'relay-health-receipt.json'), 'utf8'));
      assert.equal(receipt.backend.status, 'reachable');
      assert.equal(receipt.backend.httpStatus, status);
      assert.equal(receipt.backend.httpOk, status === 200);
      assert.equal(receipt.backend.error, null);
      assert.ok(receipt.limitations.some(text => text.includes('do not prove database health')));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Codal exact reasons and versioned diagnostics preserve real counts without names or success inference', () => {
  const input = { codalEngine: { lastRun: 1793066300000, feed: { incompleteReason: 'invalid_order_or_identity' },
    admissionDiagnostics: { version: 1, lastCycle: { 'ن-۱۰': { scope_unknown: 6, unit_unverified: 0, private: secret } } },
    failureDiagnostics: { version: 1, totals: { persistence: { exception: 2 } } } },
    codalArchive: { ok: false, lastRun: 1793066400000, usedToday: 3, lastCycle: { symbols: [secret], pages: 2, persistenceUnconfirmed: 1 }, coverage: { n10Symbols: 20 } } };
  const out = sanitizeDebug(input).codal;
  assert.equal(out.feed.incompleteReasonCode, 'invalid_order_or_identity');
  assert.equal(out.feed.incompleteReason, 'invalid_or_empty_response');
  assert.equal(out.lastAttemptStartedAt, new Date(input.codalEngine.lastRun).toISOString());
  assert.equal(out.archive.lastAttemptFinishedAt, new Date(input.codalArchive.lastRun).toISOString());
  assert.equal(out.admissionDiagnostics.lastCycle['ن-۱۰'].scope_unknown, 6);
  assert.equal(out.admissionDiagnostics.lastCycle['ن-۱۰'].unit_unverified, 0);
  assert.equal(out.admissionDiagnostics.lastCycle['ن-۳۰'].short_rows, null);
  assert.equal(out.failureDiagnostics.totals.persistence.exception, 2);
  assert.equal(out.archive.lastCycle.persistenceUnconfirmed, 1);
  assert.equal(out.archive.lastCycle.downloaded, null);
  assert.equal(JSON.stringify(out).includes(secret), false);
  for (const reason of ['page_limit', 'feed_write_failure', 'blocked_report', 'download_limit', 'report_failure', 'feed_failure']) {
    assert.equal(sanitizeDebug({codalEngine:{feed:{incompleteReason:reason}}}).codal.feed.incompleteReasonCode, reason);
  }
});

test('Codal diagnostics drop unknown versions, malformed counters and secret-bearing reason strings', () => {
  for (const bad of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, '3', null]) {
    const out = sanitizeDebug({codalEngine:{feed:{incompleteReason:'invalid_order_or_identity '+secret}, admissionDiagnostics:{version:1,lastCycle:{'ن-۱۰':{scope_unknown:bad}}}},codalArchive:{usedToday:bad}}).codal;
    assert.equal(out.feed.incompleteReasonCode,null);
    assert.equal(out.admissionDiagnostics.lastCycle['ن-۱۰'].scope_unknown,null);
    assert.equal(out.archive.usedToday,null);
    assert.equal(JSON.stringify(out).includes(secret),false);
  }
  const missing=sanitizeDebug({}).codal;
  assert.equal(missing.lastAttemptStartedAt,null);
  assert.equal(missing.archive.lastAttemptFinishedAt,null);
  assert.equal(missing.admissionDiagnostics.version,null);
  assert.equal(sanitizeDebug({codalEngine:{failureDiagnostics:{version:2,totals:{download:{exception:0}}}}}).codal.failureDiagnostics.totals.download.exception,null);
});

test('HTTP and SQL details require fixed producer prefixes and exact code allowlists, never raw error scans', () => {
  const project = value => sanitizeDebug({brsapiLegacy:{budget:{store:{lastError:value}}}}).budget.legacy.budget.store;
  const known=project('rpc brsapi_budget_lease → 404: '+JSON.stringify({code:'PGRST202',message:secret,details:'https://private.invalid/'+secret}));
  assert.equal(known.httpStatus,404);assert.equal(known.sqlCode,'PGRST202');assert.equal(JSON.stringify(known).includes(secret),false);
  const feed=sanitizeDebug({codalEngine:{feedTable:{lastError:'codal_feed HTTP 403: {"code":"42501"}'}}}).codal.feedTable;
  assert.equal(feed.httpStatus,403);assert.equal(feed.sqlCode,'42501');
  for(const message of [secret+' HTTP 403 PGRST202','rpc unknown → 404: {"code":"PGRST202"}','rpc brsapi_budget_lease → 499: {"code":"PGRST202"}']) {
    assert.equal(project(message).httpStatus,null);assert.equal(project(message).sqlCode,null);
  }
  for(const body of ['{"code":"PGRST202 '+secret+'"}', '{"message":"PGRST202"}', '{"code":"PGRST202",', 'null']) {
    const out=project('rpc brsapi_budget_release → 503: '+body);
    assert.equal(out.httpStatus,503);assert.equal(out.sqlCode,null);assert.equal(JSON.stringify(out).includes(secret),false);
  }
});

const currentId = '0123456789abcdef01234567';
function controlBodies(url) {
  return url.includes('/releases?') ? {currentRelease:currentId,releases:[{_id:currentId,state:'READY',createdAt:'2026-11-04T00:00:00Z',finishedAt:null,imageName:secret,gitInfo:{commit:'a'.repeat(40),branch:'main',message:secret,author:{email:secret}}}]} : {project:{project_id:'arsadata',status:'running',envs:[{key:'SUPABASE_URL',value:secret},{key:'BRSAPI_KEY',value:secret},{key:'bad key '+secret,value:secret}],password:secret}};
}
test('control-plane uses only two fixed GETs and projects exact current identity without values or image strings',async()=>{
  const calls=[];const out=await collectControlPlane({token:secret,fetchImpl:async(url,init)=>{calls.push([url,init]);return Response.json(controlBodies(url));}});
  assert.deepEqual(calls.map(c=>c[0]),['https://api.liara.ir/v1/projects/arsadata','https://api.liara.ir/v1/projects/arsadata/releases?page=1&count=100']);
  for(const [,init] of calls){assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer '+secret);assert.ok(init.signal);}
  assert.equal(out.identity,'matched_control_plane_metadata');assert.equal(out.project.data.envNames,null);assert.equal(out.project.data.envNamesComplete,false);assert.equal(out.project.data.cpuLimit,null);assert.equal(out.project.data.ramLimit,null);
  assert.equal(out.releases.data.release.id,currentId);assert.equal(out.releases.data.release.commit,'a'.repeat(40));assert.equal(JSON.stringify(out).includes(secret),false);
});
test('current release never falls back to newest and malformed or duplicate identities remain unconfirmed',async()=>{
  for(const kind of ['absent','duplicate','unknown','wrong-project']){
    const out=await collectControlPlane({token:secret,fetchImpl:async url=>{const b=controlBodies(url);if(b.releases){if(kind==='absent')b.currentRelease='b'.repeat(24);if(kind==='duplicate')b.releases.push(b.releases[0]);if(kind==='unknown')b.currentRelease=secret;}else if(kind==='wrong-project')b.project.project_id='another-app';return Response.json(b);}});
    assert.equal(out.identity,'unconfirmed');if(kind!=='wrong-project')assert.equal(out.releases.data.release,null);assert.equal(JSON.stringify(out).includes(secret),false);
  }
});
test('control-plane error responses are endpoint scoped and discarded without retry',async()=>{
  for(const status of [401,403,404,307,308,500]){let calls=0;const out=await collectControlPlane({token:secret,fetchImpl:async()=>{calls++;return new Response(secret,{status});}});assert.equal(calls,2);assert.equal(out.identity,'unconfirmed');assert.equal(out.project.httpStatus,status);assert.equal(out.project.status,[401,403].includes(status)?'endpoint_authorization_rejected':status===404?'endpoint_not_found':'endpoint_http_error');assert.equal(JSON.stringify(out).includes(secret),false);}
  let calls=0;const missing=await collectControlPlane({fetchImpl:async()=>{calls++;throw Error(secret);}});assert.equal(calls,0);assert.equal(missing.identity,'unconfirmed');
});
test('control-plane body limit, stalled fetch/body deadlines and invalid schema fail closed',async()=>{
  for(const mode of ['large','invalid','fetch-stall','body-stall','reject']){
    let calls=0;const out=await collectControlPlane({token:secret,timeoutMs:20,fetchImpl:async()=>{calls++;if(mode==='fetch-stall')return new Promise(()=>{});if(mode==='reject')throw Error(secret);if(mode==='body-stall')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}));return new Response(mode==='large'?'x'.repeat(1024*1024+1):'{invalid '+secret);}});
    assert.equal(calls,2);assert.equal(out.identity,'unconfirmed');assert.equal(out.project.status,mode==='large'?'response_too_large':mode==='invalid'?'invalid_schema':mode==='reject'?'request_or_body_failed':'timeout');assert.equal(JSON.stringify(out).includes(secret),false);
  }
});
test('control-plane rejection does not alter passive acceptance and credentials never cross destinations',async()=>{
  const calls=[];const out=await collectReceipt({token:'relay-fixture',controlPlaneToken:secret,fetchImpl:async(url,init)=>{calls.push(url);if(url.startsWith('https://api.liara.ir/')){assert.equal(init.headers.Authorization,'Bearer '+secret);return new Response('private body',{status:403});}assert.equal(init.headers.Authorization,url.endsWith('/debug')?'Bearer relay-fixture':undefined);return new Response(url===storedUrl?JSON.stringify(storedBody):url.endsWith('/debug')?JSON.stringify(debug()):url.endsWith('/healthz')?'ok':'fixture');}});
  assert.equal(calls.length,6);assert.equal(out.debug.acceptance,'passed');assert.equal(out.storedRead.status,'read');assert.equal(out.controlPlane.identity,'unconfirmed');assert.equal(JSON.stringify(out).includes(secret),false);
});

test('environment names distinguish explicit empty from incomplete schema without inspecting values',async()=>{
  for(const [envs,expected,complete] of [[undefined,null,false],[{},null,false],['invalid',null,false],[[{key:'VALID',value:secret},{}],null,false],[[{key:'VALID',value:secret},{key:1}],null,false],[[],[],true],[[{key:'B',value:secret},{key:'A',value:secret},{key:'B',value:secret}],['A','B'],true]]){
    const out=await collectControlPlane({token:secret,fetchImpl:async url=>{const body=controlBodies(url);if(body.project)body.project.envs=envs;return Response.json(body);}});
    assert.deepEqual(out.project.data.envNames,expected);assert.equal(out.project.data.envNamesComplete,complete);assert.equal(JSON.stringify(out).includes(secret),false);
  }
});

test('reviewed backend binding inspects only the single URL in RAM and never emits it',async()=>{
  const reviewed='https://62.60.191.24/liara-preview';
  const cases=[
    [undefined,'invalid_env_schema',false,false,false,false,false],
    [[], 'missing',false,false,false,false,false],
    [[{key:'SUPABASE_URL',value:null}],'invalid_url',true,false,false,false,false],
    [[{key:'SUPABASE_URL',value:'not a URL'}],'invalid_url',true,false,false,false,false],
    [[{key:'SUPABASE_URL',value:reviewed},{key:'SUPABASE_URL',value:reviewed}],'duplicate_name',true,false,false,false,true],
    ...['https://other.invalid/liara-preview','https://62.60.191.24/other',reviewed+'/', 'https://62.60.191.24:443/liara-preview'].map(value=>[[{key:'SUPABASE_URL',value}],'different_url',true,true,true,false,false]),
    ...['https://user:private@62.60.191.24/liara-preview',reviewed+'?private='+secret,reviewed+'#'+secret,reviewed+'?',reviewed+'#'].map(value=>[[{key:'SUPABASE_URL',value}],'credentials_query_or_hash',true,true,false,false,false]),
    [[{key:'SUPABASE_URL',value:' '+reviewed}],'invalid_url',true,false,false,false,false],
    [[{key:'SUPABASE_URL',value:reviewed},{key:'SERVICE_ROLE_KEY',value:secret}],'exact_match',true,true,true,true,false],
  ];
  for(const [envs,reason,present,parseValid,noCredentialsQueryHash,exactReviewedBackendMatch,duplicateNameRejected] of cases){
    const out=await collectControlPlane({token:secret,fetchImpl:async url=>{const body=controlBodies(url);if(body.project)body.project.envs=envs;return Response.json(body);}});
    assert.deepEqual(out.project.data.reviewedBackendBinding,{present,parseValid,noCredentialsQueryHash,exactReviewedBackendMatch,duplicateNameRejected,reason});
    const serialized=JSON.stringify(out);assert.equal(serialized.includes(reviewed),false);assert.equal(serialized.includes(secret),false);assert.equal(serialized.includes('user:private'),false);
  }
});
