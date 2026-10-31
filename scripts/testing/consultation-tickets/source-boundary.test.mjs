// Source/packaging invariants only; these do not establish DB or Auth behavior.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = file => readFileSync(resolve(root, file), 'utf8').replaceAll('\r\n', '\n');
const hash = text => createHash('sha256').update(text).digest('hex');
const source = JSON.parse(read('scripts/testing/consultation-tickets/contract-source.json'));
for (const file of source.files) test(`frozen 358 contract remains exact: ${file.path}`, () => {
  assert.equal(hash(read(file.path)), file.sha256);
});
test('default product DB provider is unconditionally disconnected; fixture grants are separate', () => {
  const sql = read('sql/consultation_ticket_requests.sql');
  const body = sql.match(/CREATE FUNCTION consultation_ticket_private\.permission\([^]*?AS \$\$([^]*?)\$\$;/)?.[1];
  assert.equal(body?.trim(), "SELECT jsonb_build_object('state','not_connected','runId',NULL);");
  assert.doesNotMatch(sql, /CREATE (?:TABLE|SCHEMA) consultation_ticket_fixture/);
  assert.doesNotMatch(sql.replaceAll(/--[^\n]*/g, ''), /\b(?:current_setting|set_config)\s*\(/i);
  assert.match(read('scripts/testing/consultation-tickets/owned-fixture.sql'), /REVOKE ALL ON ALL TABLES IN SCHEMA consultation_ticket_fixture/);
});
test('application modules never import the right fixture, unit values, or test bootstrap', () => {
  for (const file of ['lib/consultation/ticketStorageContracts.ts', 'lib/consultation/ticketStorageRequest.ts', 'lib/consultation/ticketStorageServer.ts', 'lib/consultation/ticketAttemptStorageContracts.ts', 'lib/consultation/ticketAttemptStorageRequest.ts', 'lib/consultation/ticketAttemptStorageServer.ts', 'app/api/consultation/ticket-attempts/route.ts', 'app/api/consultation/tickets/route.ts', 'components/consultation/TicketRequestPanel.tsx', 'components/consultation/TicketRequestWorkspace.tsx']) {
    assert.doesNotMatch(read(file), /(?:from\s*|import\s*\(|require\s*\()["'][^"']*(?:scripts\/testing|owned-fixture|unit-fixture)/);
    assert.doesNotMatch(read(file), /process\.env\.[A-Z_]*(?:TICKET|ENTITLEMENT|TEST_RIGHT)/);
  }
});
test('lookup endpoint and stream transport keep text out of correlation URLs', () => {
  const source = read('lib/consultation/ticketStorageRequest.ts');
  assert.match(source, /if \(options\.unresolvedPrior\) return uncertain\(\)/);
  assert.doesNotMatch(source, /query\.set\(["'](?:text|subject|intent|body|command)["']/);
});

test('release control is server-only and deployment stop names only the candidate branch', () => {
  for (const file of ['lib/consultation/ticketStorageContracts.ts', 'lib/consultation/ticketStorageRequest.ts', 'lib/consultation/ticketAttemptStorageRequest.ts', 'components/consultation/TicketRequestPanel.tsx', 'components/consultation/TicketRequestWorkspace.tsx']) {
    assert.doesNotMatch(read(file), /consultationWriteRelease|CONSULTATION_P03_WRITES_RELEASE/);
  }
  const config = JSON.parse(read('vercel.json'));
  assert.deepEqual(config.git.deploymentEnabled, { 'codex/p03-reader-release-20261031': false, 'codex/p03-feedback-reader-acceptance-20261031': false, 'codex/p01-p05-service-right-diagnostic-20261031': false });
  assert.equal(config.crons.length, 2);
});
test('shared source stays on frozen 360; package hashes include only the approved browser driver delta', () => {
  const expected = JSON.parse(read('scripts/testing/consultation-tickets/protected-source.json'));
  const consumer = expected.consumerDiagnosticException;
  assert.equal(consumer.baseCandidate, '303f4c016505e9fdb8f12236168961f48a10ca0f');
  const historical303 = { ...expected }; delete historical303.consumerDiagnosticException;
  assert.equal(hash(JSON.stringify(historical303, null, 2)+'\n'), 'b2f732a8dfc0a4ad79968dc145a9a453b14a265cffb8bcfb6b06b34551ab83ee', '303 historical manifest changed');
  const consumerHash = (path, baseline) => {
    const entry = path === 'components' ? consumer.componentsTree : consumer.files[path];
    if (!entry) return baseline;
    assert.equal(entry.oldBlob, baseline, 'consumer historical binding changed: '+path);
    return entry.newBlob;
  };
  const diagnostic = expected.diagnosticException;
  assert.equal(diagnostic.baseCandidate, '1bf8f86b7bcaaedcb8320e178b1589a33b88e306');
  assert.equal(diagnostic.helperCandidate, 'f353300d61a4738b7b6bc2fd2177f9cdc5955a4b');
  const historical = { ...historical303 }; delete historical.diagnosticException;
  assert.equal(hash(JSON.stringify(historical, null, 2)+'\n'), '2bbacbfa3ead0f0dc7867bfb75ecde61f85d844a23bd0f00a35661832226046e', 'historical manifest changed');
  const diagnosticHash = (path, baseline) => {
    const entry = path === 'lib' ? diagnostic.libTree : diagnostic.files[path];
    if (!entry) return consumerHash(path, baseline);
    assert.equal(entry.oldBlob, baseline, 'diagnostic historical binding changed: '+path);
    return consumerHash(path, entry.newBlob);
  };
  const feedback = expected.feedbackAcceptanceException;
  assert.equal(feedback.baseCandidate, '699ea1677c21c216be52869318cf0ac1c4525744');
  const feedbackHash = (path, baseline) => {
    const entry = feedback.files[path]; if (!entry) return baseline;
    assert.equal(entry.baselineBlob, baseline, 'feedback historical baseline changed: '+path);
    const prior = execFileSync('git', ['rev-parse', feedback.baseCandidate+':'+path], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(prior, entry.oldBlob, 'feedback previous source changed: '+path); return entry.newBlob;
  };
  const release = expected.readerReleaseException;
  assert.equal(release.baseCandidate, '23f9b93a6f40b201b66301bed5464b643d011a03');
  const releaseHash = (path, baseline) => {
    const entry = release.files[path];
    if (!entry) return baseline;
    assert.equal(entry.baselineBlob, baseline, `historical baseline changed: ${path}`);
    const previous = execFileSync('git', ['rev-parse', `${release.baseCandidate}:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(entry.oldBlob, previous, `reader release old hash changed: ${path}`);
    return entry.newBlob;
  };
  const allocation = expected.durabilityException.files;
  const allocatedHash = (path, baseline) => {
    if (!allocation[path]) return baseline;
    assert.equal(allocation[path].oldBlob, baseline, `allocated old hash changed: ${path}`);
    return allocation[path].newBlob;
  };
  for (const [path, object] of Object.entries(expected.objects)) {
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, diagnosticHash(path, feedbackHash(path, releaseHash(path, allocatedHash(path, object)))), `shared object changed: ${path}`);
  }
  for (const [path, binding] of Object.entries(expected.consumerReauthException.files)) {
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, diagnosticHash(path, feedbackHash(path, releaseHash(path, allocatedHash(path, binding.newBlob)))), `consumer identity fix changed beyond its reviewed binding: ${path}`);
  }
  for (const [path, binding] of Object.entries(allocation)) {
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, diagnosticHash(path, feedbackHash(path, releaseHash(path, binding.newBlob))), `reserved durability object changed: ${path}`);
  }
  for (const [path, binding] of Object.entries(expected.unchangedFrom163)) {
    assert.equal(allocation[path], undefined, `frozen source cannot be allocated: ${path}`);
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, diagnosticHash(path, feedbackHash(path, releaseHash(path, binding))), `frozen 163 source changed: ${path}`);
  }
  for (const [path, entry] of Object.entries(release.files)) {
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, diagnosticHash(path, feedbackHash(path, entry.newBlob)), `reader release source changed: ${path}`);
    if (entry.oldBlob !== null) {
      const old = execFileSync('git', ['rev-parse', `${release.baseCandidate}:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
      assert.equal(old, entry.oldBlob, `reader release previous source changed: ${path}`);
    } else assert.throws(() => execFileSync('git', ['cat-file', '-e', `${release.baseCandidate}:${path}`], { cwd: root, stdio: 'pipe', windowsHide: true }));
  }
  for (const [path, entry] of Object.entries(feedback.files)) {
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD:'+path], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(), diagnosticHash(path, entry.newBlob), 'feedback candidate changed: '+path);
    if(entry.oldBlob!==null) assert.equal(execFileSync('git', ['rev-parse', feedback.baseCandidate+':'+path], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(), entry.oldBlob, 'feedback base changed: '+path);
    else assert.throws(()=>execFileSync('git',['cat-file','-e',feedback.baseCandidate+':'+path],{cwd:root,stdio:'pipe',windowsHide:true}));
  }
  for (const path of ['app','lib','components','public','middleware.ts','next.config.js','package.json','package-lock.json','sql','supabase']) {
    const current=execFileSync('git',['rev-parse','HEAD:'+path],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
    const prior=execFileSync('git',['rev-parse',feedback.baseCandidate+':'+path],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
    assert.equal(current,diagnosticHash(path,prior),'reader699 or immutable SQL changed: '+path);
  }

  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const helpers = {
    'lib/consultation/ticketServiceRightDiagnostic.ts': 'b6498e49effcb0bea49a9a3eed8a0abf79947663',
    'lib/consultation/ticketServiceRightDiagnostic.test.ts': '708d54554465fa67d4b383d7ac15a1d926e4631a',
  };
  assert.deepEqual(Object.keys(diagnostic.files).sort(), [...Object.keys(helpers), 'package.json', 'vercel.json', 'docs/ops/member-consultation-journey-20261031/DELIVERY.fa.md', 'scripts/testing/consultation-tickets/source-boundary.test.mjs'].sort());
  for (const [path, entry] of Object.entries(diagnostic.files)) {
    assert.equal(git(['rev-parse', 'HEAD:'+path]), consumerHash(path, entry.newBlob), 'diagnostic candidate changed: '+path);
    if (Object.hasOwn(helpers, path)) {
      assert.equal(entry.oldBlob, null); assert.equal(entry.newBlob, helpers[path]);
      assert.throws(() => execFileSync('git', ['cat-file', '-e', feedback.baseCandidate+':'+path], { cwd: root, stdio: 'pipe', windowsHide: true }));
    } else {
      const prior = feedback.files[path]?.newBlob ?? git(['rev-parse', feedback.baseCandidate+':'+path]);
      assert.equal(entry.oldBlob, prior, 'diagnostic previous source changed: '+path);
    }
  }
  // Compare every original lib blob/mode/path, not just an allowed tree label.
  // The existing shallow CI already fetches699; no new history/network is needed.
  const libRows = ref => git(['ls-tree', '-r', ref+':lib']).split('\n').sort();
  const currentLib = libRows('HEAD'), helperRows = Object.entries(helpers).map(([path, blob]) => '100644 blob '+blob+'\t'+path.slice(4));
  assert.deepEqual(currentLib, [...libRows(feedback.baseCandidate), ...helperRows].sort(), 'lib delta is not exactly the two frozen additions');
  assert.equal(diagnostic.libTree.oldBlob, git(['rev-parse', feedback.baseCandidate+':lib']));
  assert.equal(diagnostic.libTree.newBlob, 'db617582e6d7b477d24a8569c7dd382f4ee33e33');
  const helper = read('lib/consultation/ticketServiceRightDiagnostic.ts');
  assert.doesNotMatch(helper, /(?:from\s*|import\s*\(|require\s*\()["'][^"']*(?:scripts\/testing|owned-fixture|unit-fixture|supabase)/);
  assert.doesNotMatch(helper, /process\.env|\bfetch\s*\(|\brpc\s*\(/);

  const literal = 'lib/consultation/ticketServiceRightDiagnostic.test.ts';
  const packageBefore = execFileSync('git', ['show', feedback.baseCandidate+':package.json'], { cwd: root, encoding: 'utf8', windowsHide: true }).replaceAll('\r\n', '\n');
  const packageNow = read('package.json'), core = JSON.parse(packageNow).scripts['test:core'];
  assert.equal(packageNow.split(literal).length, 2);
  assert.ok(core.indexOf(literal) >= 0 && core.indexOf(literal) < core.indexOf(' && '));
  assert.equal(packageNow.replace(' '+literal, ''), packageBefore, 'existing package bytes/literals changed');
  const config = JSON.parse(read('vercel.json'));
  delete config.git.deploymentEnabled['codex/p01-p05-service-right-diagnostic-20261031'];
  delete config.git.deploymentEnabled['codex/p03-feedback-reader-acceptance-20261031'];
  assert.deepEqual(config, JSON.parse(git(['show', feedback.baseCandidate+':vercel.json'])), 'old crons/config changed');
  const delivery = 'docs/ops/member-consultation-journey-20261031/DELIVERY.fa.md';
  assert.ok(read(delivery).startsWith(execFileSync('git', ['show', feedback.baseCandidate+':'+delivery], { cwd: root, encoding: 'utf8', windowsHide: true }).replaceAll('\r\n', '\n')), 'historical delivery rewritten');
  const exactPaths = [...new Set([...Object.keys(feedback.files), 'scripts/testing/consultation-tickets/protected-source.json', ...Object.keys(diagnostic.files), ...Object.keys(consumer.files)])].sort();
  assert.deepEqual(git(['diff', '--name-only', feedback.baseCandidate, 'HEAD']).split('\n').sort(), exactPaths, 'unallocated repository source changed');
  const consumerPaths = ['components/consultation/TicketRequestWorkspace.tsx', 'components/consultation/TicketRequestPanel.tsx', 'components/consultation/ticket-storage-ui.test.tsx'];
  assert.deepEqual(Object.keys(consumer.files).sort(), [...consumerPaths, delivery, 'scripts/testing/consultation-tickets/source-boundary.test.mjs'].sort());
  const componentRows = ref => git(['ls-tree', '-r', ref+':components']).split('\n').sort();
  const originalComponents = componentRows(feedback.baseCandidate);
  const replacementComponents = originalComponents.map(row => {
    const path = 'components/'+row.split('\t')[1];
    if (!consumerPaths.includes(path)) return row;
    const entry = consumer.files[path];
    assert.equal(row, '100644 blob '+entry.oldBlob+'\t'+path.slice(11));
    return '100644 blob '+entry.newBlob+'\t'+path.slice(11);
  }).sort();
  assert.deepEqual(componentRows('HEAD'), replacementComponents, 'components delta is not exactly three reviewed replacements');
  assert.equal(consumer.componentsTree.oldBlob, git(['rev-parse', feedback.baseCandidate+':components']));
  assert.equal(consumer.componentsTree.newBlob, git(['rev-parse', 'HEAD:components']));
  for (const [path, entry] of Object.entries(consumer.files)) {
    assert.equal(git(['rev-parse', 'HEAD:'+path]), entry.newBlob, 'consumer candidate changed: '+path);
    if (consumerPaths.includes(path)) assert.equal(entry.oldBlob, git(['rev-parse', feedback.baseCandidate+':'+path]));
    else assert.equal(entry.oldBlob, diagnostic.files[path].newBlob);
  }

});

test('preparation candidate stores original text bytes and cannot dispatch the command kernel', () => {
  const sql = read('sql/consultation_ticket_prepared_intents.sql');
  assert.doesNotMatch(sql, /consultation_ticket_private\.execute\(/);
  assert.match(sql, /convert_to\(p_body,'UTF8'\)/);
  assert.match(sql, /VALUES\(actor,r\.id,[^]*?token,p_body,fingerprint/);
  const readFunction = sql.slice(sql.indexOf('CREATE FUNCTION consultation_ticket_private.prepared_load'));
  assert.doesNotMatch(readFunction, /\.capability\(/);
  assert.match(sql, /REVOKE ALL ON consultation_ticket_private\.prepared_intents FROM PUBLIC,anon,authenticated,service_role/);
});
