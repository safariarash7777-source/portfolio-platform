import { test } from 'node:test';
import assert from 'node:assert/strict';





import { createP07WorkflowFixture, p07FixtureWorkbook } from '../../lib/intelligence/p07-workflow-fixture';
import type { WorkbookTransport } from './ResearchWorkbook';
import { mountComponent } from './p07-component-test-host';
import ResearchPreparationFields from './ResearchPreparationFields';
import type { ManualIntake } from '../../lib/intelligence/manual-intake';
const mount = (transport: WorkbookTransport, workbookId: string) => mountComponent('components/admin/ResearchWorkbook.tsx', { transport, initialWorkbookId: workbookId });

// Execute the actual component and its event handlers with a minimal hook host.
// No copied approval expressions, DOM dependency, browser or Native DB acceptance.
test('actual workbook UI returns, reopens, creates a fresh version and requires another human approval', async () => {
  const fixture = createP07WorkflowFixture(), path = '/api/admin/intelligence/workbooks';
  const saved = await fixture.transport(path, { method: 'POST', body: JSON.stringify({ action: 'save', workbookId: null, baseVersion: 0, workbook: p07FixtureWorkbook() }) });
  assert.equal(saved.status, 201);
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: () => true, prompt: () => 'Synthetic return', addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  try {
    const id = String(saved.body.workbookId);
    const ui = mount(fixture.transport, id); await ui.settle();
    assert.equal(ui.badge(), false);
    await ui.click('تأیید داخلی نسخه'); assert.equal(ui.badge(), true);
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true);
    await ui.click('بازگرداندن با علت'); assert.equal(ui.badge(), false);
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true);
    const reopened = mount(fixture.transport, id); await reopened.settle();
    assert.equal(reopened.badge(), false); assert.equal(reopened.button('تأیید داخلی نسخه').props.disabled, true);
    await reopened.click('ایجاد نسخهٔ تازه برای بازبینی');
    assert.equal(reopened.badge(), false);
    assert.equal(fixture.snapshot().versions.length, 2);
    assert.equal(fixture.snapshot().reviews.length, 2, 'copying a version never approves it');
    await reopened.click('تأیید داخلی نسخه'); assert.equal(reopened.badge(), true);
    assert.equal(fixture.snapshot().reviews.length, 3);
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('actual workbook private fields survive an independent reopen and pending entry cannot be dropped', async () => {
  const fixture=createP07WorkflowFixture(), path='/api/admin/intelligence/workbooks';
  const saved=await fixture.transport(path,{method:'POST',body:JSON.stringify({action:'save',baseVersion:0,workbook:p07FixtureWorkbook()})});
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{confirm:()=>true,addEventListener(){},removeEventListener(){}}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
  try {
    const id=String(saved.body.workbookId),ui=mount(fixture.transport,id);await ui.settle();
    const intake:ManualIntake={kind:'text',text:'  PRIVATE_UI_ORIGINAL  ',transcriptConfirmed:false,
      claims:[{id:'c1',kind:'observation',text:'A private claim',evidenceIds:['e1']}],ambiguities:[{id:'a1',text:'Private question',resolved:false}]};
    let fields=ui.find(ResearchPreparationFields,()=>true);
    (fields.props.onChange as (intake:ManualIntake)=>void)(intake);
    (fields.props.onPendingChange as (pending:boolean)=>void)(true);await ui.settle();
    await ui.click('ذخیره به‌عنوان');assert.equal(fixture.snapshot().versions.length,1);
    fields=ui.find(ResearchPreparationFields,()=>true);
    (fields.props.onPendingChange as (pending:boolean)=>void)(false);await ui.settle();
    await ui.click('ذخیره به‌عنوان');assert.equal(fixture.snapshot().versions.length,2);
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled,true,'unresolved ambiguity blocks structural approval on the server and UI');
    const other=mount(fixture.transport,id);await other.settle();
    const restored=other.find(ResearchPreparationFields,()=>true).props.value as ManualIntake;
    assert.deepEqual(restored,intake);
    (other.find(ResearchPreparationFields,()=>true).props.onChange as (intake:ManualIntake)=>void)({...restored,ambiguities:[{...restored.ambiguities[0],resolved:true}]});await other.settle();
    await other.click('ذخیره به‌عنوان');assert.equal(fixture.snapshot().versions.length,3);
    const old=await fixture.transport(`${path}?id=${id}&version=2`);
    assert.equal((old.body.workbook as {privatePreparation:{intake:ManualIntake}}).privatePreparation.intake.ambiguities[0].resolved,false);
  } finally {
    if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');
    if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');
  }
});

test('actual private field controls register a linked claim instead of dropping pending text', async () => {
  const prior:ManualIntake={kind:'text',text:'',transcriptConfirmed:false,claims:[],ambiguities:[]};
  let current=prior,pending=false;
  const props={value:current,evidence:p07FixtureWorkbook().evidence,onChange:(value:ManualIntake)=>{current=value;props.value=value;},onPendingChange:(value:boolean)=>{pending=value;}};
  const fields=mountComponent('components/admin/ResearchPreparationFields.tsx',props);await fields.settle();
  (fields.find('textarea',node=>node.props.rows===5).props.onChange as (event:unknown)=>void)({target:{value:'  PRIVATE_CONTROLS_ORIGINAL  '}});await fields.settle();
  (fields.find('textarea',node=>node.props.rows===3).props.onChange as (event:unknown)=>void)({target:{value:'A manually entered observation'}});await fields.settle();
  assert.equal(pending,true);assert.equal(current.claims.length,0);
  (fields.find('select',node=>node.props.value==='').props.onChange as (event:unknown)=>void)({target:{value:'e1'}});await fields.settle();
  await fields.click('ثبت گزاره');assert.equal(pending,false);assert.equal(current.claims.length,1);assert.deepEqual(current.claims[0].evidenceIds,['e1']);
  assert.equal(current.text,'  PRIVATE_CONTROLS_ORIGINAL  ');
});

test('edits while save is in flight stay dirty and do not masquerade as the saved version', async () => {
  const fixture=createP07WorkflowFixture(),path='/api/admin/intelligence/workbooks';
  const saved=await fixture.transport(path,{method:'POST',body:JSON.stringify({action:'save',baseVersion:0,workbook:p07FixtureWorkbook()})});
  let release:(()=>void)|undefined;
  const transport:WorkbookTransport=async(url,init)=>{if(init?.method==='POST')await new Promise<void>(done=>{release=done;});return fixture.transport(url,init);};
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{confirm:()=>true,addEventListener(){},removeEventListener(){}}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
  try {
    const ui=mount(transport,String(saved.body.workbookId));await ui.settle();
    const title=()=>ui.find('input',node=>node.props.id==='title');
    (title().props.onChange as (event:unknown)=>void)({target:{value:'Before request'}});await ui.settle();
    (ui.button('ذخیره به‌عنوان').props.onClick as ()=>void)();ui.render();
    (title().props.onChange as (event:unknown)=>void)({target:{value:'New edit during request'}});await ui.settle();
    assert.ok(release);release();await ui.settle();
    assert.equal(title().props.value,'New edit during request');assert.equal(fixture.snapshot().versions[1].title,'Before request');
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled,true);
    assert.equal(ui.button('ذخیره به‌عنوان').props.disabled,false);
  } finally {
    if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');
    if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');
  }
});

test('actual UI respects returned ties, old versions, dirty state and in-flight decisions', async () => {
  const fixture = createP07WorkflowFixture(), path = '/api/admin/intelligence/workbooks';
  const saved = await fixture.transport(path, { method: 'POST', body: JSON.stringify({ action: 'save', workbookId: null, baseVersion: 0, workbook: p07FixtureWorkbook() }) });
  const id = String(saved.body.workbookId);
  const approved = { version: 1, decision: 'approved_internal', note: null, reviewedAt: '2026-10-03T10:00:00.000Z' };
  let mode: 'tie' | 'old' | 'plain' = 'tie';
  let release: (() => void) | undefined, writes = 0;
  const transport: WorkbookTransport = async (url, init) => {
    if (init?.method === 'POST') {
      writes++; await new Promise<void>(done => { release = done; });
      return fixture.transport(url, init);
    }
    const response = await fixture.transport(url, init);
    if (url.includes('?id=')) return { ...response, body: { ...response.body, latestVersion: mode === 'old' ? 2 : 1,
      reviews: mode === 'tie' ? [approved, { ...approved, decision: 'returned' }] : mode === 'old' ? [approved] : [] } };
    return response;
  };
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: () => true, prompt: () => 'Synthetic return', addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  try {
    let ui = mount(transport, id); await ui.settle();
    assert.equal(ui.badge(), false); assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true);
    mode = 'old'; ui = mount(transport, id); await ui.settle();
    assert.equal(ui.badge(), false);
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true); assert.equal(ui.button('بازگرداندن با علت').props.disabled, true);
    mode = 'plain'; ui = mount(transport, id); await ui.settle();
    const approve = ui.button('تأیید داخلی نسخه').props.onClick as () => void;
    approve(); ui.render();
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true); assert.equal(ui.button('بازگرداندن با علت').props.disabled, true);
    approve(); assert.equal(writes, 1, 'busyRef prevents duplicate request from an earlier render');
    assert.ok(release); release(); await ui.settle();
    const input = ui.find('input', element => element.props.value === p07FixtureWorkbook().title);
    (input.props.onChange as (event: unknown) => void)({ target: { value: 'Changed synthetic title' } }); await ui.settle();
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true); assert.equal(ui.button('بازگرداندن با علت').props.disabled, true);
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
