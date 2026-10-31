// Offline gates for the actual-run harness; never reported as Auth/RLS acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { legacySelectMatches, selectedLegacyFields, legacyAcceptanceMode } from './legacy-diagnostic-native.mjs';
import { legacyDiagnosticSha, legacyDiagnosticChecks, legacySqlPin, feedbackReaderSha, nativeBrowserMode, validateLegacyDiagnosticReceipt } from './native-auth-runtime.mjs';
import { browserDestination } from './browser.mjs';
const id='00000000-0000-4000-8000-000000000001',origin='http://localhost:32189';
test('explicit7b profile preserves699 and only permits the existing request pages',()=>{
 assert.equal(legacyDiagnosticSha,'7b1f5c01c91812be9ee4aa82efb1d5ccdaff8ccc');assert.equal(feedbackReaderSha,'699ea1677c21c216be52869318cf0ac1c4525744');
 assert.equal(legacyAcceptanceMode,'legacy-diagnostic-v1');assert.equal(nativeBrowserMode('consultation-ticket',{browserMode:true,acceptance:legacyAcceptanceMode}),true);
 assert.throws(()=>nativeBrowserMode('consultation-ticket',{browserMode:false,acceptance:legacyAcceptanceMode}));
 for(const path of ['/dashboard/consultation/requests','/admin/consultation/requests'])assert.equal(browserDestination(origin+path+'?relation='+id,'GET',legacyAcceptanceMode),true);
 for(const url of ['https://external.invalid',origin+'/dashboard',origin+'/admin/consultation',origin+'/dashboard/consultation/requests?token=private'])assert.equal(browserDestination(url,'GET',legacyAcceptanceMode),false);
});
test('private observed query requires exact fields, own identity, bounded range and the verified JWT',()=>{
 const u=origin+'/rest/v1/entitlements?'+new URLSearchParams({select:selectedLegacyFields,user_id:'eq.'+id,order:'id.asc',offset:'0',limit:'1000'}),h={authorization:'Bearer synthetic',prefer:'count=exact'};
 assert.equal(legacySelectMatches(u,h,id,'synthetic'),true);
 for(const changed of [u.replace('localhost','external.invalid'),u.replace('1000','1001'),u.replace('id.asc','id.desc'),u+'&extra=1',u.replace('offset=0','offset=1'),u.replace('select=id%2C','select=note%2C')])assert.equal(legacySelectMatches(changed,h,id,'synthetic'),false);
 assert.equal(legacySelectMatches(u,{...h,authorization:'Bearer other'},id,'synthetic'),false);assert.equal(legacySelectMatches(u,{...h,prefer:undefined},id,'synthetic'),false);
 assert.equal(legacySelectMatches(u,h,id.replace(/1$/,'2'),'synthetic'),false);
});
test('phase11 is the immutable existing Git SQL, and no product/service fixture is enabled',()=>{
 const raw=execFileSync('git',['show','HEAD:'+legacySqlPin.file],{windowsHide:true});assert.equal(raw.length,legacySqlPin.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),legacySqlPin.sha256);
 const source=readFileSync(new URL('./legacy-diagnostic-native.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.fulfill\(|Fetch\.fulfillRequest|new Response\(|ctx\.apply\(|setWriteRelease\(|consultation_ticket_fixture|GRANT (?:INSERT|UPDATE|ALL)/);
 assert.match(source,/GRANT SELECT ON public\.entitlements TO authenticated/);assert.match(source,/strict_grant_denial/);
 assert.match(source,/REVOKE ALL ON public\.entitlements FROM PUBLIC,anon,authenticated,service_role/);
 assert.ok(source.indexOf('const inheritedAcl=')<source.indexOf("sql('REVOKE ALL ON public.entitlements"));
 assert.ok(source.indexOf("sql('REVOKE ALL ON public.entitlements")<source.indexOf("'strict_grant_baseline'"));
 assert.match(source,/from '@supabase\/ssr'/);assert.match(source,/auth\.setSession/);assert.match(source,/auth\.signOut/);
});
function receipt(){return {status:'PASS',readerSha:legacyDiagnosticSha,driverVersion:'1.64.1',sourceExecutable:'/opt/google/chrome/chrome',sourceSha256:'95dc9473b4f904cb3ab0800fc7206081fcae12abc094a088bd741a13f1747b72',chromeSha256:'95dc9473b4f904cb3ab0800fc7206081fcae12abc094a088bd741a13f1747b72',chromeVersion:'Google Chrome 156.0.8078.47',ownerId:id,ownedTemp:'/tmp/owned/p09b-AbC123',executable:'/tmp/owned/p09b-AbC123/chrome/chrome',closure:{sourceStable:true,copyMatched:true,runtimeReadonly:true,sha256:'a'.repeat(64),entries:1,bytes:42,freeBeforeBytes:42+4*1024**3},checks:legacyDiagnosticChecks.map(name=>({name,status:'PASS'})),sameJwtVerified:true,ownForeignRlsVerified:true,expiredDomVerified:true,activeDomVerified:true,revokedDomVerified:true,advisorZeroSideGetVerified:true,identityCleared:true,signoutCleared:true,readOnlyGrantOnly:true,productWriteClosed:true,domAutomaticPosts:0,privateStorageHits:0,privateUrlHits:0,productServiceRight:'NOT_CONNECTED',cleanup:{processStopped:true,contextsClosed:true,ownedTempRemoved:true,ownerId:id}};}
test('new receipt requires every actual legacy evidence and cleanup, strips unrelated private fields',()=>{
 const good=receipt();good.privateToken='never-export';good.closure.privateToken='never-export';const parsed=validateLegacyDiagnosticReceipt(good,'/tmp/owned');assert.equal(JSON.stringify(parsed).includes('never-export'),false);
 for(const mutate of [x=>{x.readerSha=feedbackReaderSha;},x=>{x.checks.pop();},x=>{x.checks[0]=x.checks[1];},...['sameJwtVerified','ownForeignRlsVerified','expiredDomVerified','activeDomVerified','revokedDomVerified','advisorZeroSideGetVerified','identityCleared','signoutCleared','readOnlyGrantOnly','productWriteClosed'].map(key=>x=>{x[key]=false;}),x=>{x.privateStorageHits=1;},x=>{x.privateUrlHits=1;},x=>{x.domAutomaticPosts=1;},x=>{x.cleanup.ownedTempRemoved=false;},x=>{x.productServiceRight='ACTIVE';},x=>{x.ownedTemp='/tmp/foreign/p09b-AbC123';}]){const value=receipt();mutate(value);assert.throws(()=>validateLegacyDiagnosticReceipt(value,'/tmp/owned'));}
});
