import fs from 'node:fs';
import {chromium} from 'file:///C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const privateFile='C:/Users/Asus/.codex/private/accept195-liara/reviewer.json';
const config=JSON.parse(fs.readFileSync(privateFile));const origin='https://62.60.191.24:8443';
if(config.origin!==origin)throw Error('Unexpected sandbox');
const folder='docs/ops/seasonal-program/integration-195-20261002/';
const report={applicationSHA:'31c44ab635b672b589b7833bcbc78b41d36f1e75',environment:'portfolio-accept195',origin,reviewer:'/root; independent of N10 and feed197 implementation',startedAt:new Date().toISOString(),scenarios:[],privacy:'Real UI login; no injected session, token/cookie persistence, HAR, or credential screenshots; normal TLS verification'};
const selectedRoles=process.argv.find(x=>x.startsWith('--roles='))?.slice(8).split(',');
const output=selectedRoles?'BROWSER-ADMIN-RECHECK.json':'BROWSER-ACCEPTANCE.json';
const save=()=>fs.writeFileSync(folder+output,JSON.stringify(report,null,2)+'\n');
function redact(e){let t=String(e.message||e);for(const v of [config.anon,...Object.values(config.accounts).flatMap(x=>[x.password,x.email])])t=t.split(v).join('[REDACTED]');return t.replace(/eyJ[\w.-]+/g,'[REDACTED]')}
function record(id,role,expected,observed,ok){report.scenarios.push({id,role,expected,observed,status:ok?'PASS':'FAIL',at:new Date().toISOString(),applicationSHA:report.applicationSHA,environment:report.environment});save();console.log(id+' '+(ok?'PASS':'FAIL'))}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-first-run']});
try{
 for(const role of selectedRoles??['A','B','adviser','admin']){
  const context=await browser.newContext({timezoneId:role==='B'?'America/Los_Angeles':'Asia/Tehran'});const page=await context.newPage();const errors=[];let external=0;
  page.on('pageerror',e=>errors.push(redact(e)));
  await context.route(url=>url.origin!==origin&&['http:','https:'].includes(url.protocol),route=>{external++;return route.abort()});
  try{
   const next=role==='admin'?'/admin/desk':'/dashboard';const a=config.accounts[role];
   const response=await page.goto(origin+'/login?next='+encodeURIComponent(next),{waitUntil:'domcontentloaded',timeout:45000});
   await page.locator('#login-email').waitFor({state:'visible',timeout:30000});
   const csp=response.headers()['content-security-policy'];
   record('login-page-'+role,role,'Normal TLS, meaningful login UI, sandbox origin in CSP',{http:response.status(),emailField:await page.locator('#login-email').count(),cspSandboxOrigin:csp?.includes(origin)},response.status()===200&&csp?.includes(origin)&&await page.locator('#login-email').isVisible());
   await page.locator('#login-email').fill(a.email);await page.locator('#login-password').fill(a.password);
   const pending=page.waitForResponse(r=>r.url().startsWith(origin+'/supabase/auth/v1/token')&&r.request().method()==='POST',{timeout:30000});
   await page.locator('button[type="submit"]').click();const tokenResponse=await pending;
   record('native-token-'+role,role,'Real UI/password login through native GoTrue returns200',{http:tokenResponse.status(),endpoint:'/supabase/auth/v1/token'},tokenResponse.status()===200);
   await page.waitForURL(url=>url.pathname===next,{timeout:45000,waitUntil:'domcontentloaded'});
   const cookies=(await context.cookies()).filter(x=>/^sb-.*-auth-token(?:\.\d+)?$/.test(x.name)).sort((a,b)=>a.name.localeCompare(b.name));
   let encoded=cookies.map(c=>c.value).join('');if(encoded.startsWith('base64-'))encoded=Buffer.from(encoded.slice(7),'base64url').toString();
   const session=JSON.parse(encoded);if(!session.access_token)throw Error('Real UI-issued cookie missing');
   const native=async path=>{const r=await fetch(origin+'/supabase/'+path,{headers:{apikey:config.anon,authorization:'Bearer '+session.access_token},signal:AbortSignal.timeout(20000)});return{http:r.status,body:await r.json()}};
   const user=await native('auth/v1/user');const profile=await native('rest/v1/profiles?select=id,role&id=eq.'+a.id);
   record('identity-role-'+role,role,'Canonical native UUID, protected return path and profile role',{userHTTP:user.http,userId:user.body.id,path:new URL(page.url()).pathname,profileHTTP:profile.http,profileRole:profile.body?.[0]?.role},user.http===200&&user.body.id===a.id&&profile.body?.[0]?.role===a.profileRole);
   await page.reload({waitUntil:'domcontentloaded',timeout:45000});
   await page.getByRole('heading',{name:role==='admin'?/امروز|میز/:/خانهٔ من/}).first().waitFor({state:'visible',timeout:30000});
   await page.waitForLoadState('networkidle',{timeout:30000});
   record('reload-'+role,role,'Protected page remains authenticated on server reload',{path:new URL(page.url()).pathname,pageErrors:errors},new URL(page.url()).pathname===next&&errors.length===0);
   // The refresh token was issued by the real UI login, read only in memory.
   // This proves the native refresh endpoint, not automatic SDK renewal timing.
   const renewed=await fetch(origin+'/supabase/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:config.anon,'content-type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token}),signal:AbortSignal.timeout(20000)});
   const renewedBody=await renewed.json();const renewedUser=renewedBody.user?.id;
   record('native-refresh-'+role,role,'Refresh real UI-issued session through native Auth',{http:renewed.status,userId:renewedUser,automaticSDKRenewal:'NOT_TESTED'},renewed.status===200&&renewedUser===a.id);
   // Current member home links to the personal portfolio; the logout button is there.
   if(role!=='admin'){
    await page.getByRole('link',{name:'ارزیابی ریسک و مدیریت سبد من'}).click();
    await page.waitForURL(url=>url.pathname==='/dashboard/portfolio',{timeout:45000});
   }
   const logout=page.getByRole('button',{name:/خروج/}).first();
   await logout.waitFor({state:'visible',timeout:30000});
   await page.waitForLoadState('networkidle',{timeout:30000});
   if(await logout.count()){
    const pendingLogout=page.waitForResponse(r=>r.url().includes('/supabase/auth/v1/logout')&&r.request().method()==='POST',{timeout:20000});await logout.click();const lr=await pendingLogout;
    await page.goto(origin+next,{waitUntil:'domcontentloaded',timeout:45000});
    record('logout-'+role,role,'UI logout and subsequent protected access redirect to login',{logoutHTTP:lr.status(),path:new URL(page.url()).pathname},lr.status()===204&&new URL(page.url()).pathname==='/login');
    await page.goto(origin+'/login?next='+encodeURIComponent(next),{waitUntil:'domcontentloaded',timeout:45000});await page.locator('#login-email').fill(a.email);await page.locator('#login-password').fill(a.password);const again=page.waitForResponse(r=>r.url().includes('/supabase/auth/v1/token')&&r.request().method()==='POST',{timeout:25000});await page.locator('button[type="submit"]').click();const r=await again;await page.waitForURL(url=>url.pathname===next,{timeout:45000});
    record('relogin-'+role,role,'Second real UI login restores protected page',{http:r.status(),path:new URL(page.url()).pathname},r.status()===200&&new URL(page.url()).pathname===next);
   }else record('logout-'+role,role,'Visible UI logout action',{visible:false},false);
   record('browser-isolation-'+role,role,'Only sandbox network targets, no hydration errors',{externalRequestsBlocked:external,pageErrors:errors,timezone:role==='B'?'America/Los_Angeles':'Asia/Tehran'},external===0&&errors.length===0);
  }catch(e){record('execution-'+role,role,'Complete actual browser login lifecycle',{error:redact(e),path:new URL(page.url()).pathname},false)}
  await context.close();
 }
}finally{await browser.close();report.finishedAt=new Date().toISOString();report.counts=Object.fromEntries(['PASS','FAIL','BLOCKED'].map(k=>[k,report.scenarios.filter(s=>s.status===k).length]));save();console.log(JSON.stringify({counts:report.counts}))}
