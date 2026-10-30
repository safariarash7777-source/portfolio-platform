import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {nativeAuthProfile,allowedProfileURL,verifyEnvironment,origin} from './native-auth-runtime.mjs';
import {gatewayProfile} from './native-auth-gateway.mjs';
import {workbookRequestURL,exactWorkbookWrite,workbookHistoryPanel} from './workbook-native-auth.mjs';

test('P09 uses the real panel function from the existing hook host module cache',()=>{
 const hostRequire=createRequire(new URL('../../components/admin/p07-component-test-host.ts',import.meta.url));
 assert.equal(typeof workbookHistoryPanel(),'function');assert.equal(workbookHistoryPanel(),hostRequire('./ResearchHistoryPanel').default);
});

test('P09 reuses the exact runtime and gateway blobs accepted by PR353, without PF10 product ancestry',()=>{
 for(const [name,expected] of [['native-auth-runtime.mjs','da913282f2bb8119a553e6f77807ee30f7d1b301'],['native-auth-gateway.mjs','1f60ca9468a12317301af57ecafa51d2b8c41853']]){
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
