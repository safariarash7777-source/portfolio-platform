/** Loopback synthetic UI only: no database, auth, relay, source/provider or real company observations. */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = mkdtempSync(join(tmpdir(), 'company-reports-synthetic-'));
const rows = [
  { title: 'نمونهٔ نمایشی — صورت‌های مالی حسابرسی‌نشده شرکت آزمایشی با عنوان طولانی برای بررسی خوانایی در موبایل ۱۴۰۵', kind: 'ن-۱۰', date: '1405/04/31', time: '12:00:00', url: '/Reports/Decision.aspx?id=synthetic-original' },
  { title: 'نمونهٔ نمایشی — اصلاحیه صورت‌هاي مالي شركت آزمایشی ١٤٠٥', kind: 'ن-10', date: null, time: null, url: null },
  { title: 'نمونهٔ نمایشی — فعالیت ماهانه', kind: 'ن-۳۰', date: '1405/04/31', time: null, url: 'javascript:alert(1)' },
  { title: 'نمونهٔ نمایشی — ' + 'عنوان‌بسیارطولانی'.repeat(12), kind: null, date: null, time: null, url: null },
];
const source = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import CodalReportsTab from './components/symbol/CodalReportsTab';
function App(){const [symbol,setSymbol]=useState('آزمایشی الف');return <main className="mx-auto max-w-4xl space-y-4 p-4"><h1 className="text-xl font-bold">نمونهٔ نمایشی — کشف گزارش شرکت</h1><p>داده‌ها مصنوعی‌اند. این صفحه پذیرش دادهٔ واقعی یا انتشار نیست.</p><button className="min-h-11 rounded-md border border-border p-3" onClick={()=>setSymbol(symbol==='آزمایشی الف'?'آزمایشی ب':'آزمایشی الف')}>تغییر شرکت آزمایشی</button><p>نماد: {symbol}</p><CodalReportsTab symbol={symbol} stored={[]}/></main>}
createRoot(document.getElementById('root')).render(<App/>);`;
await build({ stdin: { contents: source, resolveDir: root, sourcefile: 'company-reports.tsx', loader: 'tsx' }, jsx: 'automatic', bundle: true, platform: 'browser', format: 'iife', outfile: join(output, 'app.js'), tsconfig: join(root, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"development"' } });
const css = spawnSync(process.execPath, [join(root, 'node_modules/tailwindcss/lib/cli.js'), '-i', join(root, 'app/globals.css'), '-o', join(output, 'app.css')], { cwd: root, encoding: 'utf8' });
if (css.status !== 0) throw Error(css.stderr);
const head = '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>نمونهٔ نمایشی گزارش شرکت</title><link rel="stylesheet" href="/app.css"><style>@font-face{font-family:Vazirmatn;src:url(/font.woff2)}body{font-family:Vazirmatn,Tahoma,sans-serif}</style><body>';
const app = head + '<div id="root"></div><script src="/app.js"></script></body></html>';
const files = { '/app.js': [join(output, 'app.js'), 'text/javascript; charset=utf-8'], '/app.css': [join(output, 'app.css'), 'text/css; charset=utf-8'], '/font.woff2': [join(root, 'public/fonts/Vazirmatn-Variable.woff2'), 'font/woff2'] };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  res.setHeader('Cache-Control', 'no-store');
  const file = files[url.pathname];
  if (file) { res.setHeader('Content-Type', file[1]); res.end(readFileSync(file[0])); }
  else if (url.pathname === '/api/codal-list') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: rows, source: 'synthetic', coverage: 'synthetic-loaded-subset' })); }
  else if (url.pathname === '/app') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(app); }
  else if (url.pathname === '/') {
    const width = ['320', '390', '1280'].includes(url.searchParams.get('width')) ? url.searchParams.get('width') : '390';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(head + `<p>نمونهٔ نمایشی — عرض ${width} پیکسل</p><iframe title="رابط آزمایشی شرکت" src="/app" style="display:block;width:${width}px;height:1500px;border:1px solid;margin:auto"></iframe></body></html>`);
  } else { res.statusCode = 404; res.end(); }
});
server.listen(4324, '127.0.0.1', () => console.log('Synthetic company reports only: http://127.0.0.1:4324/?width=320'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
