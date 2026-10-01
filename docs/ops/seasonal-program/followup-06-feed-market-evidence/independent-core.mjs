import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'file:///C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
export const dir=path.dirname(fileURLToPath(import.meta.url));
export const hash=b=>createHash('sha256').update(typeof b==='string'||Buffer.isBuffer(b)?b:JSON.stringify(b)).digest('hex');
export async function initialize(kind,{browserNeeded=true}={}){
 const requested=process.argv.find(x=>x.startsWith('--run-sha='))?.slice(10);
 if(!/^[a-f0-9]{40}$/.test(requested??''))throw Error('Preparation only: runtime requires explicit immutable --run-sha=40-character-SHA after root readiness');
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'app-manifest.json')));
 if(manifest.sha!==requested)throw Error('Declared immutable build does not match requested acceptance SHA');
 const origin=manifest.origin;
 if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw Error('Only the explicitly owned loopback environment is allowed');
 const repo=cp.execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim(),head=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const diff=cp.execFileSync('git',['diff','--name-only',requested,head,'--','app','components','lib','middleware.ts','package.json','package-lock.json','sql','supabase'],{encoding:'utf8'}).trim();
 if(diff)throw Error('Current application differs from built checkpoint; new build required');
 const privateDir='C:/Users/Asus/.codex/private/followup06-feed-market',credentials=JSON.parse(fs.readFileSync(privateDir+'/reviewer-credentials.json')),secrets=JSON.parse(fs.readFileSync(privateDir+'/secrets.json'));
 const fixture=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json')));
 const evidence={reviewer:'/root/limited_independent; did not author combined implementation',kind,sha:requested,environment:manifest.environment,origin,checkoutHead:head,applicationSourceDiffEmpty:true,startedAt:new Date().toISOString(),scenarios:[],privacy:'Fresh actual product UI/native Auth sessions only; no invented JWT/cookies, HAR, traces, signed URLs or secret values in reports.'};
 const file=path.join(dir,'independent-'+kind+'.json'),save=()=>fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');
 const record=(id,roles,expected,observed,ok,owner)=>{const row={id,roles,expected,observed,status:ok?'PASS':'FAIL',sha:requested,environment:manifest.environment,at:new Date().toISOString(),...(owner?{owner}:{})};evidence.scenarios.push(row);save();console.log(id+' '+row.status+' '+JSON.stringify(observed));};
 const faultFile=privateDir+'/fault.json',fault=mode=>fs.writeFileSync(faultFile,JSON.stringify(mode)+'\n');
 const sessions={};let browser;
 if(browserNeeded)browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-first-run']});
 const login=async(role,next='/dashboard')=>{
  if(!browser)throw Error('Browser not initialized');const context=await browser.newContext({timezoneId:role==='B'?'America/Los_Angeles':'Asia/Tehran'}),page=await context.newPage();sessions[role]={context,page};
  await context.route(url=>!['127.0.0.1','localhost'].includes(url.hostname),route=>route.abort());
  await page.goto(origin+'/login?next='+encodeURIComponent(next),{waitUntil:'domcontentloaded'});await page.locator('#login-email').fill(credentials[role].email);await page.locator('#login-password').fill(credentials[role].password);
  const pending=page.waitForResponse(r=>r.url().includes('/supabase/auth/v1/token')&&r.request().method()==='POST');await page.locator('button[type="submit"]').click();const tokenResponse=await pending;
  if(tokenResponse.status()!==200)throw Error('Actual native Auth did not issue a session');await page.waitForURL(url=>url.pathname===next.split('?')[0],{waitUntil:'domcontentloaded'});
  // Read the session that the real UI/SDK already saved. Never inject cookies,
  // fabricate a JWT, intercept native Auth, or persist its value in evidence.
  const cookies=(await context.cookies()).filter(x=>/^sb-.*-auth-token(?:\.\d+)?$/.test(x.name)).sort((a,b)=>a.name.localeCompare(b.name));
  let encoded=cookies.map(x=>x.value).join('');if(encoded.startsWith('base64-'))encoded=Buffer.from(encoded.slice(7),'base64url').toString('utf8');
  const issued=JSON.parse(encoded);sessions[role].token=issued.access_token;
  if(!sessions[role].token)throw Error('Real UI-issued SDK session unavailable for native RLS checks');
  const u=await native(role,'auth/v1/user');record('login-'+role,[role],'Real UI/native session200, canonical UUID and actual return path',{tokenHTTP:tokenResponse.status(),userHTTP:u.http,userId:u.body?.id,path:new URL(page.url()).pathname,capture:'Only HTTP status observed; real UI-issued SDK cookie read in memory, native Auth not intercepted'},u.http===200&&u.body?.id===credentials[role].id);return sessions[role];
 };
 const api=async(role,method,p,body)=>{const r=await sessions[role].context.request.fetch(origin+p,{method,timeout:30000,headers:{origin},...(body===undefined?{}:{data:body})});return {http:r.status(),body:await r.json().catch(()=>null)};};
 const native=async(role,p,body)=>{const r=await fetch(origin+'/supabase/'+p,{method:body===undefined?'GET':'POST',headers:{apikey:secrets.anon,authorization:'Bearer '+(sessions[role]?.token??secrets.anon),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {http:r.status,body:await r.json().catch(()=>null)};};
 const rest=(role,p,body)=>native(role,'rest/v1/'+p,body);
 const ledger=async role=>{const v=await rest(role,'member_holding_versions?select=*&user_id=eq.'+credentials[role].id+'&order=id');if(v.http!==200||!Array.isArray(v.body))throw Error('Canonical financial ledger inaccessible');const result=[{table:'member_holding_versions',rows:v.body.length,digest:hash(v.body)}];const ids=v.body.map(x=>x.id).join(',');for(const [table,key]of[['member_holding_positions','position_key'],['member_debt_positions','debt_key']]){const r=ids?await rest(role,table+'?select=*&version_id=in.('+ids+')&order=version_id,'+key):{http:200,body:[]};if(r.http!==200||!Array.isArray(r.body))throw Error('Canonical financial positions inaccessible');result.push({table,rows:r.body.length,digest:hash(r.body)});}return result;};
 const fail=e=>{let text=String(e.message);for(const secret of [secrets.anon,secrets.service,secrets.jwtSecret,...Object.values(credentials).flatMap(x=>[x.email,x.password])])if(secret)text=text.split(secret).join('[redacted]');evidence.executionError=text.replace(/eyJ[\w.-]+/g,'[redacted]');save();};
 const finish=async()=>{fault({});evidence.finishedAt=new Date().toISOString();evidence.counts=Object.fromEntries(['PASS','FAIL','BLOCKED'].map(k=>[k,evidence.scenarios.filter(x=>x.status===k).length]));save();if(browser)await browser.close();console.log(JSON.stringify({kind,sha:requested,counts:evidence.counts,executionError:evidence.executionError??null}));};
 return {manifest,origin,repo,privateDir,credentials,fixture,evidence,sessions,browser,login,api,native,rest,ledger,fault,record,save,fail,finish};
}
