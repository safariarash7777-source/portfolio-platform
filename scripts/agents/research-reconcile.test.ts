import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { reconcileResearchState } from './research-reconcile';
const digest = (n: number) => n.toString(16).padStart(64, '0');
const id = '12345678-1234-1234-1234-123456789abc';
async function fixture(entries: Record<string, unknown>, run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'research-reconcile-test-'));
  try {
    await writeFile(join(root, 'state.json'), JSON.stringify({ version: 2, entries, attempts: [{ at: '2026-10-20T00:00:00Z' }] }));
    await writeFile(join(root, 'worker.lock'), '{"pid":99999999}');
    await writeFile(join(root, 'last-run.json'), '{"reason":"worker_lock_requires_review"}');
    const before = await Promise.all(['state.json', 'worker.lock', 'last-run.json'].map(name => readFile(join(root, name), 'utf8')));
    await run(root);
    assert.deepEqual(await Promise.all(['state.json', 'worker.lock', 'last-run.json'].map(name => readFile(join(root, name), 'utf8'))), before);
    assert.deepEqual((await readdir(root)).sort(), ['last-run.json', 'state.json', 'worker.lock']);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('historical pending digests find stored and absent outcomes without changing lock, attempts or receipts', async () => {
  await fixture({ [digest(1)]: { status: 'started' }, [digest(2)]: { status: 'ready', draft: { private: 'never output' } }, [digest(3)]: { status: 'stored' }, [digest(4)]: { status: 'failed' } }, async root => {
    const calls: unknown[] = [];
    const result = await reconcileResearchState(root, async request => { calls.push(request); return request.digest === digest(1) ? { id } : null; });
    assert.deepEqual(calls, [1, 2, 4].map(n => ({ action: 'find', digest: digest(n) })));
    assert.deepEqual(result.entries.map(e => e.destination), ['stored', 'absent', 'absent']);
    assert.equal(result.entries[0].id, id);
    assert.equal(result.recoveryRequired, true);
    assert.equal(JSON.stringify(result).includes('never output'), false);
  });
});

test('lost or malformed responses are unknown, stop subsequent probes and never imply absent', async () => {
  for (const response of [undefined, {}, { id: 'not-a-uuid' }, new Error('private transport message')]) {
    await fixture({ [digest(1)]: { status: 'started' }, [digest(2)]: { status: 'ready' } }, async root => {
      let calls = 0;
      const result = await reconcileResearchState(root, async () => { calls++; if (response instanceof Error) throw response; return response; });
      assert.equal(calls, 1);
      assert.deepEqual(result.entries.map(e => e.destination), ['unknown', 'unknown']);
      assert.equal(JSON.stringify(result).includes('private transport'), false);
    });
  }
});

test('invalid ledger and over-limit batch fail before any transport request', async () => {
  for (const entries of [{ wrong: { status: 'started' } }, { [digest(1)]: { status: 'bad' } }, Object.fromEntries(Array.from({ length: 25 }, (_, i) => [digest(i), { status: 'started' }]))]) {
    await fixture(entries, async root => {
      let calls = 0;
      await assert.rejects(reconcileResearchState(root, async () => { calls++; return null; }), /invalid_attempt_ledger|reconciliation_batch_limit/);
      assert.equal(calls, 0);
    });
  }
});

test('worker reconciliation bypasses stale lock and preserves last-run on missing SSH executable', async () => {
  await fixture({ [digest(1)]: { status: 'started' } }, async root => {
    try {
      await promisify(execFile)(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), resolve('scripts/agents/research-worker.ts'), '--reconcile'], {
        env: { ...process.env, PATH: root, PORTFOLIO_RESEARCH_HOME: root }, timeout: 10000,
      });
      assert.fail('unknown transport must return exit 1');
    } catch (error) {
      const failure = error as Error & { code: number; stdout: string };
      assert.equal(failure.code, 1);
      const result = JSON.parse(failure.stdout);
      assert.equal(result.mode, 'read_only_reconciliation');
      assert.equal(result.entries[0].destination, 'unknown');
    }
  });
});

test('worker malformed-ledger failure is also read-only', async () => {
  await fixture({ wrong: { status: 'started' } }, async root => {
    try {
      await promisify(execFile)(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), resolve('scripts/agents/research-worker.ts'), '--reconcile'], {
        env: { ...process.env, PATH: root, PORTFOLIO_RESEARCH_HOME: root }, timeout: 10000,
      });
      assert.fail('invalid ledger must fail');
    } catch (error) {
      const failure = error as Error & { code: number; stderr: string };
      assert.equal(failure.code, 1);
      assert.equal(JSON.parse(failure.stderr).reason, 'invalid_attempt_ledger');
    }
  });
});
