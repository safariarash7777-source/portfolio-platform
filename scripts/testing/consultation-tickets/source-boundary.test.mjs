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
  assert.deepEqual(config.git.deploymentEnabled, { 'codex/p03-reader-release-20261031': false, 'codex/p03-feedback-reader-acceptance-20261031': false });
  assert.equal(config.crons.length, 2);
});
test('shared source stays on frozen 360; package hashes include only the approved browser driver delta', () => {
  const expected = JSON.parse(read('scripts/testing/consultation-tickets/protected-source.json'));
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
    assert.equal(current, feedbackHash(path, releaseHash(path, allocatedHash(path, object))), `shared object changed: ${path}`);
  }
  for (const [path, binding] of Object.entries(expected.consumerReauthException.files)) {
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, feedbackHash(path, releaseHash(path, allocatedHash(path, binding.newBlob))), `consumer identity fix changed beyond its reviewed binding: ${path}`);
  }
  for (const [path, binding] of Object.entries(allocation)) {
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, feedbackHash(path, releaseHash(path, binding.newBlob)), `reserved durability object changed: ${path}`);
  }
  for (const [path, binding] of Object.entries(expected.unchangedFrom163)) {
    assert.equal(allocation[path], undefined, `frozen source cannot be allocated: ${path}`);
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, feedbackHash(path, releaseHash(path, binding)), `frozen 163 source changed: ${path}`);
  }
  for (const [path, entry] of Object.entries(release.files)) {
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, feedbackHash(path, entry.newBlob), `reader release source changed: ${path}`);
    if (entry.oldBlob !== null) {
      const old = execFileSync('git', ['rev-parse', `${release.baseCandidate}:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
      assert.equal(old, entry.oldBlob, `reader release previous source changed: ${path}`);
    } else assert.throws(() => execFileSync('git', ['cat-file', '-e', `${release.baseCandidate}:${path}`], { cwd: root, stdio: 'pipe', windowsHide: true }));
  }
  for (const [path, entry] of Object.entries(feedback.files)) {
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD:'+path], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(), entry.newBlob, 'feedback candidate changed: '+path);
    if(entry.oldBlob!==null) assert.equal(execFileSync('git', ['rev-parse', feedback.baseCandidate+':'+path], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(), entry.oldBlob, 'feedback base changed: '+path);
    else assert.throws(()=>execFileSync('git',['cat-file','-e',feedback.baseCandidate+':'+path],{cwd:root,stdio:'pipe',windowsHide:true}));
  }
  for (const path of ['app','lib','components','public','middleware.ts','next.config.js','package.json','package-lock.json','sql','supabase']) {
    const current=execFileSync('git',['rev-parse','HEAD:'+path],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
    const prior=execFileSync('git',['rev-parse',feedback.baseCandidate+':'+path],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
    assert.equal(current,prior,'reader699 or immutable SQL changed: '+path);
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
