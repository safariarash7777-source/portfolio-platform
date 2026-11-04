// Synthetic offline records, validated with the sealed existing browser validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { validateCaptured, candidate, checks } from './receipt.mjs';
const sealed = await import(pathToFileURL(process.env.ASSEMBLED_TEST_SEALED_RUNTIME));
const allocation = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const runId = 'assembled-member-admin-' + owner;
const binding = { executionAllocationId: allocation };
const clone = value => structuredClone(value);

function synthetic() {
  const browser = { status: 'PASS', readerSha: candidate, driverVersion: '1.64.1',
    sourceExecutable: '/opt/google/chrome/chrome', sourceSha256: sealed.browserSourceSha,
    executable: '/tmp/p09b-Ab1234/chrome/chrome', ownedTemp: '/tmp/p09b-Ab1234', ownerId: owner,
    chromeVersion: 'Google Chrome 156.0.0.0', chromeSha256: sealed.browserSourceSha,
    closure: { sourceStable: true, copyMatched: true, runtimeReadonly: true, sha256: 'a'.repeat(64), entries: 1, bytes: 1, freeBeforeBytes: 5 * 1024 ** 3 },
    checks: sealed.assembledDiagnosticChecks.map(name => ({ name, status: 'PASS' })),
    sameJwtVerified: true, ownForeignRlsVerified: true, expiredDomVerified: true,
    activeDomVerified: true, revokedDomVerified: true, advisorZeroSideGetVerified: true,
    identityCleared: true, signoutCleared: true, readOnlyGrantOnly: true, productWriteClosed: true,
    domAutomaticPosts: 0, privateStorageHits: 0, privateUrlHits: 0, productServiceRight: 'NOT_CONNECTED',
    cleanup: { processStopped: true, contextsClosed: true, ownedTempRemoved: true, ownerId: owner } };
  const native = { sha: candidate, readerSha: candidate, status: 'PASS_BOUNDED_ASSEMBLED_NATIVE',
    fullAssembledAcceptance: 'NOT_ESTABLISHED',
    remaining: ['published-versioned-summary-in-this-composition', 'unknown-write-ui-recovery-in-this-composition'],
    allocationId: allocation, scenarios: 14, cleanup: 'REMOVED_OWNED_RESOURCES',
    memberAuth: 'real GoTrue-issued JWT validated by PostgREST and native Next/SSR routes',
    schema: 'candidate in owned tmpfs only', targetInstall: 'NOT_APPLIED', browser: 'PASS', browserReceipt: browser,
    acceptance: 'assembled-member-admin-v1', arashAcceptance: 'UNOBSERVED', privateArtifactsUploaded: false };
  const observed = checks.map(name => ({ name, status: 'PASS' }));
  Object.assign(observed.find(x => x.name === 'isolation-attested'), { sha: candidate, runId, database: 'owned tmpfs', appNoEgressClaim: false, images: clone(sealed.images) });
  Object.assign(observed.find(x => x.name === 'assembled-financial-receipts-and-null-readback'), { actualApiPosts: 2, plannedUnknown: true });
  Object.assign(observed.find(x => x.name === 'assembled-consent-and-authorized-version-basis'), { consentPosts: 1, productServiceRight: 'NOT_CONNECTED' });
  Object.assign(observed.find(x => x.name === 'assembled-real-member-navigation-and-read-only-dom'), { domAutomaticPosts: 0 });
  return { native, observed, cleanup: { sha: candidate, runId, status: 'REMOVED_OWNED_RESOURCES', resources: 6 },
    browserCleanup: { status: 'REMOVED_OWNED_RESOURCES', processStopped: true, contextsClosed: true, ownedTempRemoved: true, ownerId: owner, processesObserved: 1 },
    independent: { runId, dockerContainers: 0, dockerNetworks: 0, browserTemps: 0, fallbackUsed: false, sqlFilesVerified: 18, financialPosts: 2, consentPosts: 1, replayedProductPosts: 0 } };
}
function serialize(value) {
  return [...value.observed.map(row => 'P03_ASSEMBLED_NATIVE_CHECK ' + JSON.stringify(row)),
    'P03_ASSEMBLED_NATIVE_CLEANUP ' + JSON.stringify(value.cleanup),
    'P03_TICKET_BROWSER_CLEANUP ' + JSON.stringify(value.browserCleanup),
    'P03_ASSEMBLED_NATIVE_AUTH ' + JSON.stringify(value.native)].join('\n');
}
const validate = value => validateCaptured(serialize(value), binding, sealed.validateAssembledDiagnosticReceipt, '/tmp', value.independent, sealed.images);

test('all fourteen checks and existing nine-check validator yield only the bounded public projection', () => {
  const safe = validate(synthetic());
  assert.equal(safe.status, 'PASS_BOUNDED_ASSEMBLED_NATIVE');
  assert.equal(safe.checks.length, 14); assert.equal(safe.browserChecks.length, 9);
  assert.equal(safe.fullAssembledAcceptance, 'NOT_ESTABLISHED');
  assert.equal(safe.arashAcceptance, 'UNOBSERVED');
  assert.ok(!JSON.stringify(safe).includes('/tmp/'));
});

test('arbitrary private evidence is never forwarded by the projection', () => {
  const value = synthetic();
  value.observed[0].privateHeader = 'SYNTHETIC_PRIVATE_NEVER_FORWARD';
  value.native.browserReceipt.privateData = 'SYNTHETIC_PRIVATE_NEVER_FORWARD';
  assert.ok(!JSON.stringify(validate(value)).includes('SYNTHETIC_PRIVATE'));
});

for (const [name, mutate] of [
  ['old source', v => { v.native.sha = '7b1f5c01c91812be9ee4aa82efb1d5ccdaff8ccc'; }],
  ['wrong allocation', v => { v.native.allocationId = owner; }],
  ['missing native check', v => { v.observed.pop(); }],
  ['duplicate check replacing another', v => { v.observed[1] = clone(v.observed[0]); }],
  ['unconfirmed check', v => { v.observed[0].status = 'NOT_RUN'; }],
  ['different Docker image', v => { v.observed[0].images.db = 'postgres:latest'; }],
  ['fake service authority', v => { v.observed.find(x => x.name === 'assembled-consent-and-authorized-version-basis').productServiceRight = 'ACTIVE'; }],
  ['automatic product post', v => { v.observed.find(x => x.name === 'assembled-real-member-navigation-and-read-only-dom').domAutomaticPosts = 1; }],
  ['old browser source', v => { v.native.browserReceipt.readerSha = '7b1f5c01c91812be9ee4aa82efb1d5ccdaff8ccc'; }],
  ['SDK browser identity unconfirmed', v => { v.native.browserReceipt.sameJwtVerified = false; }],
  ['private storage hit', v => { v.native.browserReceipt.privateStorageHits = 1; }],
  ['browser process not stopped', v => { v.browserCleanup.processStopped = false; }],
  ['browser cleanup belongs to another owner', v => { v.browserCleanup.ownerId = allocation; }],
  ['wrong resource count', v => { v.cleanup.resources = 5; }],
  ['retained Docker container', v => { v.independent.dockerContainers = 1; }],
  ['retained network', v => { v.independent.dockerNetworks = 1; }],
  ['fallback passed as normal acceptance', v => { v.independent.fallbackUsed = true; }],
  ['replayed product post', v => { v.independent.replayedProductPosts = 1; }],
  ['incomplete applied SQL', v => { v.independent.sqlFilesVerified = 17; }],
  ['extra raw receipt field', v => { v.native.authorization = 'synthetic'; }],
  ['full acceptance relabel', v => { v.native.fullAssembledAcceptance = 'ACCEPTED'; }],
  ['human acceptance relabel', v => { v.native.arashAcceptance = 'ACCEPTED'; }],
]) test('rejects ' + name, () => {
  const value = synthetic(); mutate(value); assert.throws(() => validate(value));
});

test('duplicate or malformed final receipts cannot be accepted', () => {
  const value = synthetic(); const log = serialize(value);
  assert.throws(() => validateCaptured(log + '\nP03_ASSEMBLED_NATIVE_AUTH ' + JSON.stringify(value.native), binding, sealed.validateAssembledDiagnosticReceipt, '/tmp', value.independent, sealed.images));
  assert.throws(() => validateCaptured(log + '\nP03_ASSEMBLED_NATIVE_AUTH {broken', binding, sealed.validateAssembledDiagnosticReceipt, '/tmp', value.independent, sealed.images));
});
