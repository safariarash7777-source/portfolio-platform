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
test('shared source stays on frozen 360; package hashes include only the approved browser driver delta', () => {
  const expected = JSON.parse(read('scripts/testing/consultation-tickets/protected-source.json'));
  const allocation = expected.durabilityException.files;
  const allocatedHash = (path, baseline) => {
    if (!allocation[path]) return baseline;
    assert.equal(allocation[path].oldBlob, baseline, `allocated old hash changed: ${path}`);
    return allocation[path].newBlob;
  };
  for (const [path, object] of Object.entries(expected.objects)) {
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, allocatedHash(path, object), `shared object changed: ${path}`);
  }
  for (const [path, binding] of Object.entries(expected.consumerReauthException.files)) {
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, allocatedHash(path, binding.newBlob), `consumer identity fix changed beyond its reviewed binding: ${path}`);
  }
  for (const [path, binding] of Object.entries(allocation)) {
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, binding.newBlob, `reserved durability object changed: ${path}`);
  }
  for (const [path, binding] of Object.entries(expected.unchangedFrom163)) {
    assert.equal(allocation[path], undefined, `frozen source cannot be allocated: ${path}`);
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, binding, `frozen 163 source changed: ${path}`);
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
