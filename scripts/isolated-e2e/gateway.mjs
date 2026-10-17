// Test-only transparent gateway. Real Auth, PostgREST and Next; no mock responses.
import http from 'node:http';
import { spawn } from 'node:child_process';
const origin = 'http://127.0.0.1:32188';
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,x-supabase-api-version');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let host = '127.0.0.1', port = 3000, path = req.url;
  if (path.startsWith('/auth/v1/')) { host = 'auth'; port = 9999; path = path.slice(8); }
  if (path.startsWith('/rest/v1/')) { host = 'rest'; port = 3000; path = path.slice(8); }
  const upstream = http.request({ hostname: host, port, path, method: req.method, headers: req.headers }, r => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(upstream);
});
server.listen(32188, '0.0.0.0');
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', '3000'], { stdio: 'inherit' });
next.on('exit', code => process.exit(code ?? 1));
