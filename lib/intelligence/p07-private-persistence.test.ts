import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createP07WorkflowFixture, p07FixtureWorkbook } from './p07-workflow-fixture';
import { parseWorkbook, PRIVATE_PREPARATION_CONTRACT, reviewWorkbook } from './research-workbook';
import { parsePublication } from './publication';
import { saveWorkbook, openWorkbook, decideWorkbook, type WorkbookGateway, type StoredVersion } from './workbook-store';

const privateWorkbook = () => ({ ...p07FixtureWorkbook(), privatePreparation: { contract: PRIVATE_PREPARATION_CONTRACT,
  intake: { kind: 'text', text: '  PRIVATE_ORIGINAL\nwith exact whitespace  ', transcriptConfirmed: false,
    claims: [{ id: 'c1', kind: 'observation', text: 'Private claim', evidenceIds: ['e1'] }],
    ambiguities: [{ id: 'a1', text: 'Private ambiguity', resolved: false }], approved: true, role: 'admin' } } });
const WB = '/api/admin/intelligence/workbooks';
test('private preparation is bounded, typed, original-preserving, optional for legacy and never an approval claim', () => {
  const raw = privateWorkbook(), parsed = parseWorkbook(JSON.stringify(raw));
  assert.equal(parsed.privatePreparation?.intake.text, raw.privatePreparation.intake.text);
  assert.equal('approved' in parsed.privatePreparation!.intake, false);
  assert.equal('role' in parsed.privatePreparation!.intake, false);
  assert.ok(reviewWorkbook(parsed).some(issue => issue.field === 'privatePreparation'));
  assert.equal(parseWorkbook(JSON.stringify(p07FixtureWorkbook())).privatePreparation, undefined);
  for (const preparation of [{...raw.privatePreparation,contract:'unknown'}, null,
    {...raw.privatePreparation,intake:{...raw.privatePreparation.intake,text:' '.repeat(20001)}},
    {...raw.privatePreparation,intake:{...raw.privatePreparation.intake,ambiguities:[{id:'a1',text:'X',resolved:'yes'}]}}])
    assert.throws(() => parseWorkbook(JSON.stringify({...raw,privatePreparation:preparation})));
});
test('save, independent read, edit and stale-base conflict retain exact private history', async () => {
  const fixture = createP07WorkflowFixture();
  const post = (payload: unknown) => fixture.transport(WB,{method:'POST',body:JSON.stringify(payload)});
  const first = await post({action:'save',baseVersion:0,workbook:privateWorkbook()}); assert.equal(first.status,201);
  const id = first.body.workbookId;
  const opened = await fixture.transport(`${WB}?id=${id}`);
  const stored = opened.body.workbook as ReturnType<typeof privateWorkbook>;
  assert.equal(stored.privatePreparation.intake.text, privateWorkbook().privatePreparation.intake.text);
  const edited = structuredClone(stored); edited.privatePreparation.intake.ambiguities[0].resolved = true;
  assert.equal((await post({action:'save',workbookId:id,baseVersion:1,workbook:edited})).status,201);
  assert.equal((await post({action:'save',workbookId:id,baseVersion:1,workbook:stored})).status,409);
  const old = await fixture.transport(`${WB}?id=${id}&version=1`);
  assert.equal((old.body.workbook as typeof stored).privatePreparation.intake.ambiguities[0].resolved,false);
  assert.equal((await post({action:'decide',workbookId:id,version:1,decision:'approved_internal'})).status,409);
});
test('writer defaults off, blocks metadata-dropping old clients, and denies nonadmin before store access', async () => {
  const rows: StoredVersion[] = [], id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; let writable=false, role='admin', accesses=0;
  const gateway: WorkbookGateway = { get privatePreparationWritable(){return writable;}, getUser:async()=>({id}), getRole:async()=>role, newId:()=>id,
    createStore:()=>{accesses++;return{recent:async()=>[],versions:async()=>rows,reviews:async()=>[],insertReview:async()=>{throw new Error('unused');},
      insertVersion:async row=>{const saved={...row,id,createdAt:'2026-10-03T10:00:00Z'};rows.push(saved);return saved;}};} };
  assert.equal((await saveWorkbook(gateway,{baseVersion:0,workbook:privateWorkbook()})).status,503); assert.equal(rows.length,0);
  writable=true; assert.equal((await saveWorkbook(gateway,{baseVersion:0,workbook:privateWorkbook()})).status,201);
  assert.equal((await saveWorkbook(gateway,{workbookId:id,baseVersion:1,workbook:p07FixtureWorkbook()})).status,409);
  writable=false; assert.equal((await saveWorkbook(gateway,{workbookId:id,baseVersion:1,workbook:privateWorkbook()})).status,503);
  assert.equal((await decideWorkbook(gateway,{workbookId:id,version:1,decision:'returned',note:'Synthetic return'})).status,503);
  const before=accesses; role='user';
  assert.equal((await openWorkbook(gateway,id,null)).status,403);
  assert.equal((await saveWorkbook(gateway,{baseVersion:0,workbook:privateWorkbook()})).status,403);
  assert.equal(accesses,before); assert.equal(rows.length,1);
});
test('publication allowlist never carries original intake, claims or private ambiguity', () => {
  const draft = {workbookVersionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',contentKind:'brief',title:'Public title',summary:'Public summary',content:'Public text',
    sources:[{url:'https://example.invalid/public',asOf:'2026-10-03'}],audience:'public',cohortIds:[],channels:['site'],privatePreparation:privateWorkbook().privatePreparation};
  const parsed=parsePublication(draft);
  assert.equal('privatePreparation' in parsed,false); assert.equal(JSON.stringify(parsed).includes('PRIVATE_ORIGINAL'),false);
});
