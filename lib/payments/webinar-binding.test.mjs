import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const exports = {};
runInNewContext(ts.transpileModule(readFileSync(resolve(process.env.PAYMENT_TEST_SOURCE ?? '.', 'lib/payments/webinar-binding.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, require(name) {
  if (name === 'server-only') return {};
  if (name === '@/lib/deadline') return { withDeadline: fn => fn(new AbortController().signal) };
  throw new Error('unexpected dependency: ' + name);
} });
const ids = Array.from({ length: 5 }, (_, n) => `${n + 1}1111111-1111-4111-8111-111111111111`);
const valid = () => ({ contractVersion: 'webinar-payment-binding.v1', state: 'bound', purpose: 'webinar.v1', registrationProvenance: 'register-webinar.v1',
  paymentId: ids[0], userId: ids[1], registrationId: ids[2], webinarId: ids[3], intentKey: ids[4],
  amountToman: 100, createdAt: '2026-10-30T00:00:00Z', authority: 'A001', providerState: 'attached', status: 'pending', refId: null, verifiedAt: null,
  registrationState: 'pending', issuanceEnabled: false, settlementEnabled: false });

test('binding DTO accepts a versioned server snapshot without enabling writes', () => {
  assert.equal(exports.parseWebinarBinding(valid()).amountToman, 100);
});
for (const [field, values] of Object.entries({ contractVersion: [undefined, 'v2'], state: ['unbound'], purpose: [null, 'general'],
  registrationProvenance: [undefined, 'legacy'], paymentId: ['other'], userId: [null], registrationId: [''], webinarId: ['other'], intentKey: [null],
  amountToman: [null, 0, -1, 1.5, 2147483648], createdAt: ['2026-10-30'], authority: [null, 'invalid authority'], providerState: ['unknown', ['attached']],
  status: ['verified', ['pending']], registrationState: ['deleted', ['pending']], issuanceEnabled: [undefined, 'true'], settlementEnabled: [null] })) {
  test(`binding DTO rejects malformed ${field}`, () => {
    for (const value of values) assert.equal(exports.parseWebinarBinding({ ...valid(), [field]: value }), null);
  });
}
test('paid money requires a valid stored receipt and clock; unresolved service remains separate', () => {
  const paid = { ...valid(), status: 'paid', refId: '201', verifiedAt: '2026-10-30T01:00:00+00:00', registrationState: 'unresolved' };
  assert.equal(exports.parseWebinarBinding(paid).registrationState, 'unresolved');
  for (const refId of [null, '0', '-1', '1.5', '9007199254740992']) assert.equal(exports.parseWebinarBinding({ ...paid, refId }), null);
  assert.equal(exports.parseWebinarBinding({ ...paid, verifiedAt: '2026-10-30' }), null);
});
test('missing schema, RPC failure and foreign selector all fail closed with no fallback table reads', async () => {
  for (const rpc of [async () => { throw Error('missing RPC'); }, async () => ({ error: {}, data: valid() }), async () => ({ error: null, data: null }),
    async () => ({ error: null, data: { ...valid(), paymentId: ids[1] } })]) {
    assert.equal(await exports.readWebinarBinding({ rpc }, { paymentId: ids[0] }), null);
  }
});
test('intent equality includes amount, creation clock, owner, registration and authority', () => {
  const a = valid();
  assert.equal(exports.sameWebinarIntent(a, { ...a }), true);
  for (const key of ['paymentId', 'userId', 'registrationId', 'webinarId', 'intentKey', 'amountToman', 'createdAt', 'authority']) {
    assert.equal(exports.sameWebinarIntent(a, { ...a, [key]: key === 'amountToman' ? 101 : 'other' }), false);
  }
});
