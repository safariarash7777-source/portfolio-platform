import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {resourceHandlers} from './seasonal-resource-handler.mjs';
const fixturePath='../portfolio-followup06-integration/docs/ops/seasonal-program/followup-06-auth-storage-evidence/fixtures.json';
const fixture=JSON.parse(fs.readFileSync(fixturePath));
const privateDir='C:/Users/Asus/.codex/private/followup06-auth-storage/';
const accounts=JSON.parse(fs.readFileSync(privateDir+'reviewer-credentials.json'));
const settings=JSON.parse(fs.readFileSync(privateDir+'secrets.json'));
if(settings.origin!=='http://127.0.0.1:3299'||fixture.sha!=='2605a0ff11ff5cb0f83837528aed230846469b16')throw Error('Refuse non-synthetic or changed upstream environment');
const backend=settings.origin+'/supabase';
const evidence={at:new Date().toISOString(),environment:'readonly existing followup06 synthetic native services; own HTTP route harness',upstreamSha:fixture.sha,routeCode:true,session:'actual SDK password login; no browser/cookie-adapter claim',databaseChanges:false,providerChanges:false,serviceRoleUsed:false,checks:[]};
const record=(label,details)=>{evidence.checks.push({label,status:'PASS',...details});console.log(label+' PASS');};
let currentDb;
const server=createServer(async(req,res)=>{try{const handlers=resourceHandlers(currentDb),label=req.url.includes('/B/')?'B':req.url.includes('/cancel/')?'cancel':'A';const result=await(req.url.endsWith('/list')?handlers.list:handlers.download)(new Request('http://localhost'+req.url),{params:Promise.resolve({id:fixture.cohorts[label],resourceId:fixture.resources[label].id})});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());}catch{res.writeHead(503);res.end('{}');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const site='http://127.0.0.1:'+server.address().port;
const read=async path=>{const r=await fetch(site+path);const text=await r.text();return {http:r.status,body:JSON.parse(text),text};};
const signedIn=[];
try{
 currentDb=createClient(backend,settings.anon,{auth:{persistSession:false,autoRefreshToken:false}});
 for(const path of ['/A/list','/A/download'])assert.equal((await read(path)).http,401);record('Guest real SDK session missing -> HTTP401; no private data',{http:401});
 for(const role of ['A','B','expired','cancelled','nonmember','admin']){
  const client=createClient(backend,settings.anon,{auth:{persistSession:false,autoRefreshToken:false}});const account=accounts[role];const login=await client.auth.signInWithPassword({email:account.email,password:account.password});assert.equal(login.error,null);assert.equal((await client.auth.getUser()).data.user.id,account.id);signedIn.push(client);currentDb=client;
  const label=role==='B'?'B':role==='cancelled'?'cancel':'A',allowed=role==='B';const l=await read('/'+label+'/list'),d=await read('/'+label+'/download');assert.equal(l.http,200);assert.equal(l.body.data.length,allowed?1:0);assert.equal(d.http,allowed?200:403);assert.doesNotMatch(l.text,/storage_path|storage_bucket|signedUrl|\/object\//);if(!allowed)assert.doesNotMatch(d.text,/https:|signedUrl|storage_path/);
  if(allowed){assert.equal(d.body.data.expiresInSeconds,60);const bytes=Buffer.from(await(await fetch(d.body.data.url)).arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),fixture.resources[label].sha256);const foreign=await read('/A/download');assert.equal(foreign.http,403);}
  if(role==='admin'){for(const other of ['A','B']){assert.equal((await read('/'+other+'/list')).body.data.length,0);assert.equal((await read('/'+other+'/download')).http,403);}const native=await client.storage.from('course-private').download(fixture.resources.A.storagePath);assert.ok(native.error);}
  record(role+' real Auth/REST/module/Storage scope',{listHTTP:l.http,listRows:l.body.data.length,downloadHTTP:d.http,exactFileVerified:allowed});
 }
 const active=signedIn[1],session=(await active.auth.getSession()).data.session;
 for(const target of ['auth','storage']){
  let faultEnabled=false;
  const fault=createClient(backend,settings.anon,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{if(faultEnabled&&String(input).includes('/'+target+'/v1/'))return fetch('http://127.0.0.1:65530/unavailable',{...init,signal:AbortSignal.timeout(1000)});return fetch(input,init);}}});assert.equal((await fault.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})).error,null);faultEnabled=true;currentDb=fault;
  assert.equal((await read('/B/download')).http,503);record('Actual SDK '+target+' transport failure -> HTTP503 without raw error',{http:503,syntheticFaultOnly:true});
 }
}catch(error){evidence.failure={type:error.name};process.exitCode=1;console.log('Resource acceptance FAIL; credentials/errors suppressed');}
finally{await new Promise(r=>server.close(r));for(const client of signedIn)await client.auth.signOut({scope:'local'});fs.mkdirSync('docs/ops/seasonal-program/resource-contract-evidence',{recursive:true});fs.writeFileSync('docs/ops/seasonal-program/resource-contract-evidence/real-sdk.json',JSON.stringify(evidence,null,2));}
