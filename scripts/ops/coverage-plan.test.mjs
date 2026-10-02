import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { run } from './coverage-plan.mjs';

test('actual CLI plan/simulate/resume are offline and require persisted shared ledger', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'followup04-coverage-'));
  const dir = path.resolve('docs/ops/seasonal-program/followup04/inputs');
  const out = path.join(temp, 'first'), replay = path.join(temp, 'replay');
  let attempts = 0;
  const oldFetch = globalThis.fetch, oldConnect = net.Socket.prototype.connect;
  const deny = () => { attempts++; throw new Error('network forbidden'); };
  globalThis.fetch = deny; net.Socket.prototype.connect = deny;
  try {
    const args = ['--input', path.join(dir, 'synthetic-metadata.json'), '--out', out, '--simulate', path.join(dir, 'synthetic-responses.json')];
    const first = await run(args); assert.equal(first.simulatedRequests, 2);
    await assert.rejects(() => run(['--live', 'true']), /no live mode/);
    await assert.rejects(() => run([...args, '--checkpoint', path.join(out, 'checkpoint.json')]), /persisted ledger/);
    const second = await run(['--input', path.join(dir, 'synthetic-metadata.json'), '--out', replay, '--simulate', path.join(dir, 'synthetic-responses.json'), '--checkpoint', path.join(out, 'checkpoint.json'), '--ledger', path.join(out, 'simulated-shared-ledger.json')]);
    assert.equal(second.simulatedRequests, 0);
    const a = JSON.parse(fs.readFileSync(path.join(out, 'checkpoint.json'), 'utf8'));
    const b = JSON.parse(fs.readFileSync(path.join(replay, 'checkpoint.json'), 'utf8'));
    assert.deepEqual(a, b); assert.equal(a.simulatedRows.length, 2); assert.equal(attempts, 0);
  } finally {
    globalThis.fetch = oldFetch; net.Socket.prototype.connect = oldConnect;
    const resolved = fs.realpathSync(temp);
    if (resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('followup04-coverage-')) fs.rmSync(resolved, { recursive: true });
  }
});
