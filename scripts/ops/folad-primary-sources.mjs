import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TARGETS = Object.freeze([
  ['N10', 'https://excel.codal.ir/service/Excel/GetAll/yC2oQqrZ3w8Q8FsnnWQQBw%3d%3d/0'],
  ['N30', 'https://excel.codal.ir/service/Excel/GetAll/UF9BctCE5jV6HYNuyA8yYA%3d%3d/0'],
].map(Object.freeze));
const MAX_BYTES = 8 * 1024 * 1024;

export async function capture({ token, fetchImpl = fetch, outputDir = 'folad-primary-sources' } = {}) {
  await mkdir(outputDir, { recursive: true });
  const receipt = { schemaVersion: 1, purpose: 'primary-document-retrieval',
    limitation: 'Retrieved documents require separate financial and source validation.', documents: [] };
  for (const [reportKind, sourceUrl] of TARGETS) {
    const entry = { reportKind, sourceUrl, startedAt: new Date().toISOString(), httpStatus: null, status: 'unknown' };
    receipt.documents.push(entry);
    let body;
    try {
      if (!token) { entry.status = 'credential_missing'; continue; }
      const url = new URL('https://arsadata.liara.run/codal-raw');
      url.searchParams.set('url', sourceUrl);
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error',
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(210000) });
      entry.httpStatus = response.status;
      body = response.body;
      if (!response.ok) { entry.status = 'http_error'; continue; }
      if (!body) { entry.status = 'body_missing'; continue; }
      if (Number(response.headers.get('content-length')) > MAX_BYTES) { entry.status = 'body_limit'; continue; }
      const reader = body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BYTES) { entry.status = 'body_limit'; break; }
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (entry.status === 'body_limit') continue;
      if (!bytes) { entry.status = 'body_empty'; continue; }
      const data = Buffer.concat(chunks);
      const filename = `${reportKind}.html`;
      await writeFile(resolve(outputDir, filename), data, { flag: 'wx' });
      Object.assign(entry, { status: 'retrieved', filename, bytes,
        sha256: createHash('sha256').update(data).digest('hex') });
    } catch (error) {
      entry.status = error?.name === 'TimeoutError' ? 'timeout' : 'capture_failed';
    } finally {
      if (body && !body.locked) await body.cancel().catch(() => {});
      entry.completedAt = new Date().toISOString();
      await writeFile(resolve(outputDir, 'receipt.json'), JSON.stringify(receipt, null, 2));
    }
  }
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const receipt = await capture({ token: process.env.RELAY_TOKEN });
    console.log(JSON.stringify(receipt));
    if (receipt.documents.some(row => row.status !== 'retrieved')) process.exitCode = 1;
  } catch { console.error('primary_source_capture_failed'); process.exitCode = 1; }
}
