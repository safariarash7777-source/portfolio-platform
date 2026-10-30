// Offline infrastructure/profile checks, not an executed native/Auth receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { nativeAuthProfile, verifyEnvironment, allowedProfileURL, nativeBrowserMode, origin } from './native-auth-runtime.mjs';
import { gatewayProfile } from './native-auth-gateway.mjs';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
test('single compiled profile, four owned actors and exact source routes; no external target', () => {
  const profile = nativeAuthProfile('consultation-ticket');
  assert.deepEqual(profile.actors, { a: 'user', b: 'user', owner: 'admin', admin: 'admin' });
  assert.deepEqual(profile.routes, gatewayProfile('consultation-ticket').routes);
  assert.throws(() => nativeAuthProfile('p09')); assert.throws(() => nativeAuthProfile('pf10'));
  assert.throws(() => allowedProfileURL('consultation-ticket', 'https://production.invalid/api/consultation/tickets'));
  assert.throws(() => allowedProfileURL('consultation-ticket', origin + '/api/unknown'));
});
test('laptop/local calls fail before provisioning; explicit closed browser mode is separate', () => {
  assert.throws(() => verifyEnvironment({}, 'linux'));
  assert.throws(() => verifyEnvironment({ CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_TEMP: '/tmp/owned' }, 'win32'));
  assert.equal(nativeBrowserMode('consultation-ticket', { browserMode: true }), true);
  assert.equal(nativeBrowserMode('consultation-ticket'), false);
});
test('native scenario inventory includes setup and all checked phases', () => {
  const checkedScenarios = [...read('native.mjs').matchAll(/\bpass\('/g)].length;
  assert.equal(checkedScenarios + 2, 17);
  assert.equal(nativeAuthProfile('consultation-ticket').phases, 17);
  assert.doesNotMatch(read('native.mjs'), /Response\.json\(|new Response\(/);
});
test('derivative runtime and gateway match their pinned test-only lineage manifest', () => {
  const lineage = JSON.parse(read('native-infrastructure-lineage.json'));
  assert.equal(lineage.sourceSha, '67aeda9ff84fb1d3e936fc39564c0e551b3ff17e');
  for (const file of lineage.files) {
    const name = file.path.split('/').at(-1);
    assert.equal(createHash('sha256').update(read(name)).digest('hex'), file.derivedSha256);
    assert.match(file.sourceSha256, /^[a-f0-9]{64}$/);
  }
});
