import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEgressInventory } from './relay-egress-inventory.mjs';
const base = 'https://api.liara.ir/v1/projects';
function mock(projects, entries, errors = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.ok(url === base || projects.some(p => url === base + '/' + p.project_id));
    calls.push(url);
    if (errors[url]) return new Response('private error never published', { status: errors[url] });
    return Response.json(url === base ? { projects } : { project: entries[url.slice(base.length + 1)] });
  };
  return { fetchImpl, calls };
}
test('zero network without existing credential', async () => {
  let calls = 0;
  const r = await collectEgressInventory({ fetchImpl: async () => { calls++; } });
  assert.equal(calls, 0); assert.equal(r.state, 'missing_credential'); assert.equal(r.singleEgressEstablished, false);
});
test('shared main and commodity key scopes compare in RAM, never emit secret or fingerprint', async () => {
  const secret = 'private-provider-value-do-not-publish';
  const projects = [{ project_id: 'arsadata', scale: 1 }, { project_id: 'fx-app', scale: 2 }];
  const envs = [{ key: 'BRSAPI_KEY', value: secret }, { key: 'BRSAPI_COMMODITY_ENABLED', value: '1' }, { key: 'OTHER_SECRET', value: 'unrelated-secret-value' }];
  const m = mock(projects, Object.fromEntries(projects.map(p => [p.project_id, { ...p, envs }])));
  const r = await collectEgressInventory({ token: 'private-control-token', fetchImpl: m.fetchImpl });
  assert.equal(m.calls.length, 3); assert.equal(r.completeForListedAccount, true);
  assert.equal(r.projects[1].mainMatchesPrimary, true); assert.equal(r.projects[0].commodityMatchesPrimary, true);
  assert.equal(r.projects[1].configuredScale, 2); assert.equal(r.singleEgressEstablished, false);
  for (const secretValue of [secret, 'unrelated-secret-value', 'private-control-token']) assert.equal(JSON.stringify(r).includes(secretValue), false);
  assert.equal(r.keyHashPublished, false);
});
test('different key and no commodity opt-in are not classified as shared scope', async () => {
  const projects = [{ project_id: 'arsadata', scale: 1 }, { project_id: 'other', scale: 1 }];
  const m = mock(projects, { arsadata: { project_id: 'arsadata', envs: [{ key: 'BRSAPI_KEY', value: 'privateA' }] },
    other: { project_id: 'other', envs: [{ key: 'BRSAPI_KEY', value: 'privateB' }] } });
  const r = await collectEgressInventory({ token: 'private', fetchImpl: m.fetchImpl });
  assert.equal(r.projects[1].mainMatchesPrimary, false); assert.equal(r.projects[0].commodityMatchesPrimary, false);
});
test('duplicate env, missing env and failed project do not establish complete inventory', async () => {
  for (const envs of [undefined, [{ key: 'BRSAPI_KEY', value: 'a' }, { key: 'BRSAPI_KEY', value: 'b' }], [{ key: 'BRSAPI_KEY', value: 123 }], [{ key: 'BRSAPI_KEY', value: ' trailing ' }]]) {
    const m = mock([{ project_id: 'arsadata', scale: 1 }], { arsadata: { project_id: 'arsadata', envs } });
    const r = await collectEgressInventory({ token: 'private', fetchImpl: m.fetchImpl });
    assert.equal(r.projects[0].metadataState, 'unconfirmed'); assert.equal(r.completeForListedAccount, false);
    assert.equal(r.projects[0].mainMatchesPrimary, null);
  }
});
test('unknown primary key does not assert that another project uses a different key', async () => {
  const projects = [{ project_id: 'arsadata', scale: 1 }, { project_id: 'other', scale: 1 }];
  const m = mock(projects, { other: { project_id: 'other', envs: [{ key: 'BRSAPI_KEY', value: 'privateB' }] } }, { [base + '/arsadata']: 403 });
  const r = await collectEgressInventory({ token: 'private', fetchImpl: m.fetchImpl });
  assert.equal(r.projects[1].mainMatchesPrimary, null); assert.equal(r.completeForListedAccount, false);
});
test('invalid commodity activation stays unknown rather than asserting disabled or a different scope', async () => {
  for (const value of [true, 1, null, {}, '', 'yes', ' 1 ']) {
    const m = mock([{ project_id: 'arsadata', scale: 1 }], { arsadata: { project_id: 'arsadata', envs: [
      { key: 'BRSAPI_KEY', value: 'privateA' }, { key: 'BRSAPI_COMMODITY_ENABLED', value },
    ] } });
    const r = await collectEgressInventory({ token: 'private', fetchImpl: m.fetchImpl });
    assert.equal(r.completeForListedAccount, false); assert.equal(r.projects[0].metadataState, 'unconfirmed');
    assert.equal(r.projects[0].commodityOptIn, null); assert.equal(r.projects[0].commodityMatchesPrimary, null);
  }
});
test('only five projects, primary first; omitted projects remain an explicit gap', async () => {
  const projects = Array.from({ length: 8 }, (_, i) => ({ project_id: 'app-' + i, scale: 1 })).concat({ project_id: 'arsadata', scale: 1 });
  const m = mock(projects, Object.fromEntries(projects.map(p => [p.project_id, { ...p, envs: [] }])));
  const r = await collectEgressInventory({ token: 'private', fetchImpl: m.fetchImpl });
  assert.equal(r.projects[0].projectId, 'arsadata'); assert.equal(m.calls.length, 6);
  assert.equal(r.projects.length, 5); assert.equal(r.listedCount, 9); assert.equal(r.completeForListedAccount, false);
});
test('invalid identity or duplicate projects stop before any per-project request', async () => {
  for (const projects of [[{ project_id: '../foreign', scale: 1 }], [{ project_id: 'arsadata' }, { project_id: 'arsadata' }]]) {
    const m = mock(projects, {});
    const r = await collectEgressInventory({ token: 'private', fetchImpl: m.fetchImpl });
    assert.equal(r.state, 'invalid_list_schema'); assert.equal(m.calls.length, 1);
  }
});
test('authentication rejection is one read, never retried or exposed', async () => {
  const m = mock([], {}, { [base]: 401 });
  const r = await collectEgressInventory({ token: 'private', fetchImpl: m.fetchImpl });
  assert.equal(r.state, 'list_unconfirmed'); assert.equal(m.calls.length, 1);
  assert.equal(JSON.stringify(r).includes('private error'), false);
});
test('hanging fetch deadline is bounded without provider calls or retries', async () => {
  const r = await collectEgressInventory({ token: 'private', fetchImpl: async () => new Promise(() => {}), timeoutMs: 10 });
  assert.equal(r.state, 'list_unconfirmed'); assert.equal(r.controlPlaneRequests, 1); assert.equal(r.providerCalls, 0);
});
test('release metadata binds a stable current release and exposes only an allowlisted image reference', async () => {
  const id = 'a'.repeat(24), commit = 'b'.repeat(40), image = 'apps/' + 'c'.repeat(24) + ':synthetic1';
  const calls = [];
  const r = await collectEgressInventory({ token: 'private', includeRelease: true, fetchImpl: async url => {
    calls.push(url);
    if (url === base) return Response.json({ projects: [{ project_id:'arsadata', scale:1 }] });
    if (url === base + '/arsadata') return Response.json({ project:{ project_id:'arsadata', envs:[] } });
    if (url.includes('/releases?')) return Response.json({ currentRelease:id, releases:[{ _id:id, state:'READY', imageName:image, message:'relay @ ' + commit, raw:'PRIVATE' }] });
    assert.equal(url, 'https://api.liara.ir/v1/releases/' + id);
    return Response.json({ release:{ _id:id, imageName:'registry.c2.liara.ir/' + image, raw:'PRIVATE' } });
  } });
  assert.equal(calls.length,5);assert.equal(r.release.state,'metadata_read');assert.equal(r.release.imageReference,image);
  assert.equal(r.release.sourceCommitFromMessage,commit);assert.equal(r.release.rollbackAuthorized,false);
  assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
});
test('changed release or conflicting image references do not attest a rollback image', async () => {
  for (const changed of [true,false]) {
    const id='a'.repeat(24);let reads=0;
    const r=await collectEgressInventory({token:'private',includeRelease:true,fetchImpl:async url=>{
      if(url===base)return Response.json({projects:[{project_id:'arsadata',scale:1}]});
      if(url===base+'/arsadata')return Response.json({project:{project_id:'arsadata',envs:[]}});
      if(url.includes('/releases?')){reads++;return Response.json({currentRelease:changed&&reads>1?'d'.repeat(24):id,releases:[{_id:id,state:'READY',image:'apps/'+'c'.repeat(24)+':old'}]});}
      return Response.json({release:{_id:id,image:'apps/'+'c'.repeat(24)+':different',message:'PRIVATE'}});
    }});
    assert.equal(r.release.imageReference,null);assert.equal(r.release.rollbackAuthorized,false);
  }
});
