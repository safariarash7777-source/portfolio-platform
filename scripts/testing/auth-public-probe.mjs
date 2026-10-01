import fs from 'node:fs/promises';
const site = 'https://portfolio-platform-fawn.vercel.app';
const origin = 'https://62.60.191.24/liara-preview';
const report = { at: new Date().toISOString(), site, origin, checks: [] };
let anonKey;
async function probe(label, url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    const body = await response.text();
    const check = { label, status: response.status, url: response.url, cors: response.headers.get('access-control-allow-origin'), serverDate: response.headers.get('date') };
    report.checks.push(check);
    return { response, body, check };
  } catch (error) { report.checks.push({ label, network: error.cause?.code ?? error.name }); return null; }
}
const login = await probe('production-login', site + '/login');
if (login) {
  report.cspAllowsLiara = (login.response.headers.get('content-security-policy') ?? '').includes('https://62.60.191.24');
  const scripts = [...login.body.matchAll(/<script[^>]+src="([^"]+)"/g)].map(x => x[1]);
  const bundleOrigins = new Set();
  let legacyPresent = false;
  for (const path of scripts) {
    let body;try {const response = await fetch(new URL(path, site),{signal:AbortSignal.timeout(10000)});body = await response.text();}catch{report.bundleReadIncomplete=true;continue;}
    for (const match of body.matchAll(/https:\/\/62\.60\.191\.24(?:\/[a-zA-Z0-9_-]+)?/g)) bundleOrigins.add(match[0]);
    legacyPresent ||= /https:\/\/[a-z]+\.supabase\.co/.test(body);
    for(const match of body.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g)) {
      try{const claims=JSON.parse(Buffer.from(match[0].split('.')[1],'base64url'));if(claims.role==='anon'&&claims.iss==='supabase')anonKey=match[0];}catch{}
    }
  }
  report.bundle = { scripts: scripts.length, origins: [...bundleOrigins], legacySupabaseOriginPresent: legacyPresent };
}
const health = await probe('auth-health', origin + '/auth/v1/health');
if (health) { try { report.authVersion = JSON.parse(health.body).version; } catch {} }
if(anonKey){const keyedHealth=await probe('auth-health-with-public-anon-key',origin+'/auth/v1/health',{headers:{apikey:anonKey}});if(keyedHealth){try{report.authVersion=JSON.parse(keyedHealth.body).version;}catch{}}}
await probe('auth-preflight-valid', origin + '/auth/v1/token?grant_type=password', {method:'OPTIONS',headers:{Origin:site,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'apikey,content-type'}});
await probe('auth-preflight-unrelated', origin + '/auth/v1/token?grant_type=password', {method:'OPTIONS',headers:{Origin:'https://unrelated.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'apikey,content-type'}});
await probe('anonymous-admin', site + '/admin');
await fs.mkdir('docs/ops/seasonal-program/followup-auth-evidence', {recursive:true});
await fs.writeFile('docs/ops/seasonal-program/followup-auth-evidence/public-probe.json', JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
