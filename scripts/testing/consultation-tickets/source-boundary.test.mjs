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
  for (const file of ['lib/consultation/ticketStorageContracts.ts', 'lib/consultation/ticketStorageRequest.ts', 'lib/consultation/ticketStorageServer.ts', 'app/api/consultation/tickets/route.ts']) {
    assert.doesNotMatch(read(file), /(?:from\s*|import\s*\(|require\s*\()["'][^"']*(?:scripts\/testing|owned-fixture|unit-fixture)/);
    assert.doesNotMatch(read(file), /process\.env\.[A-Z_]*(?:TICKET|ENTITLEMENT|TEST_RIGHT)/);
  }
});
test('lookup endpoint and stream transport keep text out of correlation URLs', () => {
  const source = read('lib/consultation/ticketStorageRequest.ts');
  assert.match(source, /if \(options\.unresolvedPrior\) return uncertain\(\)/);
  assert.doesNotMatch(source, /query\.set\(["'](?:text|subject|intent|body|command)["']/);
});
test('shared financial core, consent/workspace, chart and lock trees stay on frozen 360', () => {
  const expected = JSON.parse(read('scripts/testing/consultation-tickets/protected-source.json'));
  for (const [path, object] of Object.entries(expected.objects)) {
    const current = execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(current, object, `shared object changed: ${path}`);
  }
});
