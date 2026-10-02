// Read-only public Preview bundle inspection. No Auth calls, cookies, credentials or DB access.
import fs from 'node:fs';
const origin = 'https://portfolio-platform-jhcvi11hp-safariarash7777-4463s-projects.vercel.app';
const out = process.argv[2];
const result = { checkedAt: new Date().toISOString(), origin,
  sha: '31c44ab635b672b589b7833bcbc78b41d36f1e75',
  deployment: 'dpl_9L7pQAVXx4JAb3uFLwnLGuXhqk7C',
  scope: 'Public login/JS only; no account or Auth API requests', assetsRead: 0,
  backendDestinations: [], loginStatus: null, csp: null, status: 'CHECKING' };
try {
  const r = await fetch(origin + '/login?next=%2Fdashboard', { signal: AbortSignal.timeout(20000) });
  result.loginStatus = r.status;
  result.csp = r.headers.get('content-security-policy');
  const html = await r.text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"<>]+\.js(?:\?[^"<>]*)?)"/g)].map(m => m[1]))]
    .map(x => new URL(x.replaceAll('&amp;', '&'), origin)).filter(x => x.origin === origin).slice(0, 14);
  const destinations = new Set();
  for (const url of assets) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) continue;
    const body = await response.text(); result.assetsRead++;
    for (const m of body.matchAll(/https?:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?(?:\/liara-preview)?/g)) {
      if (/\.supabase\.co|62\.60\.191\.24|liara-preview/.test(m[0])) destinations.add(m[0]);
    }
  }
  result.backendDestinations = [...destinations];
  result.status = r.ok ? 'PUBLIC_PREVIEW_INSPECTED_NOT_AUTH_ACCEPTANCE' : 'PREVIEW_NOT_PUBLICLY_ACCESSIBLE';
} catch (e) { result.status = 'BLOCKED_PUBLIC_READ'; result.errorType = e.name; }
result.finishedAt = new Date().toISOString();
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
