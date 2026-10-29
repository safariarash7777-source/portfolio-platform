/** Run with tsx scripts/testing/research-workbook-preview.ts, from repo root.
 * Loopback-only, synthetic memory store; no env files, DB, model or external HTTP.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createP07WorkflowFixture } from '../../lib/intelligence/p07-workflow-fixture';

async function main() {
  const root = process.cwd(), require = createRequire(import.meta.url);
  const fixture = createP07WorkflowFixture();
  let mode = 'normal';
  const requests: Array<{ method: string; action?: string; workbookId?: string; baseVersion?: number; version?: string | null }> = [];
  const bundle = await build({ entryPoints: [resolve(root, 'scripts/testing/research-workbook-preview.tsx')], bundle: true,
    write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'local-preview-link', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'preview' }));
      builder.onLoad({ filter: /.*/, namespace: 'preview' }, () => ({ contents: 'import React from "react"; export default function Link(props){return React.createElement("a",props)}', loader: 'js', resolveDir: root }));
    } }],
  });
  const config = require(resolve(root, 'tailwind.config.js'));
  const css = await postcss([tailwindcss({ ...config, content: [...config.content, './scripts/testing/research-workbook-preview.tsx'] })])
    .process(readFileSync(resolve(root, 'app/globals.css'), 'utf8'), { from: resolve(root, 'app/globals.css') });
  const html = '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>START-B local synthetic preview</title><link rel="stylesheet" href="/preview.css"><div id="root"></div><script src="/preview.js"></script></html>';
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost:32191');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (req.method === 'GET' && url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
      if (req.method === 'GET' && url.pathname === '/preview.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); return; }
      if (req.method === 'GET' && url.pathname === '/preview.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); return; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/_preview/receipt') {
        res.end(JSON.stringify({ environment: 'LOCAL_SYNTHETIC_MEMORY_ONLY', modelCalls: 0, requests, ...fixture.snapshot() }, null, 2)); return;
      }
      if (req.method === 'POST') {
        // Only the loopback preview origin can operate this disposable fixture.
        if (req.headers.origin !== 'http://localhost:32191') { res.writeHead(403).end('{}'); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 2_097_152) { res.writeHead(413).end('{}'); return; } chunks.push(chunk); }
        const body = Buffer.concat(chunks).toString('utf8');
        if (url.pathname === '/_preview/control') {
          const value = JSON.parse(body).mode;
          if (!['normal', 'lost', 'absent'].includes(value)) { res.writeHead(400).end('{}'); return; }
          mode = value; res.end('{}'); return;
        }
        if (url.pathname !== '/api/admin/intelligence/workbooks') { res.writeHead(404).end('{}'); return; }
        const command = JSON.parse(body);
        if (requests.length < 200) requests.push({ method: 'POST', action: command.action, workbookId: command.workbookId, baseVersion: command.baseVersion });
        const lose = command.action === 'save' ? mode : 'normal';
        if (lose !== 'normal') mode = 'normal';
        if (lose === 'absent') { res.destroy(); return; }
        const result = await fixture.transport(req.url!, { method: 'POST', body });
        if (lose === 'lost') { res.destroy(); return; }
        res.writeHead(result.status).end(JSON.stringify(result.body)); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/intelligence/workbooks') {
        if (requests.length < 200) requests.push({ method: 'GET', workbookId: url.searchParams.get('id') ?? undefined, version: url.searchParams.get('version') });
        const result = await fixture.transport(req.url!); res.writeHead(result.status).end(JSON.stringify(result.body)); return;
      }
      res.writeHead(404).end('{}');
    } catch { res.writeHead(500).end('{"error":"Synthetic preview request failed"}'); }
  });
  server.listen(32191, '127.0.0.1', () => console.log('START-B synthetic preview: http://localhost:32191 (memory only, no DB/model)'));
}
void main().catch(() => { console.error('Local synthetic preview could not start.'); process.exitCode = 1; });
