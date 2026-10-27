import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recoverBackend } from './liara-backend-recovery.mjs';
const id = '1234567890abcdef12345678', secret = 'DO_NOT_PUBLISH';
const vm = () => ({ _id: id, name: 'arsadata-backend', state: 'CREATED', power: 'POWERED_OFF', createdAt: '2026-10-01T00:00:00Z', config: { rootPassword: secret } });
const event = { name: 'shutdown', state: 'SUCCEEDED', createdAt: '2026-10-26T12:00:00Z', secret };
function harness({ rows = [vm()], events = [event], patch, after = [{ ...vm(), power: 'POWERED_ON' }] } = {}) {
  const calls = [], saved = []; let reads = 0;
  return { calls, saved, options: { token: secret, execute: true, persist: async r => saved.push(r), fetchImpl: async (url, init) => {
    calls.push({ url, init });
    assert.ok(url.startsWith('https://iaas-api.liara.ir/vm'));
    assert.equal(init.redirect, 'error'); assert.ok(init.signal); assert.equal(init.dispatcher, undefined);
    assert.equal(init.headers.Authorization, `Bearer ${secret}`);
    if (url.endsWith('/vm')) return Response.json({ vms: reads++ ? after : rows });
    if (url === `https://iaas-api.liara.ir/vm/operation/${id}`) return Response.json({ operations: events });
    assert.equal(url, `https://iaas-api.liara.ir/vm/power/${id}`);
    assert.equal(init.method, 'PATCH'); assert.deepEqual(JSON.parse(init.body), { action: 'start' });
    assert.equal(saved.at(-1).action.status, 'intent');
    return patch ? patch() : new Response(secret);
  } } };
}
test('exact existing OFF target receives one documented PATCH only after saved intent and ends with list readback', async () => {
  const h = harness(); const result = await recoverBackend(h.options);
  assert.deepEqual(h.calls.map(c => c.init.method), ['GET', 'GET', 'PATCH', 'GET']);
  assert.equal(result.status, 'powered_on_observed'); assert.equal(result.action.status, 'accepted');
  assert.equal(result.guestHealth, 'unknown'); assert.equal(result.databaseHealth, 'unknown');
  assert.equal(JSON.stringify(h.saved).includes(secret), false);
  assert.equal(JSON.stringify(h.saved).includes(id), false);
});
test('already ON is no-op; absent, duplicate, suspended, frozen, deleting and invalid id never mutate', async () => {
  for (const rows of [[], [vm(), vm()], [{ ...vm(), power: 'SUSPENDED' }], [{ ...vm(), state: 'FROZEN' }], [{ ...vm(), state: 'DELETING' }], [{ ...vm(), _id: '../other' }], [{ ...vm(), power: 'POWERED_ON' }]]) {
    const h = harness({ rows }); const result = await recoverBackend(h.options);
    assert.equal(h.calls.length, 1); assert.equal(result.action.status, 'not_sent');
    assert.equal(result.status, rows[0]?.power === 'POWERED_ON' ? 'already_on' : 'precondition_rejected');
  }
});
test('unresolved, malformed or unavailable operations stop start; inspect records eligibility without mutation', async () => {
  for (const events of [[{ ...event, state: 'RUNNING' }], [{ ...event, state: secret }], [{ ...event, createdAt: secret }], null]) {
    const h = harness({ events }); const result = await recoverBackend(h.options);
    assert.equal(result.status, 'operation_requires_review'); assert.equal(h.calls.length, 2);
    assert.equal(result.action.status, 'not_sent'); assert.equal(JSON.stringify(result).includes(secret), false);
  }
  const h = harness(); const result = await recoverBackend({ ...h.options, execute: false });
  assert.equal(result.status, 'eligible_off'); assert.equal(h.calls.length, 2);
});
test('lost PATCH response is read back without retry; OFF or changed identity remains unknown', async () => {
  for (const after of [[{ ...vm(), power: 'POWERED_ON' }], [vm()], [{ ...vm(), _id: 'abcdef1234567890abcdef12', power: 'POWERED_ON' }]]) {
    const h = harness({ after, patch: () => { throw Object.assign(new Error(secret), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); } });
    const result = await recoverBackend(h.options);
    assert.equal(h.calls.filter(c => c.init.method === 'PATCH').length, 1);
    assert.equal(h.calls.at(-1).url, 'https://iaas-api.liara.ir/vm');
    assert.equal(result.action.status, 'unknown');
    assert.equal(result.status, after[0]._id === id && after[0].power === 'POWERED_ON' ? 'powered_on_observed' : 'outcome_requires_review');
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});
test('HTTP rejection still gets readback and never retries; unavailable readback stays review-required', async () => {
  const h = harness({ patch: () => new Response(secret, { status: 409 }), after: [] });
  const result = await recoverBackend(h.options);
  assert.equal(result.action.httpStatus, 409); assert.equal(result.action.status, 'http_error');
  assert.equal(result.status, 'outcome_requires_review'); assert.equal(h.calls.length, 4);
});
test('missing credential and failed durable intent cannot send a mutation', async () => {
  const h = harness(); const missing = await recoverBackend({ ...h.options, token: undefined });
  assert.equal(missing.status, 'missing_credential'); assert.equal(h.calls.length, 0);
  await assert.rejects(recoverBackend({ ...h.options, persist: async () => { throw new Error('disk failure'); } }));
  assert.equal(h.calls.some(c => c.init.method === 'PATCH'), false);
  await assert.rejects(recoverBackend({ ...h.options, persist: undefined }), /durable_receipt_required/);
});
