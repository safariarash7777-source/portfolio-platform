import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {nativeAuthProfile,allowedProfileURL,verifyEnvironment,origin} from './native-auth-runtime.mjs';
import {gatewayProfile} from './native-auth-gateway.mjs';
import {browserRequestAllowed} from './native-auth-gateway.mjs';
import {nativeBrowserMode,validateBrowserReceipt,browserChecks,browserSourceSha} from './native-auth-runtime.mjs';
import {browserDestination,sdkCookies,chromeFileCompatible,closureBudget} from './workbook-browser.mjs';
import {workbookRequestURL,exactWorkbookWrite,workbookHistoryPanel,withNativeNodeGlobals} from './workbook-native-auth.mjs';

test('Hook host DOM globals are absent during native Node work and restored after success or error',async()=>{
 const original=['window','document'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]),stub={hookHostOnly:true};
 try{
  for(const [name] of original)Object.defineProperty(globalThis,name,{configurable:true,value:stub});
  const verify=()=>{assert.equal(typeof globalThis.window,'undefined');assert.equal(typeof globalThis.document,'undefined');};
  assert.equal(await withNativeNodeGlobals(async()=>{verify();return 'native';}),'native');
  for(const [name] of original)assert.equal(globalThis[name],stub);
  await assert.rejects(withNativeNodeGlobals(async()=>{verify();throw Error('expected');}),/expected/);
  for(const [name] of original)assert.equal(globalThis[name],stub);
 }finally{for(const [name,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}
});

test('P09 uses the real panel function from the existing hook host module cache',()=>{
 const hostRequire=createRequire(new URL('../../components/admin/p07-component-test-host.ts',import.meta.url));
 assert.equal(typeof workbookHistoryPanel(),'function');assert.equal(workbookHistoryPanel(),hostRequire('./ResearchHistoryPanel').default);
});

test('P09.1 pins versioned browser helpers descended from PR353; no PF10 product ancestry',()=>{
 for(const [name,expected] of [['native-auth-runtime.mjs','ee6ca3fcee648d33020a1d97b7ba3ea91a238265'],['native-auth-gateway.mjs','63382febd6915d93a27d9b1434f07aed63a2976a']]){
  // Git canonical blobs use LF; a Windows checkout may materialize CRLF.
  const bytes=Buffer.from(readFileSync(new URL(name,import.meta.url),'utf8').replaceAll('\r\n','\n'));
  assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),expected);
 }
});
test('P09 only boots existing Auth/profile/workbook SQL, with two admins and one member',()=>{
 const p=nativeAuthProfile('p09');assert.deepEqual(p.actors,{a:'admin',b:'admin',member:'user'});
 assert.deepEqual(p.bootstrap,['sql/test/supabase_bootstrap.sql','sql/test/profile_explicit_grants.sql','sql/phase34_research_workbook_versions.sql','docs/ops/research-workbook-recovery-20261029/intent-store.candidate.sql']);
 assert.deepEqual(p.sql,p.bootstrap);assert.equal(p.phases,9);assert.ok(Object.isFrozen(p.sql));
 assert.doesNotMatch(JSON.stringify(p),/debt_payment_links|cash_flow|privatePreparation|provider|freeze/i);
 assert.throws(()=>verifyEnvironment({CI:'true',GITHUB_ACTIONS:'true',RUNNER_TEMP:'/tmp/test'},'win32'));
});
test('P09 gateway and thin transport reject unrelated product/worker/provider/remote destinations',()=>{
 const p=nativeAuthProfile('p09');assert.deepEqual(gatewayProfile('p09').routes,p.routes);
 for(const path of ['/api/admin/intelligence/workbooks','/api/admin/intelligence/workbooks?intent=test'])assert.equal(workbookRequestURL(path),origin+path);
 for(const path of ['/api/personal-finance/debt-payments','/api/cron/research','/api/payment','https://example.invalid/api/admin/intelligence/workbooks','http://user@localhost:32189/api/admin/intelligence/workbooks'])assert.throws(()=>workbookRequestURL(path));
 assert.throws(()=>allowedProfileURL('p09',origin+'/api/portfolio/holdings'));assert.throws(()=>nativeAuthProfile({profile:'p09',target:'remote'}));
});
test('Explicit workbook retry preserves every original JSON byte and the original intent header',()=>{
 const body=' {\n "action": "save", "testText": "  exact  "\n}\n',id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const sent=exactWorkbookWrite(body,id);assert.equal(sent.body,body);assert.equal(sent.headers['x-workbook-save-intent'],id);assert.equal(sent.method,'POST');
 for(const bad of ['new-token','------------------------------------',undefined])assert.throws(()=>exactWorkbookWrite(body,bad));
 assert.throws(()=>exactWorkbookWrite({},id));
});
test('Browser mode is explicit p09 only; pf10 and default keep the native API policy',()=>{
 assert.equal(nativeBrowserMode('p09'),false);assert.equal(nativeBrowserMode('pf10'),false);assert.equal(nativeBrowserMode('p09',{browserMode:true}),true);
 for(const [profile,options] of [['pf10',{browserMode:true}],['p09',{browserMode:'true'}],['p09',{browserMode:true,host:'remote'}],['p09',Object.create({browserMode:true})]])assert.throws(()=>nativeBrowserMode(profile,options));
 assert.deepEqual(gatewayProfile('p09').routes,['/api/admin/intelligence/workbooks']);assert.deepEqual(gatewayProfile('pf10').routes,['/api/personal-finance/debt-payments','/api/personal-finance/cash-flow','/api/portfolio/holdings','/api/portfolio/debts']);
 assert.throws(()=>allowedProfileURL('p09',origin+'/admin/research'));assert.throws(()=>allowedProfileURL('pf10',origin+'/admin/research',true));
 assert.equal(allowedProfileURL('p09',origin+'/admin/research',true),origin+'/admin/research');
});
test('Browser allowlist accepts only GET/HEAD real page/static/font and denies traversal/image/remote URLs',()=>{
 for(const path of ['/admin/research','/_next/static/chunks/app/%28protected%29/admin/research/page.js?v=123','/fonts/Vazirmatn-Variable.woff2','/brand/mark.png']){assert.ok(browserRequestAllowed(path));assert.ok(browserRequestAllowed(origin+path,'HEAD'));assert.ok(browserDestination(origin+path));}
 for(const path of ['/_next/image?url=https://example.invalid','/_next/webpack-hmr','/admin/other','/_next/static/../a.js','/_next/static/%2e%2e/a.js','/_next/static/%252e%252e/a.js','/_next/static/a%2fb.js','/_next/static/a\\b.js','//evil.invalid/x','/admin/research?private=body','https://example.invalid/admin/research'])assert.equal(browserRequestAllowed(path),false,path);
 assert.equal(browserRequestAllowed('/admin/research','POST'),false);assert.equal(browserDestination(origin+'/_next/image'),false);
});
test('Browser verdict requires all seven observed checks and cleanup; a blind passed flag is rejected',()=>{
 const ownerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ownedTemp='/tmp/ci/p09-browser-'+ownerId+'-ABC123';
 const valid={status:'PASS',driverVersion:'1.64.1',sourceExecutable:'/opt/google/chrome/chrome',sourceSha256:browserSourceSha,executable:ownedTemp+'/chrome/chrome',ownedTemp,ownerId,chromeVersion:'Google Chrome 150.0.0.1',chromeSha256:browserSourceSha,closure:{sha256:'a'.repeat(64),entries:100,bytes:500000000,freeBeforeBytes:10*1024**3,sourceStable:true,copyMatched:true,runtimeReadonly:true},checks:browserChecks.map(name=>({name,status:'PASS'})),pageClosed:true,contextClosed:true,freshLoginVerified:true,reloadGetOnly:true,automaticWorkbookPosts:0,privateStorageHits:0,privateUrlHits:0,cacheAuditComplete:true,cleanup:{processStopped:true,contextsClosed:true,ownedTempRemoved:true,ownerId}};
 assert.equal(validateBrowserReceipt(valid,'/tmp/ci').status,'PASS');assert.throws(()=>validateBrowserReceipt({status:'PASS'}));
 for(const change of [r=>{r.checks.pop();},r=>{r.checks[1]=r.checks[0];},r=>{r.contextClosed=false;},r=>{r.automaticWorkbookPosts=1;},r=>{r.privateStorageHits=1;},r=>{r.cacheAuditComplete=false;},r=>{r.cleanup.processStopped=false;},r=>{r.executable='/opt/google/chrome/chrome';},r=>{r.sourceSha256='b'.repeat(64);},r=>{r.closure.entries=4097;},r=>{r.closure.runtimeReadonly=false;},r=>{r.cleanup.ownerId='other';}]){const r=structuredClone(valid);change(r);assert.throws(()=>validateBrowserReceipt(r,'/tmp/ci'));}
});
test('Browser cookie transfer consumes only the genuine SDK header in memory, without storage state',()=>{
 assert.deepEqual(sdkCookies('synthetic-a=one; synthetic-b=two'),[{name:'synthetic-a',value:'one',url:origin,sameSite:'Lax'},{name:'synthetic-b',value:'two',url:origin,sameSite:'Lax'}]);
 assert.throws(()=>sdkCookies(''));assert.throws(()=>sdkCookies('invalid'));
});
test('Owned Chrome copy requires this runner ownership and read-only executable; installed world-writable file is not executed',()=>{
 const file={isFile:true,elf:true,uid:1001,runnerUid:1001,mode:0o500};assert.ok(chromeFileCompatible(file));
 for(const change of [{uid:0},{uid:1002},{mode:0o777},{mode:0o755},{mode:0o400},{isFile:false},{elf:false}])assert.equal(chromeFileCompatible({...file,...change}),false);
});
test('Chrome closure has fixed count/byte/free-space bounds, with room reserved for native work and cleanup',()=>{
 assert.ok(closureBudget(100,500000000,10*1024**3));
 for(const args of [[0,1,10*1024**3],[4097,1,10*1024**3],[1,1024**3+1,10*1024**3],[1,100,4*1024**3],[1,100,NaN]])assert.equal(closureBudget(...args),false);
});
