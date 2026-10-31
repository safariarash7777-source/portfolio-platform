// Offline browser boundary checks only. They do not launch Chrome or establish UI acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browserDestination, chromeFileCompatible, closureBudget, sdkCookies } from './browser.mjs';
import { browserRequestAllowed } from './native-auth-gateway.mjs';
import { origin, nativeAuthProfile } from './native-auth-runtime.mjs';
const id='00000000-0000-4000-8000-000000000001';
test('real consumer page queries accept only resource IDs and bounded internal RSC identity',()=>{
 for(const path of ['/dashboard/consultation/requests','/admin/consultation/requests']){
  assert.equal(browserRequestAllowed(origin+path+'?relation='+id+'&request='+id),true);
  assert.equal(browserRequestAllowed(origin+path+'?relation='+id+'&_rsc=abc_12'),true);
  for(const query of ['?token=private','?text=private','?request='+id,'?relation=bad','?relation='+id+'&relation='+id,'?_rsc=bad%20space'])assert.equal(browserRequestAllowed(origin+path+query),false);
 }
});
test('browser scope denies foreign URLs, route escapes, unrelated pages and page POSTs',()=>{
 for(const value of ['https://external.invalid/','http://localhost:32189.evil.invalid/dashboard/consultation/requests',origin+'/admin/research',origin+'/dashboard',origin+'/%252e%252e/admin/consultation/requests',origin+'/dashboard/%2e%2e/admin/consultation/requests',origin+'/admin/consultation/requests#private'])assert.equal(browserDestination(value),false);
 assert.equal(browserRequestAllowed(origin+'/admin/consultation/requests','POST'),false);
 assert.equal(browserDestination(origin+'/api/consultation/tickets','POST'),true);
});
test('static closure allows only current logo optimizer input and fixed assets',()=>{
 assert.equal(browserRequestAllowed(origin+'/_next/image?url=%2Fbrand%2Fmark.png&w=64&q=75'),true);
 for(const query of ['url=https%3A%2F%2Fevil.invalid%2Fa&w=64&q=75','url=%2Fprivate.png&w=64&q=75','url=%2Fbrand%2Fmark.png&w=64&q=75&extra=1'])assert.equal(browserRequestAllowed(origin+'/_next/image?'+query),false);
 assert.equal(browserRequestAllowed(origin+'/_next/static/chunks/app/(protected)/dashboard/page.js?v=123'),true);
 assert.equal(browserRequestAllowed(origin+'/fonts/Pelak-Bold.woff2'),true);
});
test('owned Chrome copy requires readonly executable identity and bounded closure capacity',()=>{
 assert.equal(chromeFileCompatible({isFile:true,elf:true,uid:42,runnerUid:42,mode:0o500}),true);
 assert.equal(chromeFileCompatible({isFile:true,elf:true,uid:0,runnerUid:42,mode:0o500}),false);
 assert.equal(chromeFileCompatible({isFile:true,elf:true,uid:42,runnerUid:42,mode:0o700}),false);
 assert.equal(closureBudget(100,1000,4*1024**3+1000),true);
 assert.equal(closureBudget(100,1000,4*1024**3),false);
 assert.equal(closureBudget(4097,1000,10*1024**3),false);
});
test('fresh cookie handoff is origin scoped; no persistent storage fixture is substituted',()=>{
 assert.deepEqual(sdkCookies('synthetic=opaque%3D'),[{name:'synthetic',value:'opaque%3D',url:origin,sameSite:'Lax'}]);
 assert.throws(()=>sdkCookies('invalid'));
 const source=readFileSync(new URL('./browser.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.fulfill\(|Fetch\.fulfillRequest|Response\.json\(|new Response\(/);
 assert.match(source,/state=await preflight\(\)/);
 assert.equal(nativeAuthProfile('consultation-ticket').browserPhases,4);
 assert.match(source,/fullContextDestroyedBeforeConfirmation:true/);
 assert.match(source,/unknown-preparation-destroy-no-command/);
});
