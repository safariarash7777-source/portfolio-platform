// Offline source/guard tests only. Import must not provision or launch Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { nativeBrowserMode, allowedProfileURL, feedbackReaderSha, feedbackReaderChecks, feedbackSqlPins, validateFeedbackReaderReceipt } from './native-auth-runtime.mjs';
import { browserRequestAllowed } from './native-auth-gateway.mjs';
import { browserDestination, preflight, cleanup, storageAudit } from './browser.mjs';
import { feedbackAcceptanceMode, originalFeedbackRows, requireOriginalFeedbackRows } from './feedback-reader-native.mjs';
const id='00000000-0000-4000-8000-000000000001',origin='http://localhost:32189';
test('candidate imports existing helpers without invoking the legacy browser suite',()=>{
 assert.equal(typeof preflight,'function');assert.equal(typeof cleanup,'function');assert.equal(typeof storageAudit,'function');
 assert.equal(feedbackAcceptanceMode,'feedback-reader-v1');
});
test('feedback mode is exact and requires the owned browser profile; roles and unknown options do not open it',()=>{
 assert.equal(nativeBrowserMode('consultation-ticket',{browserMode:true,acceptance:'feedback-reader-v1'}),true);
 for(const options of [{browserMode:false,acceptance:'feedback-reader-v1'},{browserMode:true,acceptance:'full'},{browserMode:true,acceptance:'feedback-reader-v1',role:'admin'},{acceptance:'feedback-reader-v1'}])assert.throws(()=>nativeBrowserMode('consultation-ticket',options));
 assert.equal(nativeBrowserMode('consultation-ticket'),false);assert.equal(nativeBrowserMode('consultation-ticket',{browserMode:true}),true);
});
test('feedback browser scope contains only two existing GET pages and bounded relation/RSC selectors',()=>{
 for(const path of ['/dashboard/consultation','/admin/consultation']){
  const url=origin+path+'?relation='+id+'&_rsc=abc_12';assert.equal(browserRequestAllowed(url,'GET','feedback-reader-v1'),true);assert.equal(browserDestination(url,'GET','feedback-reader-v1'),true);
  assert.equal(browserRequestAllowed(url,'GET'),false);assert.equal(browserRequestAllowed(url,'POST','feedback-reader-v1'),false);
  for(const suffix of ['?request='+id,'?relation='+id+'&text=private','?relation='+id+'&relation='+id,'?relation=bad','?token=private'])assert.equal(browserRequestAllowed(origin+path+suffix,'GET','feedback-reader-v1'),false);
 }
});
test('feedback mode keeps foreign URL, encoded traversal, unrelated page and unknown mode denied',()=>{
 for(const url of ['https://external.invalid/admin/consultation',origin+'/dashboard/consultation/requests',origin+'/admin/users',origin+'/%252e%252e/admin/consultation',origin+'/admin/%2e%2e/consultation',origin+'/admin/consultation#private'])assert.equal(browserDestination(url,'GET','feedback-reader-v1'),false);
 assert.throws(()=>allowedProfileURL('consultation-ticket',origin+'/admin/consultation',false,'GET','feedback-reader-v1'));
 assert.equal(browserRequestAllowed(origin+'/admin/consultation','GET','admin'),false);
});
test('immutable SQL source pins and dependency order are exact Git bytes, not normalized working files',()=>{
 assert.deepEqual(feedbackSqlPins.map(x=>x.file),['supabase/migrations/20261029142010_consultation_feedback_states.sql','supabase/migrations/20261029160723_consultation_feedback_rollout_guard.sql']);
 for(const pin of feedbackSqlPins){const raw=execFileSync('git',['show','HEAD:'+pin.file],{cwd:process.cwd(),windowsHide:true});assert.equal(raw.length,pin.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),pin.sha256);}
 assert.equal(feedbackReaderSha,'699ea1677c21c216be52869318cf0ac1c4525744');
});
const row=(actionKey,status)=>({id:actionKey,sessionId:id,actionKey,version:1,status,text:'SYNTHETIC_UTF8_«متن»\nline2',actorId:id,createdAt:'2026-10-31T00:00:00.123456+00:00'});
const key2='00000000-0000-4000-8000-000000000002';
test('two original action rows preserve exact IDs, UTF8 text, timestamps and versions across reordered GET results',()=>{
 const original=originalFeedbackRows({actions:[row(id,'partial'),row(key2,'not_done')]},[id,key2]);
 const reordered=originalFeedbackRows({actions:[row(key2,'not_done'),row(id,'partial')]},[id,key2]);
 requireOriginalFeedbackRows(original,reordered);assert.deepEqual(original,reordered);
});
test('missing/duplicate/status-reinterpreted rows cannot pass as preserved history',()=>{
 for(const actions of [[row(id,'partial')],[row(id,'partial'),row(id,'partial'),row(key2,'not_done')],[row(id,'done'),row(key2,'not_done')]])assert.throws(()=>originalFeedbackRows({actions},[id,key2]));
});
test('same status with changed ID, detail, time or version is rejected',()=>{
 const original=originalFeedbackRows({actions:[row(id,'partial'),row(key2,'not_done')]},[id,key2]);
 for(const [key,value] of [['id',key2],['text','changed'],['createdAt','2026-10-31T00:00:01Z'],['version',2]]){const changed=structuredClone(original);changed[0][key]=value;assert.throws(()=>requireOriginalFeedbackRows(original,changed));}
});
function receipt(){return{status:'PASS',readerSha:feedbackReaderSha,driverVersion:'1.64.1',sourceExecutable:'/opt/google/chrome/chrome',sourceSha256:'95dc9473b4f904cb3ab0800fc7206081fcae12abc094a088bd741a13f1747b72',chromeSha256:'95dc9473b4f904cb3ab0800fc7206081fcae12abc094a088bd741a13f1747b72',chromeVersion:'Google Chrome 156.0.8078.47',ownerId:id,ownedTemp:'/tmp/owned/p09b-AbC123',executable:'/tmp/owned/p09b-AbC123/chrome/chrome',closure:{sourceStable:true,copyMatched:true,runtimeReadonly:true,sha256:'a'.repeat(64),entries:1,bytes:42,freeBeforeBytes:42+4*1024**3},checks:feedbackReaderChecks.map(name=>({name,status:'PASS'})),freshAuthActors:2,originalRowsStable:true,domHistoryVerified:true,appStopVerified:true,dbStopVerified:true,legacyStatesVerified:true,financialFingerprintUnchanged:true,revocationVerified:true,repeatedPosts:0,domAutomaticPosts:0,privateStorageHits:0,privateUrlHits:0,cleanup:{processStopped:true,contextsClosed:true,ownedTempRemoved:true,ownerId:id}};}
test('new receipt validates only its eight actual feedback checks and strips unknown private properties',()=>{
 const value=receipt();value.privateToken='SYNTHETIC_NEVER_SERIALIZE';const parsed=validateFeedbackReaderReceipt(value,'/tmp/owned');assert.equal(parsed.checks.length,8);assert.equal(Object.hasOwn(parsed,'privateToken'),false);
});
test('receipt cannot substitute a legacy checklist or lose a stop, actor, row, cleanup or no-replay proof',()=>{
 for(const change of [x=>{x.checks.pop();},x=>{x.checks[0].status='FAIL';},x=>{x.readerSha='0'.repeat(40);},x=>{x.dbStopVerified=false;},x=>{x.appStopVerified=1;},x=>{x.freshAuthActors=1;},x=>{x.originalRowsStable=false;},x=>{x.repeatedPosts=1;},x=>{x.domAutomaticPosts=1;},x=>{x.cleanup.ownedTempRemoved=false;},x=>{x.ownedTemp='/tmp/outside/p09b-AbC123';}]){const value=receipt();change(value);assert.throws(()=>validateFeedbackReaderReceipt(value,'/tmp/owned'));}
});
