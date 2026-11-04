// Public receipt projection only. Full native logs stay in private runner temp.
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const candidate = '4dcf3713c3ad2507ed1a5bfee42a52b3c17cfb8a';
export const checks = Object.freeze([
  'isolation-attested', 'four-fresh-auth-users-and-sdk-getuser',
  'assembled-financial-receipts-and-null-readback', 'assembled-consent-and-authorized-version-basis',
  'immutable-source-default-closed', 'assembled-real-member-navigation-and-read-only-dom',
  'actual-sdk-same-jwt-own-versus-foreign-rls', 'expired-source-unverified-dom',
  'active-source-unverified-dom', 'revoked-source-unverified-dom',
  'advisor-other-client-zero-side-get', 'actual-sdk-identity-clear',
  'actual-sdk-signout-clear', 'private-storage-url-and-owned-cleanup',
]);
const fail = () => { throw Error('assembled_receipt_rejected'); };
const need = value => { if (!value) fail(); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, names) => need(record(value) && Object.keys(value).sort().join('\0') === [...names].sort().join('\0'));
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);

export function validateCaptured(log, binding, validateExistingBrowser, tempRoot, independent, expectedImages) {
  need(typeof log === 'string' && Buffer.byteLength(log) <= 64 * 1024 * 1024);
  need(record(binding) && uuid(binding.executionAllocationId));
  const rows = prefix => log.split('\n').filter(line => line.startsWith(prefix)).map(line => {
    need(line.length <= 65536); try { return JSON.parse(line.slice(prefix.length)); } catch { fail(); }
  });
  const native = rows('P03_ASSEMBLED_NATIVE_AUTH '), cleanup = rows('P03_ASSEMBLED_NATIVE_CLEANUP ');
  const observed = rows('P03_ASSEMBLED_NATIVE_CHECK '), browserCleanup = rows('P03_TICKET_BROWSER_CLEANUP ');
  need(native.length === 1 && cleanup.length === 1 && browserCleanup.length === 1 && observed.length === checks.length);
  const result = native[0], removed = cleanup[0];
  keys(result, ['sha', 'status', 'fullAssembledAcceptance', 'remaining', 'allocationId', 'scenarios', 'cleanup', 'memberAuth', 'schema', 'targetInstall', 'browser', 'browserReceipt', 'acceptance', 'readerSha', 'arashAcceptance', 'privateArtifactsUploaded']);
  need(result.sha === candidate && result.readerSha === candidate && result.status === 'PASS_BOUNDED_ASSEMBLED_NATIVE');
  need(result.fullAssembledAcceptance === 'NOT_ESTABLISHED' && result.scenarios === 14 && result.allocationId === binding.executionAllocationId);
  need(JSON.stringify(result.remaining) === JSON.stringify(['published-versioned-summary-in-this-composition', 'unknown-write-ui-recovery-in-this-composition']));
  need(result.cleanup === 'REMOVED_OWNED_RESOURCES' && result.browser === 'PASS' && result.acceptance === 'assembled-member-admin-v1');
  need(result.targetInstall === 'NOT_APPLIED' && result.arashAcceptance === 'UNOBSERVED' && result.privateArtifactsUploaded === false);
  need(result.memberAuth === 'real GoTrue-issued JWT validated by PostgREST and native Next/SSR routes' && result.schema === 'candidate in owned tmpfs only');
  keys(removed, ['sha', 'runId', 'status', 'resources']);
  need(removed.sha === candidate && removed.status === 'REMOVED_OWNED_RESOURCES' && removed.resources === 6);
  need(typeof removed.runId === 'string' && removed.runId.startsWith('assembled-member-admin-') && uuid(removed.runId.slice('assembled-member-admin-'.length)));
  const names = new Set();
  for (const item of observed) {
    need(record(item) && checks.includes(item.name) && item.status === 'PASS' && !names.has(item.name)); names.add(item.name);
  }
  const byName = name => observed.find(item => item.name === name);
  const isolation = byName('isolation-attested');
  need(isolation.runId === removed.runId && isolation.sha === candidate && isolation.database === 'owned tmpfs' && isolation.appNoEgressClaim === false);
  keys(isolation.images, ['db', 'auth', 'rest', 'node']);
  need(record(expectedImages) && Object.keys(isolation.images).every(role => isolation.images[role] === expectedImages[role]));
  need(byName('assembled-financial-receipts-and-null-readback').actualApiPosts === 2 && byName('assembled-financial-receipts-and-null-readback').plannedUnknown === true);
  need(byName('assembled-consent-and-authorized-version-basis').consentPosts === 1 && byName('assembled-consent-and-authorized-version-basis').productServiceRight === 'NOT_CONNECTED');
  need(byName('assembled-real-member-navigation-and-read-only-dom').domAutomaticPosts === 0);
  const browser = validateExistingBrowser(result.browserReceipt, tempRoot);
  need(browser.readerSha === candidate && browser.productServiceRight === 'NOT_CONNECTED' && browser.productWriteClosed === true);
  const bc = browserCleanup[0];
  keys(bc, ['status', 'processStopped', 'contextsClosed', 'ownedTempRemoved', 'ownerId', 'processesObserved']);
  need(bc.status === 'REMOVED_OWNED_RESOURCES' && bc.ownerId === browser.ownerId && bc.processStopped === true && bc.contextsClosed === true && bc.ownedTempRemoved === true);
  need(Number.isSafeInteger(bc.processesObserved) && bc.processesObserved >= 0);
  keys(independent, ['runId', 'dockerContainers', 'dockerNetworks', 'browserTemps', 'fallbackUsed', 'sqlFilesVerified', 'financialPosts', 'consentPosts', 'replayedProductPosts']);
  need(independent.runId === removed.runId && independent.dockerContainers === 0 && independent.dockerNetworks === 0 && independent.browserTemps === 0 && independent.fallbackUsed === false);
  need(independent.sqlFilesVerified === 18 && independent.financialPosts === 2 && independent.consentPosts === 1 && independent.replayedProductPosts === 0);
  // Do not forward arbitrary evidence strings, paths, headers, IDs or log text.
  return { status: 'PASS_BOUNDED_ASSEMBLED_NATIVE', checks: checks.map(name => ({ name, status: 'PASS' })),
    browserChecks: browser.checks.map(({ name }) => ({ name, status: 'PASS' })),
    cleanup: { ownedDockerResourcesRemoved: true, ownedBrowserRemoved: true, independentReadback: true, fallbackUsed: false },
    fixture: { financialPosts: 2, consentPosts: 1, replayedProductPosts: 0, sqlFilesVerified: 18 },
    fullAssembledAcceptance: 'NOT_ESTABLISHED', remaining: result.remaining,
    targetInstall: 'NOT_APPLIED', arashAcceptance: 'UNOBSERVED', privateArtifactsUploaded: false,
    appNoEgressClaim: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const runtime = await import(pathToFileURL(resolve(process.argv[2], 'scripts/testing/consultation-tickets/assembled-auth-runtime.mjs')));
    const safe = validateCaptured(input.log, input.binding, runtime.validateAssembledDiagnosticReceipt, input.tempRoot, input.independent, runtime.images);
    process.stdout.write(JSON.stringify(safe) + '\n');
  } catch { process.stderr.write('assembled_receipt_rejected\n'); process.exitCode = 1; }
}
