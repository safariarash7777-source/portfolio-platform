import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { capture, TARGETS } from './folad-primary-sources.mjs';

async function fixture(t) {
  const outputDir = await mkdtemp(join(tmpdir(), 'folad-primary-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  return outputDir;
}

test('two fixed credential destinations, no redirects or outer retries, exact public bytes and hashes', async t => {
  const outputDir = await fixture(t);
  let calls = 0;
  const html = '<html>public financial source</html>';
  const receipt = await capture({ outputDir, token: 'secret-token', fetchImpl: async (url, options) => {
    assert.equal(url.origin + url.pathname, 'https://arsadata.liara.run/codal-raw');
    assert.equal(url.searchParams.get('url'), TARGETS[calls++][1]);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer secret-token');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(html);
  } });
  assert.equal(calls, 2);
  for (const row of receipt.documents) {
    assert.equal(row.status, 'retrieved');
    assert.equal(await readFile(join(outputDir, row.filename), 'utf8'), html);
    assert.equal(row.sha256, createHash('sha256').update(html).digest('hex'));
  }
  assert.equal(JSON.stringify(receipt).includes('secret-token'), false);
});

test('bounded streams and HTTP error bodies never become public artifacts', async t => {
  const outputDir = await fixture(t);
  let calls = 0;
  const receipt = await capture({ outputDir, token: 'secret', fetchImpl: async () => ++calls === 1
    ? new Response(new Uint8Array(8 * 1024 * 1024 + 1))
    : new Response('private error secret', { status: 502 }) });
  assert.equal(calls, 2);
  assert.deepEqual(receipt.documents.map(row => row.status), ['body_limit', 'http_error']);
  assert.deepEqual(await readdir(outputDir), ['receipt.json']);
  assert.doesNotMatch(await readFile(join(outputDir, 'receipt.json'), 'utf8'), /private|secret/);
});

test('missing credentials make no calls; transport errors are sanitized without retry', async t => {
  const outputDir = await fixture(t);
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('private secret url'); };
  const missing = await capture({ outputDir, fetchImpl });
  assert.equal(calls, 0);
  assert.ok(missing.documents.every(row => row.status === 'credential_missing'));
  const failed = await capture({ outputDir, fetchImpl, token: 'secret' });
  assert.equal(calls, 2);
  assert.ok(failed.documents.every(row => row.status === 'capture_failed'));
  assert.doesNotMatch(JSON.stringify(failed), /private|secret/);
});
