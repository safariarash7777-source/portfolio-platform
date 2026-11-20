import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=(p)=>readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
const workflow=read('sql/consultation_workflow.sql');
const service=read('sql/consultation_service_requests.sql');
test('legacy basis remains latest by member; service request consumes its own frozen holding ID',()=>{
 assert.match(workflow,/FUNCTION consultation_private.holdings_basis\(client uuid,p_relation uuid\)[\s\S]*?SELECT id FROM public.member_holding_versions WHERE user_id=client ORDER BY version DESC LIMIT 1/);
 assert.match(service,/SELECT q.holdings_version_id INTO pinned FROM consultation_private.service_requests q WHERE q.relationship_id=p_relation/);
 assert.match(service,/IF FOUND THEN[\s\S]+r.client_id=h.user_id WHERE r.id=p_relation AND h.id=pinned AND h.user_id=client[\s\S]+ERRCODE='42501'; END IF;\s+RETURN pinned;/);
 assert.match(service,/request-pinned consultation workflow required/);
});
test('existing authorized read and approved write resolve the same bound holdings before storage',()=>{
 assert.match(workflow,/IF r.id IS NULL OR NOT consultation_private.access\(r\) THEN[\s\S]*WHERE user_id=r.client_id AND id=consultation_private.holdings_basis\(r.client_id,r.id\)/);
 assert.match(workflow,/h:=consultation_private.holdings_basis\(client,p_relation\)/);
 assert.equal((workflow.match(/basis_current\(r.client_id,r.id,/g)??[]).length,2);
 assert.match(workflow,/REVOKE ALL ON ALL FUNCTIONS IN SCHEMA consultation_private FROM PUBLIC,anon,authenticated,service_role/);
 assert.doesNotMatch(service,/GRANT EXECUTE ON FUNCTION consultation_private\.holdings_basis/);
});
test('native scenario advances own base finance before the advisor opens; another member stays isolated',()=>{
 const acceptance=read('scripts/testing/consultation/service-acceptance.mjs');
 assert.match(acceptance,/saveHold\(2,\[\{\.\.\.holdings\[0\][\s\S]+?const d=\(await get\(O,r\)\)\.dossier/);
 assert.match(acceptance,/holdingsVersionId:latestId[\s\S]+?PT409/);
 assert.match(acceptance,/list.token,null/);
 assert.match(acceptance,/await actor\(B,saveHold\(0,/);
});
