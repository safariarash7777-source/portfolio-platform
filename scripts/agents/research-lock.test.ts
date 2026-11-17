import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, writeFile, rename, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { withResearchLock } from './research-lock';

async function fixture(run: (path: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'research-lock-test-'));
  try { await run(join(root, 'worker.lock')); }
  finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
}
test('failed initial write closes and removes only the newly owned lock before any job', async () => {
  await fixture(async path => {
    let closed = false, called = false;
    await assert.rejects(withResearchLock(path, async () => { called = true; }, async target => {
      const handle = await open(target, 'wx');
      return { stat: () => handle.stat(), close: async () => { await handle.close(); closed = true; },
        writeFile: async () => { await handle.writeFile('{"pid":'); throw new Error('injected_write_failure'); } };
    }), /injected_write_failure/);
    assert.equal(closed, true); assert.equal(called, false);
    await assert.rejects(access(path), { code: 'ENOENT' });
    assert.equal(await withResearchLock(path, async () => {}), true);
  });
});
test('job failure releases the owned lock but retains the original error', async () => {
  await fixture(async path => {
    await assert.rejects(withResearchLock(path, async () => { throw new Error('job_failed'); }), /job_failed/);
    await assert.rejects(access(path), { code: 'ENOENT' });
  });
});
test('live, stale and malformed existing locks are never modified or acquired', async () => {
  for (const value of [JSON.stringify({ pid: process.pid }), '{"pid":2147483647}', '{', '{"pid":0}']) {
    await fixture(async path => {
      await writeFile(path, value); let called = false;
      const result = withResearchLock(path, async () => { called = true; });
      if (value === JSON.stringify({ pid: process.pid })) assert.equal(await result, false);
      else await assert.rejects(result, /worker_lock_requires_review/);
      assert.equal(called, false); assert.equal(await readFile(path, 'utf8'), value);
    });
  }
});
test('an externally replaced path is preserved when the original job ends', async () => {
  await fixture(async path => {
    await withResearchLock(path, async () => {
      await rename(path, path + '.original');
      await writeFile(path, '{"pid":2147483647}');
    });
    assert.equal(await readFile(path, 'utf8'), '{"pid":2147483647}');
    assert.equal(JSON.parse(await readFile(path + '.original', 'utf8')).pid, process.pid);
  });
});
