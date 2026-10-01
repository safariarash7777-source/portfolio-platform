import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nullContract, unitContract, verifyBaseline, digest, root, installOfflineGuards, assertEpsPreserved } from './run.mjs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import childProcess from 'node:child_process';

test('missing-value contract rejects zero and absent output', () => {
  assert.equal(nullContract({ normalized: { standalone: { gross_profit: 0 } }, ratios: { gross_margin: 0 } }), false);
  assert.equal(nullContract({}), false);
  assert.equal(nullContract({ normalized: { standalone: { gross_profit: null } }, ratios: { gross_margin: null } }), true);
});
test('unit conflict contract rejects unchanged million unit and calculated ratios', () => {
  assert.equal(unitContract({ normalized: { unit: 'میلیون ریال' }, ratios: { net_margin: 1 } }), false);
  assert.equal(unitContract({ normalized: { unit: null }, ratios: { net_margin: 1 } }), false);
  assert.equal(unitContract({ normalized: null, ratios: null }), true);
  assert.equal(unitContract({ normalized: null, ratios: { net_margin: 1 } }), false);
});
test('C4 full rejection retains input EPS; present output still must retain EPS', () => {
  const original = [[['سود (زیان) خالص هر سهم', '۷۷۳', '۶۰۰']]];
  const same = structuredClone(original);
  assert.doesNotThrow(() => assertEpsPreserved({ normalized: null, ratios: null }, same, original, 773));
  assert.doesNotThrow(() => assertEpsPreserved({ normalized: { standalone: { eps_rial: 773 } } }, same, original, 773));
  same[0][0][1] = '۷۷۴';
  assert.throws(() => assertEpsPreserved({ normalized: null }, same, original, 773), /byte-for-byte/);
  assert.throws(() => assertEpsPreserved({ normalized: { standalone: { eps_rial: 774 } } }, original, original, 773), /preserve EPS/);
  assert.throws(() => assertEpsPreserved({ normalized: null }, [], [], 773), /reference must contain/);
});
test('corrected C4 assertion retains the original product failures and input bytes', () => {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'docs/research/intelligence-loop', name), 'utf8'));
  const old = read('IE01-EVIDENCE.json');
  const current = read('IE01-C4-ASSERTION-EVIDENCE.json');
  const replay = read('IE01-C4-ASSERTION-REPLAY.json');
  assert.equal(current.deterministicPayloadDigest, replay.deterministicPayloadDigest);
  assert.deepEqual(current.cases.map(x => [x.caseId, x.status, x.inputDigest, x.outputDigest]), old.cases.map(x => [x.caseId, x.status, x.inputDigest, x.outputDigest]));
  assert.deepEqual(current.fixtures, old.fixtures);
  assert.deepEqual(current.originalArchive, old.originalArchive);
});
test('fixed-code identity rejects changed source bytes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/research/ie01/baseline.json'), 'utf8'));
  verifyBaseline(manifest);
  assert.throws(() => verifyBaseline(manifest, () => Buffer.from('changed')), /fixed source changed/);
});
test('two real executions have identical deterministic payloads and retained failures', () => {
  const a = JSON.parse(fs.readFileSync(path.join(root, 'docs/research/intelligence-loop/IE01-EVIDENCE.json'), 'utf8'));
  const b = JSON.parse(fs.readFileSync(path.join(root, 'docs/research/intelligence-loop/IE01-REPLAY.json'), 'utf8'));
  assert.equal(a.deterministicPayloadDigest, b.deterministicPayloadDigest);
  assert.deepEqual(a.cases.map(x => [x.caseId, x.status]), [
    ['IE01-C1-COMPLETE', 'PASS'], ['IE01-C2-MISSING', 'FAIL'],
    ['IE01-C3-CORRECTION', 'PASS'], ['IE01-C4-UNIT-MISMATCH', 'FAIL'],
  ]);
  assert.equal(a.summary.forbiddenAttempts, 0);
  for (const f of a.fixtures) assert.equal(digest(fs.readFileSync(path.join(root, f.path))), f.sha256);
});
test('offline guard stops network and child-process attempts before execution', () => {
  installOfflineGuards();
  for (const action of [() => globalThis.fetch('https://example.invalid'),
    () => http.get('http://example.invalid'), () => net.connect(1, 'example.invalid'),
    () => childProcess.spawn('not-executed')]) {
    assert.throws(action, /offline guard/);
  }
});
