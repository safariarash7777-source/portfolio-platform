import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { createHash } from 'node:crypto';
// Offline only: evaluate the actual sealed helper's pure observation block.
const roots = { parent: process.env.ASSEMBLED_STAGE_PARENT_ROOT, candidate: process.env.ASSEMBLED_STAGE_CANDIDATE_ROOT };
assert.ok(roots.parent && roots.candidate, 'sealed test fixtures required');
const relative = 'overlay/scripts/testing/consultation-tickets';
const read = (side, name) => readFileSync(resolve(roots[side], relative, name));
function fixture() {
  const source = read('candidate', 'assembled-member-scenario.mjs').toString();
  const block = source.split('// BEGIN fixed stage observation:')[1].split('// END fixed stage observation.')[0];
  const lines = [];
  const exposed = vm.runInNewContext(block.slice(block.indexOf('\n')).replaceAll('export ', '')
    + '\n({observedAwait, assembledStageNames})', { console: { log: value => lines.push(value) } });
  return { ...exposed, lines, records: () => lines.map(line => JSON.parse(line.slice('P03_ASSEMBLED_STAGE '.length))) };
}
test('each fixed stage calls the operation once and emits only stage/edge', async () => {
  const f = fixture(), secret = { url: 'https://private.invalid', session: 'SYNTHETIC_PRIVATE', amount: 123456 };
  for (const stage of f.assembledStageNames) {
    let calls = 0;
    assert.equal(await f.observedAwait(stage, async () => { calls++; return secret; }), secret);
    assert.equal(calls, 1);
  }
  assert.equal(new Set(f.assembledStageNames).size, 33);
  for (const row of f.records()) assert.deepEqual(Object.keys(row).sort(), ['edge', 'stage']);
  assert.equal(f.lines.length, 66);
  assert.ok(!f.lines.join('\n').includes('SYNTHETIC_PRIVATE'));
  assert.ok(!f.lines.join('\n').includes('https:'));
});
test('failure preserves the exact error and does not emit completion or retry', async () => {
  const f = fixture(), error = Object.assign(new Error('SYNTHETIC_PRIVATE'), { name: 'TimeoutError' });
  let calls = 0;
  await assert.rejects(f.observedAwait('rest-own', async () => { calls++; throw error; }), value => value === error);
  assert.equal(calls, 1);
  assert.deepEqual(f.records(), [{ stage: 'rest-own', edge: 'before' }]);
  assert.ok(!f.lines.join().includes('SYNTHETIC_PRIVATE'));
});
test('a pending operation is not reported as completed', async () => {
  const f = fixture(); let complete;
  const pending = f.observedAwait('legacy-document', () => new Promise(resolve => { complete = resolve; }));
  assert.deepEqual(f.records(), [{ stage: 'legacy-document', edge: 'before' }]);
  complete('done'); assert.equal(await pending, 'done');
  assert.deepEqual(f.records(), [{ stage: 'legacy-document', edge: 'before' }, { stage: 'legacy-document', edge: 'after' }]);
});
test('unknown or payload-shaped stage names stop before the operation and emit nothing', async () => {
  for (const stage of ['rest-unknown-private', 'https://private.invalid', { session: 'SYNTHETIC_PRIVATE' }]) {
    const f = fixture(); let called = false;
    await assert.rejects(f.observedAwait(stage, () => { called = true; }), /assembled_stage_invalid/);
    assert.equal(called, false); assert.deepEqual(f.lines, []);
  }
});
test('only two helpers change; all eight hash pins are exact and app/SQL contracts remain identical', () => {
  const parent = JSON.parse(read('parent', 'assembled-overlay.json'));
  const candidate = JSON.parse(read('candidate', 'assembled-overlay.json'));
  const changed = [];
  for (const pin of candidate.files) {
    const name = pin.path.split('/').at(-1), body = read('candidate', name);
    assert.equal(body.length, pin.bytes);
    assert.equal(createHash('sha256').update(body).digest('hex'), pin.sha256);
    if (!body.equals(read('parent', name))) changed.push(name);
  }
  assert.deepEqual(changed.sort(), ['assembled-member-scenario.mjs', 'assembled-native.mjs']);
  assert.equal(candidate.files.length, 8);
  assert.deepEqual({ ...candidate, files: [] }, { ...parent, files: [] });
  assert.ok(read('candidate', 'assembled-native-source.json').equals(read('parent', 'assembled-native-source.json')));
});
test('every instrumented call site uses a compiled literal rather than actor or request data', () => {
  const allowed = new Set(fixture().assembledStageNames), used = new Set();
  for (const name of ['assembled-native.mjs', 'assembled-member-scenario.mjs']) {
    const text = read('candidate', name).toString().replace(/\/\/ BEGIN fixed stage observation:[\s\S]*?\/\/ END fixed stage observation\./, '');
    const calls = [...text.matchAll(/\bobservedAwait\('([^']+)', /g)].map(match => match[1]);
    assert.equal(calls.length, [...text.matchAll(/\bobservedAwait\(/g)].length);
    for (const value of calls) { assert.ok(allowed.has(value)); used.add(value); }
  }
  assert.deepEqual([...used].sort(), [...allowed].sort());
});
