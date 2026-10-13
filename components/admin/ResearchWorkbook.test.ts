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

test('approval label follows clean displayed content while saved review history survives edits', async () => {
  const fixture = createP07WorkflowFixture(), path = '/api/admin/intelligence/workbooks';
  const saved = await fixture.transport(path, { method: 'POST', body: JSON.stringify({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() }) });
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: () => true, prompt: () => 'Synthetic return', addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  try {
    const ui = mount(fixture.transport, String(saved.body.workbookId)); await ui.settle();
    await ui.click('تأیید داخلی نسخه'); assert.equal(ui.badge(), true);
    const title = () => ui.find('input', node => node.props.id === 'title');
    (title().props.onChange as (event: unknown) => void)({ target: { value: 'Synthetic revised title' } }); await ui.settle();
    assert.equal(ui.badge(), false, 'unsaved content must not appear approved');
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true);
    assert.equal(ui.button('بازگرداندن با علت').props.disabled, true);
    ui.find('li', node => JSON.stringify(node.props.children).includes('تأیید داخلی'));
    assert.equal(fixture.snapshot().reviews.length, 1, 'the saved version keeps its approval history');
    await ui.click('ذخیره به‌عنوان'); assert.equal(ui.badge(), false);
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, false);
    assert.equal(fixture.snapshot().versions.length, 2);
    assert.equal(fixture.snapshot().reviews.length, 1, 'v2 needs a new approval');
    await ui.click('تأیید داخلی نسخه'); assert.equal(ui.badge(), true);
    await ui.click('بازگرداندن با علت'); assert.equal(ui.badge(), false);
    (title().props.onChange as (event: unknown) => void)({ target: { value: 'Synthetic revision after return' } }); await ui.settle();
    await ui.click('ذخیره به‌عنوان'); assert.equal(ui.badge(), false);
    await ui.click('تأیید داخلی نسخه'); assert.equal(ui.badge(), true);
    assert.equal(fixture.snapshot().versions.length, 3);
    assert.deepEqual(fixture.snapshot().reviews.map(row => row.decision), ['approved_internal', 'approved_internal', 'returned', 'approved_internal']);
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('pending preparation text hides the clean approval label without changing saved decisions', async () => {
  const fixture = createP07WorkflowFixture(), path = '/api/admin/intelligence/workbooks';
  const saved = await fixture.transport(path, { method: 'POST', body: JSON.stringify({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() }) });
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: () => true, addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  try {
    const ui = mount(fixture.transport, String(saved.body.workbookId)); await ui.settle();
    await ui.click('تأیید داخلی نسخه'); assert.equal(ui.badge(), true);
    const fields = mountComponent('components/admin/ResearchPreparationFields.tsx', ui.find(ResearchPreparationFields, () => true).props);
    await fields.settle();
    for (const rows of [3, 2]) {
      const input = () => fields.find('textarea', node => node.props.rows === rows);
      (input().props.onChange as (event: unknown) => void)({ target: { value: 'Synthetic pending text' } }); await fields.settle(); await ui.settle();
      assert.equal(ui.badge(), false, 'pending claim/ambiguity text is not approved content');
      assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true);
      assert.equal(ui.button('بازگرداندن با علت').props.disabled, true);
      ui.find('li', node => JSON.stringify(node.props.children).includes('تأیید داخلی'));
      ui.find('p', node => node.props['aria-live'] === 'polite' && JSON.stringify(node.props.children).includes('تغییرات ذخیره‌نشده'));
      assert.equal(fixture.snapshot().reviews.length, 1);
      (input().props.onChange as (event: unknown) => void)({ target: { value: '' } }); await fields.settle(); await ui.settle();
      assert.equal(ui.badge(), true, 'discarding pending text restores the unchanged saved approval label');
    }
    assert.equal(fixture.snapshot().versions.length, 1);
    assert.equal(fixture.snapshot().reviews.length, 1);
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

test('workbook replacement cannot cross an in-flight save, open or review response', async () => {
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: () => true, prompt: () => 'Synthetic return', addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  try {
    for (const operation of ['save', 'open', 'approve', 'return'] as const) {
      const fixture = createP07WorkflowFixture(), path = '/api/admin/intelligence/workbooks';
      const saved = await fixture.transport(path, { method: 'POST', body: JSON.stringify({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() }) });
      const id = String(saved.body.workbookId);
      let pause = false, release: (() => void) | undefined, fileReads = 0;
      const transport: WorkbookTransport = async (url, init) => {
        if (pause && (init?.method === 'POST' || url.includes('?id='))) {
          pause = false;
          await new Promise<void>(done => { release = done; });
        }
        return fixture.transport(url, init);
      };
      const ui = mount(transport, id); await ui.settle();
      const title = () => ui.find('input', node => node.props.id === 'title');
      const newHandler = ui.button('تازه').props.onClick as () => void;
      const importHandler = ui.find('input', node => node.props.type === 'file').props.onChange as (event: unknown) => void;
      const file = { size: 1, text: async () => { fileReads++; return JSON.stringify({ ...p07FixtureWorkbook(), title: 'Synthetic B' }); } };
      if (operation === 'save') {
        (title().props.onChange as (event: unknown) => void)({ target: { value: 'Synthetic A edited' } }); await ui.settle();
      }
      pause = true;
      const action = operation === 'save' ? ui.button('ذخیره به‌عنوان') : operation === 'approve' ? ui.button('تأیید داخلی نسخه')
        : operation === 'return' ? ui.button('بازگرداندن با علت') : ui.button(p07FixtureWorkbook().title);
      (action.props.onClick as () => void)();
      // Invoke handlers from the earlier render before disabled attributes update.
      newHandler(); importHandler({ target: { files: [file] } }); await ui.settle();
      assert.equal(fileReads, 0, operation);
      assert.equal(ui.button('تازه').props.disabled, true, operation);
      assert.equal(ui.button('ادامه از فایل').props.disabled, true, operation);
      assert.equal(ui.find('input', node => node.props.type === 'file').props.disabled, true, operation);
      assert.equal(title().props.value, operation === 'save' ? 'Synthetic A edited' : p07FixtureWorkbook().title);
      assert.ok(release); release(); await ui.settle();
      assert.equal(ui.button('تازه').props.disabled, false);
      await ui.click('تازه');
      (title().props.onChange as (event: unknown) => void)({ target: { value: 'Synthetic B' } }); await ui.settle();
      await ui.click('ذخیرهٔ نسخهٔ ۱');
      const rows = fixture.snapshot().versions;
      assert.equal(rows.at(-1)?.title, 'Synthetic B');
      assert.notEqual(rows.at(-1)?.workbookId, id, 'late response must not attach B to A');
      assert.equal(rows.at(-1)?.version, 1);
      assert.equal(ui.badge(), false, 'a fresh workbook never inherits the prior review');
    }
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('a deferred file read owns the replacement boundary until the import completes', async () => {
  const fixture = createP07WorkflowFixture(), path = '/api/admin/intelligence/workbooks';
  const saved = await fixture.transport(path, { method: 'POST', body: JSON.stringify({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() }) });
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: () => true, addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  try {
    const ui = mount(fixture.transport, String(saved.body.workbookId)); await ui.settle();
    const title = () => ui.find('input', node => node.props.id === 'title');
    (title().props.onChange as (event: unknown) => void)({ target: { value: 'Synthetic A edited' } }); await ui.settle();
    const saveHandler = ui.button('ذخیره به‌عنوان').props.onClick as () => void;
    const newHandler = ui.button('تازه').props.onClick as () => void;
    const importHandler = ui.find('input', node => node.props.type === 'file').props.onChange as (event: unknown) => void;
    let release: ((text: string) => void) | undefined, secondRead = false;
    importHandler({ target: { files: [{ size: 1, text: () => new Promise<string>(done => { release = done; }) }] } });
    saveHandler(); newHandler();
    importHandler({ target: { files: [{ size: 1, text: async () => { secondRead = true; return '{}'; } }] } });
    await ui.settle();
    assert.equal(secondRead, false); assert.equal(fixture.snapshot().versions.length, 1);
    assert.equal(title().props.value, 'Synthetic A edited');
    assert.equal(ui.button('ذخیره به‌عنوان').props.disabled, true);
    assert.ok(release); release(JSON.stringify({ ...p07FixtureWorkbook(), title: 'Synthetic imported B' })); await ui.settle();
    assert.equal(title().props.value, 'Synthetic imported B');
    assert.equal(ui.button('تازه').props.disabled, false);
    await ui.click('ذخیرهٔ نسخهٔ ۱');
    const last = fixture.snapshot().versions.at(-1);
    assert.equal(last?.title, 'Synthetic imported B'); assert.equal(last?.version, 1);
    assert.notEqual(last?.workbookId, saved.body.workbookId);
    let nextRelease: ((text: string) => void) | undefined;
    const nextImport = ui.find('input', node => node.props.type === 'file').props.onChange as (event: unknown) => void;
    nextImport({ target: { files: [{ size: 1, text: () => new Promise<string>(done => { nextRelease = done; }) }] } });
    (title().props.onChange as (event: unknown) => void)({ target: { value: 'Synthetic edit during file read' } }); await ui.settle();
    assert.ok(nextRelease); nextRelease(JSON.stringify({ ...p07FixtureWorkbook(), title: 'Synthetic stale import' })); await ui.settle();
    assert.equal(title().props.value, 'Synthetic edit during file read', 'late file contents must not discard a newer edit');
    assert.equal(ui.button('ذخیره به‌عنوان').props.disabled, false);
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true);
    nextImport({ target: { files: [{ size: 1, text: async () => 'invalid JSON' }] } }); await ui.settle();
    assert.equal(ui.button('تازه').props.disabled, false, 'failed import releases the boundary');
    assert.equal(title().props.value, 'Synthetic edit during file read');
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else Reflect.deleteProperty(globalThis, 'document');
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

test('real workbook handler retries unknown creation with frozen request and same server receipt, never abandons it via New/edit',async()=>{
 const fixture=createP07WorkflowFixture(),bodies:string[]=[];let calls=0;
 const transport:WorkbookTransport=async(path,init)=>{
  if(init?.method==='POST'){bodies.push(String(init.body));if(++calls===1){await fixture.transport(path,init);throw new Error('Synthetic response lost after commit');}}
  return fixture.transport(path,init);
 };
 const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{confirm:()=>true,addEventListener(){},removeEventListener(){}}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
 try {
  const ui=mountComponent('components/admin/ResearchWorkbook.tsx',{transport,initialWorkbook:p07FixtureWorkbook()});await ui.settle();
  const newButton=ui.button('تازه').props.onClick as ()=>void;
  await ui.click('ذخیرهٔ نسخهٔ');assert.equal(fixture.snapshot().versions.length,1);assert.equal(ui.button('تازه').props.disabled,true);
  const title=ui.find('input',e=>e.props.id==='title');assert.equal(title.props.disabled,true);
  (title.props.onChange as (e:{target:{value:string}})=>void)({target:{value:'Must not replace unknown draft'}});newButton();await ui.settle();
  await ui.click('بررسی دوبارهٔ همین ثبت');assert.equal(bodies[0],bodies[1]);assert.equal(JSON.parse(bodies[0]).workbookId,JSON.parse(bodies[0]).creationId);assert.equal(fixture.snapshot().versions.length,1);
  assert.equal(ui.find('input',e=>e.props.id==='title').props.value,p07FixtureWorkbook().title);assert.equal(ui.button('تازه').props.disabled,false);
 }finally{if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');}
});

test('late creation response lost preserves newer edits; exact receipt recovery saves only original draft then explicit v2 keeps newer text',async()=>{
 const fixture=createP07WorkflowFixture(),bodies:string[]=[];let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 const transport:WorkbookTransport=async(path,init)=>{
  if(init?.method==='POST'){bodies.push(String(init.body));if(bodies.length===1){await fixture.transport(path,init);await held;throw new Error('Synthetic committed response lost');}}
  return fixture.transport(path,init);
 };
 const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{confirm:()=>true,addEventListener(){},removeEventListener(){}}});Object.defineProperty(globalThis,'document',{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
 try {
  const ui=mountComponent('components/admin/ResearchWorkbook.tsx',{transport,initialWorkbook:p07FixtureWorkbook()});await ui.settle();await ui.click('ذخیرهٔ نسخهٔ');
  (ui.find('input',e=>e.props.id==='title').props.onChange as (e:{target:{value:string}})=>void)({target:{value:'Synthetic late edit'}});
  (ui.find(ResearchPreparationFields,()=>true).props.onPendingChange as (pending:boolean)=>void)(true);await ui.settle();release();await ui.settle();
  await ui.click('بررسی دوبارهٔ همین ثبت');assert.equal(bodies[0],bodies[1]);assert.equal(fixture.snapshot().versions.length,1);assert.equal(ui.find('input',e=>e.props.id==='title').props.value,'Synthetic late edit');assert.equal(ui.button('تأیید داخلی نسخه').props.disabled,true);
  (ui.find(ResearchPreparationFields,()=>true).props.onPendingChange as (pending:boolean)=>void)(false);await ui.settle();
  await ui.click('ذخیره به‌عنوان');assert.equal(fixture.snapshot().versions.length,2);assert.equal(fixture.snapshot().versions[1].workbookId,fixture.snapshot().versions[0].workbookId);assert.equal(fixture.snapshot().versions[1].title,'Synthetic late edit');
 }finally{release();if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');}
});

for (const initial of ['lost-response', 'initial-503'] as const) test(`creation ${initial} keeps exact retry reachable through unavailable, respects rejection and blocks concurrent replay`, async () => {
  const fixture = createP07WorkflowFixture(), bodies: string[] = [], responses: Record<string, unknown>[] = [];
  let recovering = false, release: (() => void) | undefined, fileReads = 0;
  const transport: WorkbookTransport = async (path, init) => {
    if (init?.method !== 'POST') return fixture.transport(path, init);
    bodies.push(String(init.body));
    if (bodies.length === 1 && initial === 'lost-response') {
      const committed = await fixture.transport(path, init); responses.push(committed.body);
      throw new Error('Synthetic committed response lost');
    }
    if (!recovering) fixture.failNext(503);
    else await new Promise<void>(done => { release = done; });
    const response = await fixture.transport(path, init); responses.push(response.body); return response;
  };
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: () => true, addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  try {
    const ui = mountComponent('components/admin/ResearchWorkbook.tsx', { transport, initialWorkbook: p07FixtureWorkbook() }); await ui.settle();
    const newHandler = ui.button('تازه').props.onClick as () => void;
    const importHandler = ui.find('input', e => e.props.type === 'file').props.onChange as (e: unknown) => void;
    await ui.click('ذخیرهٔ نسخهٔ');
    if (initial === 'lost-response') await ui.click('بررسی دوبارهٔ همین ثبت');
    assert.equal(ui.button('بررسی دوبارهٔ همین ثبت').props.disabled, false);
    assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, true);
    assert.equal(ui.button('ادامه از فایل').props.disabled, true);
    newHandler(); importHandler({ target: { files: [{ size: 1, text: async () => { fileReads++; return '{}'; } }] } });
    (ui.find('input', e => e.props.id === 'title').props.onChange as (e: unknown) => void)({ target: { value: 'Forbidden replacement' } }); await ui.settle();
    assert.equal(fileReads, 0); assert.equal(ui.find('input', e => e.props.id === 'title').props.value, p07FixtureWorkbook().title);
    await ui.click('بررسی دوبارهٔ همین ثبت');
    assert.equal(fixture.snapshot().versions.length, initial === 'lost-response' ? 1 : 0, 'unavailable rejection cannot bypass the writer gate');
    recovering = true;
    const retry = ui.button('بررسی دوبارهٔ همین ثبت').props.onClick as () => void;
    retry(); const inflight = bodies.length; retry(); await ui.settle();
    assert.equal(bodies.length, inflight); assert.equal(ui.button('بررسی دوبارهٔ همین ثبت').props.disabled, true);
    assert.ok(release); release(); await ui.settle();
    assert.ok(bodies.every(body => body === bodies[0]));
    const envelope = JSON.parse(bodies[0]); assert.equal(envelope.workbookId, envelope.creationId);
    const stored = fixture.snapshot().versions; assert.equal(stored.length, 1); assert.equal(stored[0].workbookId, envelope.creationId);
    const recovered = responses.at(-1)!;
    assert.equal(recovered.savedAt, stored[0].createdAt); assert.equal(recovered.workbookId, stored[0].workbookId); assert.equal(recovered.version, 1);
    if (initial === 'lost-response') { assert.equal(recovered.savedAt, responses[0].savedAt); assert.equal(recovered.reused, true); }
    assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, false); assert.equal(ui.button('تازه').props.disabled, false);
  } finally {
    release?.();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
