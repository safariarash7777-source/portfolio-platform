// Loopback-only synthetic REST adapter for public UI verification. Never imported by the app.
import http from 'node:http';
const counts = { requests: 0, inserts: 0 };
http.createServer(async (req, res) => {
  counts.requests++;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:8765');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  if (req.url === '/health') return res.end(JSON.stringify({ fixture: true, ...counts }));
  if (req.method === 'POST' && req.url.startsWith('/rest/v1/waitlist')) {
    let body = ''; for await (const chunk of req) body += chunk;
    const email = JSON.parse(body)[0]?.email;
    counts.inserts++;
    if (email === 'duplicate@example.test') { res.statusCode = 409; return res.end(JSON.stringify({ code: '23505' })); }
    if (email === 'failure@example.test') { res.statusCode = 500; return res.end(JSON.stringify({ code: 'fixture_failure' })); }
    res.statusCode = 201; return res.end('[]');
  }
  if (req.url.startsWith('/rest/v1/')) { res.setHeader('Content-Range', '*/0'); return res.end('[]'); }
  if (req.url.startsWith('/auth/v1/')) { res.statusCode = 401; return res.end(JSON.stringify({ message: 'Synthetic anonymous session' })); }
  res.statusCode = 404; res.end(JSON.stringify({ fixture: true }));
}).listen(8766, '127.0.0.1', () => process.stdout.write('Synthetic loopback REST fixture: 8766\n'));
