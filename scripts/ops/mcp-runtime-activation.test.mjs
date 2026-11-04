import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { activate, BRIDGE_FLAG } from './mcp-runtime-activation.mjs';
const projectURL = 'https://api.liara.ir/v1/projects/arsadata';
const releasesURL = projectURL + '/releases?page=1&count=100';
const updateURL = 'https://api.liara.ir/v1/projects/update-envs';
const id = '6aebae17bb7b539b677fbac7';
const apiKey = 'synthetic-provider-fixture-only', token = 'synthetic-control-fixture-only';
const initial = () => [{ key: 'FIRST', value: 'preserve-first' }, { key: 'SUPABASE_URL', value: 'https://62.60.191.24/liara-preview' },
  { key: BRIDGE_FLAG, value: '0' }, { key: 'UNRELATED', value: 'private-unrelated-fixture' }];
function fixture(options = {}) {
  let envs = structuredClone(options.envs ?? initial()), reads = 0;
  const calls = [];
  const fetchImpl = async (url, init) => {
    assert.ok([projectURL, releasesURL, updateURL].includes(url), 'only fixed Liara control-plane hosts/paths');
    assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers.Authorization, 'Bearer ' + token);
    calls.push({ url, method: init.method, body: init.body });
    if (url === releasesURL) return Response.json({ currentRelease: options.badRelease ? 'a'.repeat(24) : id, releases: [{ _id: id, state: 'READY' }] });
    if (url === projectURL) {
      reads++;
      if (options.changeBeforeWrite && reads === 2) envs[0].value = 'concurrent-edit';
      if (options.failReadback && reads > 2) throw Error('private network detail must never escape');
      return Response.json({ project: { project_id: 'arsadata', envs } });
    }
    assert.equal(init.method, 'POST');
    const payload = JSON.parse(init.body); assert.deepEqual(Object.keys(payload), ['project', 'variables']);
    assert.equal(payload.project, 'arsadata');
    if (!options.doNotApply) envs = payload.variables;
    if (options.lostPost) throw Error('private remote rejection containing ' + apiKey);
    if (options.hangPost) return new Promise(() => {});
    return new Response('', { status: options.httpFailure ? 500 : 200 });
  };
  return { fetchImpl, calls, envs: () => envs };
}
const posts = f => f.calls.filter(call => call.method === 'POST');
const run = f => activate({ token, apiKey, fetchImpl: f.fetchImpl });

test('already-configured readback rechecks release before claiming a match',async()=>{
 const envs=initial().map(e=>e.key===BRIDGE_FLAG?{...e,value:'1'}:e);
 envs.push({key:'MCP_FARSI_API_KEY',value:apiKey});
 const f=fixture({envs});let releases=0;
 const fetchImpl=async(url,init)=>{
  if(url===releasesURL&&++releases===2)return Response.json({currentRelease:'changed',releases:[]});
  return f.fetchImpl(url,init);
 };
 const r=await activate({token,apiKey,mode:'readback',fetchImpl});
 assert.equal(releases,2);assert.equal(posts(f).length,0);
 assert.equal(r.state,'preflight_rejected');assert.notEqual(r.afterReleaseMatched,true);
});

test('single POST preserves every unrelated value and original order, adds only the approved key', async () => {
  const f = fixture(), before = initial(), r = await run(f);
  assert.equal(posts(f).length, 1); assert.equal(r.state, 'configuration_confirmed_restart_unproven');
  assert.equal(r.remoteRestartVerified, false); assert.equal(r.providerCalls, 0);
  const wanted = f.envs(); assert.equal(wanted.length, before.length + 1);
  assert.deepEqual(wanted.map(e => e.key), [...before.map(e => e.key), 'MCP_FARSI_API_KEY']);
  assert.deepEqual(wanted.filter(e => ![BRIDGE_FLAG, 'MCP_FARSI_API_KEY'].includes(e.key)), before.filter(e => e.key !== BRIDGE_FLAG));
  assert.equal(wanted.find(e => e.key === BRIDGE_FLAG).value, '1');
  assert.equal(wanted.at(-1).value, apiKey);
  assert.equal(r.existingValuesAndOrderPreserved, true);
  for (const value of [apiKey, token, 'private-unrelated-fixture']) assert.equal(JSON.stringify(r).includes(value), false);
  assert.equal(r.keyHashesPublished, false); assert.equal(r.plaintextSnapshotWritten, false);
});
test('missing credentials are rejected before any network call', async () => {
  for (const args of [{}, { token }, { token, apiKey: '' }, { token, apiKey: ' bad ' }]) {
    let calls = 0; const r = await activate({ ...args, fetchImpl: () => { calls++; throw Error('network forbidden'); } });
    assert.equal(calls, 0); assert.equal(r.postAttempts, 0);
  }
});
test('duplicate or invalid environment entries, wrong backend and existing different key fail before POST', async () => {
  for (const envs of [[...initial(), { key: 'FIRST', value: 'duplicate' }], [{ key: 'SUPABASE_URL', value: 'https://foreign.invalid' }],
    [...initial(), { key: 'MCP_FARSI_API_KEY', value: 'different-existing-key' }], [...initial(), { key: 'VALUE', value: 5 }]]) {
    const f = fixture({ envs }), r = await run(f);
    assert.equal(posts(f).length, 0); assert.equal(r.state, 'preflight_rejected');
  }
});
test('unexpected current release and concurrent environment changes fail before POST', async () => {
  for (const option of [{ badRelease: true }, { changeBeforeWrite: true }]) {
    const f = fixture(option), r = await run(f); assert.equal(posts(f).length, 0); assert.equal(r.postAttempts, 0);
  }
});
test('already desired configuration performs only GETs and does not restart', async () => {
  const envs = initial().map(e => e.key === BRIDGE_FLAG ? { key: e.key, value: '1' } : e);
  envs.push({ key: 'MCP_FARSI_API_KEY', value: apiKey });
  const f = fixture({ envs }), r = await run(f); assert.equal(r.state, 'already_configured_no_write');
  assert.equal(posts(f).length, 0); assert.equal(f.calls.length, 4);
});
test('explicit readback mode cannot POST even when configuration is not desired', async () => {
  const f = fixture(), r = await activate({ token, apiKey, mode: 'readback', fetchImpl: f.fetchImpl });
  assert.equal(posts(f).length, 0); assert.equal(r.state, 'readback_only_configuration_not_confirmed');
});
test('lost POST response causes GET-only readback without replay; remote restart remains unproven', async () => {
  const f = fixture({ lostPost: true }), r = await run(f);
  assert.equal(posts(f).length, 1); assert.equal(r.postAcknowledged, null);
  assert.equal(r.desiredConfigurationObserved, true); assert.equal(r.remoteRestartVerified, false);
  const index = f.calls.findIndex(c => c.method === 'POST'); assert.ok(f.calls.slice(index + 1).every(c => c.method === 'GET'));
  assert.equal(JSON.stringify(r).includes(apiKey), false);
});
test('unknown POST with unavailable readback remains unknown and cannot automatically retry', async () => {
  const f = fixture({ lostPost: true, failReadback: true }), r = await run(f);
  assert.equal(posts(f).length, 1); assert.equal(r.state, 'write_outcome_unknown_readback_unconfirmed');
  assert.equal(r.desiredConfigurationObserved, null); assert.equal(r.automaticRetry, false);
});
test('HTTP failure plus unchanged readback is not accepted as rollback or proof of no write', async () => {
  const f = fixture({ httpFailure: true, doNotApply: true }), r = await run(f);
  assert.equal(posts(f).length, 1); assert.equal(r.postAcknowledged, false);
  assert.equal(r.state, 'write_outcome_unknown_readback_unconfirmed'); assert.equal(r.desiredConfigurationObserved, false);
});
test('hanging POST is bounded and followed only by GETs, never another POST', async () => {
  const f = fixture({ hangPost: true }), r = await activate({ token, apiKey, fetchImpl: f.fetchImpl, timeoutMs: 10 });
  assert.equal(posts(f).length, 1); assert.equal(r.postAcknowledged, null); assert.equal(r.desiredConfigurationObserved, true);
});
test('unbounded/hanging bodies reject before writes; all transport options deny redirects', async () => {
  for (const kind of ['oversize', 'hang']) {
    let calls = 0;
    const r = await activate({ token, apiKey, timeoutMs: 10, fetchImpl: async (url, options) => {
      calls++; assert.equal(url, projectURL); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
      return new Response(kind === 'oversize' ? 'x'.repeat(1048577) : new ReadableStream({ pull: () => new Promise(() => {}) }));
    } });
    assert.equal(calls, 1); assert.equal(r.postAttempts, 0); assert.equal(r.state, 'preflight_rejected');
  }
});
test('actual workflow controller rejects head/repository/ref/attempt/event mismatch before activation', async () => {
  const workflow = (await readFile(new URL('../../.github/workflows/mcp-runtime-activation.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const match = workflow.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n\s+NODE/);
  assert.ok(match); const code = match[1].replace(/import \{ execFileSync \} from 'node:child_process';/, '');
  const sha = 'a'.repeat(40), valid = { EXPECTED_HEAD: sha, GITHUB_SHA: sha, GITHUB_WORKFLOW_SHA: sha,
    GITHUB_REPOSITORY: 'safariarash7777-source/portfolio-platform', GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1' };
  const evaluate = env => vm.runInNewContext(code, { execFileSync: () => sha + '\n',
    process: { env, exit: () => { throw Error('controller_denied'); } }, console: { log() {} } });
  evaluate(valid);
  for (const field of Object.keys(valid)) assert.throws(() => evaluate({ ...valid, [field]: 'wrong' }), /controller_denied/);
  assert.match(workflow, /group: deploy-relay-arsadata/); assert.match(workflow, /default: readback/);
  assert.ok(workflow.indexOf('Verify exact reviewed controller before secrets') < workflow.indexOf('secrets.LIARA_API_TOKEN'));
});
