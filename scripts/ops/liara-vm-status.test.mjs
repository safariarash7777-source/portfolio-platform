import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectVmStatus, selectVm } from './liara-vm-status.mjs';
const secret = 'PRIVATE_CREDENTIAL_NEVER_LOG';
const vm = () => ({ name: 'arsadata-backend', state: 'CREATED', power: 'POWERED_ON', createdAt: '2026-10-10T12:00:00+03:30', _id: secret, config: { rootPassword: secret }, IPs: [secret], plan: secret });
test('single fixed GET uses token only at official list endpoint and emits metadata allowlist', async () => {
  const calls = [];
  const receipt = await collectVmStatus({ token: secret, fetchImpl: async (url, init) => { calls.push({ url, init }); return Response.json({ vms: [vm(), { ...vm(), name: secret }] }); } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://iaas-api.liara.ir/vm');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.redirect, 'error');
  assert.ok(calls[0].init.signal);
  assert.equal(calls[0].init.dispatcher, undefined);
  assert.deepEqual(calls[0].init.headers, { Authorization: `Bearer ${secret}` });
  assert.equal(receipt.status, 'found'); assert.equal(receipt.matchCount, 1);
  assert.equal(receipt.createdAt, '2026-10-10T08:30:00.000Z');
  assert.equal(receipt.guestState, null);
  assert.equal(JSON.stringify(receipt).includes(secret), false);
});
test('unknown schema, missing credential, HTTP failure and absent target stay distinct', async () => {
  const noToken = await collectVmStatus({ fetchImpl: () => { throw new Error('must not call'); } });
  assert.equal(noToken.status, 'missing_credential'); assert.equal(noToken.matchCount, null);
  assert.equal(selectVm({ vms: [] }).status, 'not_found');
  assert.equal(selectVm({ vms: [] }).matchCount, 0);
  assert.equal(selectVm({ vms: null }).status, 'invalid_response');
  assert.equal(selectVm({ vms: [null] }).matchCount, null);
  assert.equal(selectVm({ vms: [vm(), vm()] }).status, 'ambiguous');
  const unknown = selectVm({ vms: [{ ...vm(), state: secret, power: secret, createdAt: '2026-09-31T00:00:00Z' }] });
  assert.equal(unknown.state, null); assert.equal(unknown.power, null); assert.equal(unknown.createdAt, null);
  const denied = await collectVmStatus({ token: secret, fetchImpl: async () => new Response(secret, { status: 403 }) });
  assert.equal(denied.status, 'http_error'); assert.equal(denied.httpStatus, 403); assert.equal(denied.matchCount, null);
  assert.equal(JSON.stringify(denied).includes(secret), false);
});
test('redirect/network failures never expose message, and oversized or invalid bodies are unknown without retry', async () => {
  for (const body of [secret, 'x'.repeat(1024 * 1024 + 1)]) {
    let calls = 0;
    const receipt = await collectVmStatus({ token: secret, fetchImpl: async () => { calls++; return new Response(body); } });
    assert.equal(receipt.status, 'invalid_response'); assert.equal(receipt.matchCount, null); assert.equal(calls, 1);
    assert.equal(JSON.stringify(receipt).includes(secret), false);
  }
  const failed = await collectVmStatus({ token: secret, fetchImpl: async () => { throw Object.assign(new Error(secret), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); } });
  assert.equal(failed.status, 'connection_error'); assert.equal(failed.error, 'UND_ERR_CONNECT_TIMEOUT');
  assert.equal(JSON.stringify(failed).includes(secret), false);
});
