import { test } from 'node:test';
import assert from 'node:assert/strict';





import { createP07WorkflowFixture, p07FixtureWorkbook } from '../../lib/intelligence/p07-workflow-fixture';
import type { WorkbookTransport } from './ResearchWorkbook';
import { mountComponent } from './p07-component-test-host';
import ResearchPreparationFields from './ResearchPreparationFields';
import type { ManualIntake } from '../../lib/intelligence/manual-intake';
const mount = (transport: WorkbookTransport, workbookId: string) => mountComponent('components/admin/ResearchWorkbook.tsx', { transport, initialWorkbookId: workbookId });

test('closing while prepare response is pending cannot let the old client continue with a workbook POST',async()=>{
  const restore=workbookBrowserFixture(),fixture=createP07WorkflowFixture({durable:true});let release:(()=>void)|undefined,saves=0;
  const transport:WorkbookTransport=async(url,init)=>{
    const action=init?.method==='POST'?JSON.parse(String(init.body)).action:null;
    const result=await fixture.transport(url,init);
    if(action==='prepare_save')await new Promise<void>(done=>{release=done;});
    if(action==='save')saves++;return result;
  };
  try{
    const ui=mountComponent('components/admin/ResearchWorkbook.tsx',{transport,initialWorkbook:p07FixtureWorkbook()});await ui.settle();await ui.click('ذخیرهٔ نسخهٔ');
    assert.ok(release);assert.equal(fixture.intentSnapshot().length,1);ui.unmount();release();await ui.settle();assert.equal(saves,0);
    const reopened=mountComponent('components/admin/ResearchWorkbook.tsx',{transport:fixture.transport});await reopened.settle();await reopened.settle();
    assert.equal(reopened.button('تازه').props.disabled,true);assert.equal(fixture.snapshot().versions.length,0);
    await reopened.click('ارسال دوبارهٔ همین ثبت');await reopened.settle();assert.equal(fixture.snapshot().versions.length,1);
  }finally{release?.();restore();}
});

test('session expiry after confirmed prepare retains the same intent/body until authorized readback and explicit retry',async()=>{
  const restore=workbookBrowserFixture(),fixture=createP07WorkflowFixture({durable:true});const attempts:Array<{body:string;intent:string|null}>=[];let expire=true;
  const transport:WorkbookTransport=async(url,init)=>{
    if(init?.method==='POST'&&JSON.parse(String(init.body)).action==='save'){
      attempts.push({body:String(init.body),intent:new Headers(init.headers).get('x-workbook-save-intent')});
      if(expire){expire=false;fixture.setIdentity(null);}
    }
    return fixture.transport(url,init);
  };
  try{
    const ui=mountComponent('components/admin/ResearchWorkbook.tsx',{transport,initialWorkbook:p07FixtureWorkbook()});await ui.settle();await ui.click('ذخیرهٔ نسخهٔ');await ui.settle();
    assert.equal(ui.button('تازه').props.disabled,true);assert.equal(fixture.snapshot().versions.length,0);
    await ui.click('بررسی دوبارهٔ همین ثبت');assert.equal(attempts.length,1);
    fixture.setIdentity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await ui.click('بررسی دوبارهٔ همین ثبت');await ui.click('ارسال دوبارهٔ همین ثبت');await ui.settle();
    assert.equal(attempts.length,2);assert.deepEqual(attempts[1],attempts[0]);assert.equal(fixture.intentSnapshot().length,1);assert.equal(fixture.snapshot().versions.length,1);
  }finally{restore();}
});

for (const lost of ['prepare', 'commit'] as const) test(`durable ${lost} response loss survives unmount/reopen with exact intent and no automatic POST`, async () => {
  const restore = workbookBrowserFixture(), fixture = createP07WorkflowFixture({ durable: true });
  const privateWorkbook = { ...p07FixtureWorkbook(), privatePreparation: { contract: 'p07.private-preparation.v1' as const,
    intake: { kind: 'text' as const, text: '  PRIVATE_ORIGINAL\n exact whitespace  ', transcriptConfirmed: false, claims: [], ambiguities: [] } } };
  const requests: Array<{ action?: string; body?: string; intent: string | null; url: string }> = [];
  let cut = true, persistentStorageAccess = 0;
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) Object.defineProperty(window, name, { configurable: true, get() { persistentStorageAccess++; throw new Error('Private browser storage forbidden'); } });
  const transport: WorkbookTransport = async (url, init) => {
    const action = init?.method === 'POST' ? JSON.parse(String(init.body)).action : undefined;
    requests.push({ action, body: init?.body ? String(init.body) : undefined, intent: new Headers(init?.headers).get('x-workbook-save-intent'), url });
    const result = await fixture.transport(url, init);
    if (cut && action === (lost === 'prepare' ? 'prepare_save' : 'save')) { cut = false; throw new Error('Synthetic response lost after durable commit'); }
    return result;
  };
  try {
    const ui = mountComponent('components/admin/ResearchWorkbook.tsx', { transport, initialWorkbook: privateWorkbook }); await ui.settle();
    await ui.click('ذخیرهٔ نسخهٔ'); await ui.settle();
    assert.equal(fixture.intentSnapshot().length, 1);
    assert.equal(fixture.snapshot().versions.length, lost === 'prepare' ? 0 : 1);
    assert.equal(ui.button('تازه').props.disabled, true);
    const intent = fixture.intentSnapshot()[0], expected = JSON.parse(intent.requestBody);
    ui.unmount();
    const posts = requests.filter(r => r.action).length;
    const reopened = mountComponent('components/admin/ResearchWorkbook.tsx', { transport }); await reopened.settle(); await reopened.settle();
    await reopened.waitFor(() => reopened.find('input', e => e.props.id === 'title').props.value === privateWorkbook.title);
    assert.equal(requests.filter(r => r.action).length, posts, 'reopening performs only GET, even after a committed prepare');
    assert.equal(reopened.find('input', e => e.props.id === 'title').props.value, privateWorkbook.title);
    assert.equal((reopened.find(ResearchPreparationFields, () => true).props.value as ManualIntake).text, privateWorkbook.privatePreparation.intake.text);
    if (lost === 'prepare') {
      assert.equal(reopened.button('تازه').props.disabled, true);
      await reopened.click('ارسال دوبارهٔ همین ثبت'); await reopened.settle();
    }
    assert.equal(fixture.snapshot().versions.length, 1);
    const actual = requests.find(r => r.action === 'save')!;
    assert.equal(actual.body, intent.requestBody); assert.equal(actual.intent, intent.intentId);
    assert.equal(fixture.snapshot().versions[0].workbookId, expected.workbookId);
    assert.equal(fixture.snapshot().reviews.length, 0); assert.equal(reopened.badge(), false);
    assert.equal(persistentStorageAccess, 0);
    assert.equal(requests.filter(r => r.action === 'prepare_save').length, 1);
    assert.equal(requests.filter(r => r.action === 'save').length, 1);
    const again = mountComponent('components/admin/ResearchWorkbook.tsx', { transport }); await again.settle(); await again.settle();
    assert.equal(again.button('تازه').props.disabled, false);
    assert.equal(requests.filter(r => r.action === 'save').length, 1);
  } finally { restore(); }
});

test('durable v2 after page closure preserves v1 and its review, and a different/expired actor cannot restore or replay the private intent', async () => {
  const restore = workbookBrowserFixture(), fixture = createP07WorkflowFixture({ durable: true });
  const api = '/api/admin/intelligence/workbooks';
  const saved = await fixture.transport(api, { method: 'POST', body: JSON.stringify({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() }) });
  const id = String(saved.body.workbookId);
  await fixture.transport(api, { method: 'POST', body: JSON.stringify({ action: 'decide', workbookId: id, version: 1, decision: 'approved_internal' }) });
  const v1 = fixture.snapshot().versions[0]; let saves = 0;
  const transport: WorkbookTransport = async (url, init) => {
    const result = await fixture.transport(url, init);
    if (init?.method === 'POST' && JSON.parse(String(init.body)).action === 'save' && ++saves === 1) throw new Error('Synthetic v2 receipt lost');
    return result;
  };
  try {
    const ui = mount(transport, id); await ui.settle();
    (ui.find('input', e => e.props.id === 'title').props.onChange as (e: unknown) => void)({ target: { value: 'PRIVATE_DURABLE_V2' } }); await ui.settle();
    await ui.click('ذخیره به‌عنوان'); await ui.settle(); ui.unmount();
    const intent = fixture.intentSnapshot()[0];
    for (const actor of ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null]) {
      fixture.setIdentity(actor);
      const denied = await fixture.transport(`${api}?intent=${intent.intentId}`);
      assert.equal(denied.status, actor ? 404 : 401); assert.doesNotMatch(JSON.stringify(denied.body), /PRIVATE_DURABLE_V2/);
      const blocked = await fixture.transport(api, { method: 'POST', body: intent.requestBody, headers: { 'x-workbook-save-intent': intent.intentId } });
      assert.equal(blocked.status, actor ? 409 : 401);
      const other = mountComponent('components/admin/ResearchWorkbook.tsx', { transport: fixture.transport }); await other.settle();
      assert.notEqual(other.find('input', e => e.props.id === 'title').props.value, 'PRIVATE_DURABLE_V2'); other.unmount();
    }
    fixture.setIdentity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    const resumed = mountComponent('components/admin/ResearchWorkbook.tsx', { transport }); await resumed.settle(); await resumed.settle();
    assert.equal(resumed.find('input', e => e.props.id === 'title').props.value, 'PRIVATE_DURABLE_V2');
    assert.equal(resumed.badge(), false); assert.equal(saves, 1);
    assert.deepEqual(fixture.snapshot().versions[0], v1); assert.equal(fixture.snapshot().versions.length, 2);
    assert.equal(fixture.snapshot().reviews.length, 1);
  } finally { restore(); }
});

test('durable same-intent retry after absence cannot overwrite a concurrent different v2, including after reopen', async () => {
  const restore = workbookBrowserFixture(), fixture = createP07WorkflowFixture({ durable: true });
  const api = '/api/admin/intelligence/workbooks';
  const first = await fixture.transport(api, { method: 'POST', body: JSON.stringify({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() }) });
  const id = String(first.body.workbookId); let cut = true;
  const transport: WorkbookTransport = async (url, init) => {
    if (cut && init?.method === 'POST' && JSON.parse(String(init.body)).action === 'save') { cut = false; throw new Error('Synthetic pre-commit disconnect'); }
    return fixture.transport(url, init);
  };
  try {
    const ui = mount(transport, id); await ui.settle();
    (ui.find('input', e => e.props.id === 'title').props.onChange as (e: unknown) => void)({ target: { value: 'My pending version' } }); await ui.settle();
    await ui.click('ذخیره به‌عنوان'); await ui.settle(); await ui.click('بررسی دوبارهٔ همین ثبت');
    fixture.setIdentity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await fixture.transport(api, { method: 'POST', body: JSON.stringify({ action: 'save', workbookId: id, baseVersion: 1, workbook: { ...p07FixtureWorkbook(), title: 'Concurrent other actor' } }) });
    fixture.setIdentity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await ui.click('ارسال دوبارهٔ همین ثبت'); await ui.settle();
    assert.equal(ui.button('تازه').props.disabled, true); assert.equal(fixture.snapshot().versions.length, 2);
    ui.unmount();
    const reopened = mountComponent('components/admin/ResearchWorkbook.tsx', { transport }); await reopened.settle(); await reopened.settle();
    assert.equal(reopened.find('input', e => e.props.id === 'title').props.value, 'My pending version');
    assert.equal(reopened.button('تازه').props.disabled, true); assert.throws(() => reopened.button('تأیید داخلی نسخه'));
    assert.equal(fixture.snapshot().versions[1].title, 'Concurrent other actor');
    assert.equal(fixture.intentSnapshot().length, 1);
  } finally { restore(); }
});

for (const outcome of ['committed', 'absent', 'late-commit'] as const) test(`START-B v2 unknown save: ${outcome}, GET recovery retains v1 and cannot carry its approval`, async () => {
  const restore = workbookBrowserFixture(), fixture = createP07WorkflowFixture();
  const path = '/api/admin/intelligence/workbooks', posts: string[] = [], reads: string[] = [];
  const first = await fixture.transport(path, { method: 'POST', body: JSON.stringify({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() }) });
  const id = String(first.body.workbookId), original = structuredClone(fixture.snapshot().versions[0]);
  let unknown = false;
  const transport: WorkbookTransport = async (url, init) => {
    if (init?.method === 'POST' && JSON.parse(String(init.body)).action === 'save') {
      posts.push(String(init.body));
      if (posts.length === 1) {
        unknown = true;
        if (outcome === 'committed') await fixture.transport(url, init);
        throw new Error('Synthetic lost response');
      }
    } else if (unknown && url.includes('?id=')) reads.push(url);
    return fixture.transport(url, init);
  };
  try {
    const ui = mount(transport, id); await ui.settle();
    await ui.click('تأیید داخلی نسخه'); assert.equal(ui.badge(), true);
    (ui.find('input', e => e.props.id === 'title').props.onChange as (e: unknown) => void)({ target: { value: 'نمونه ساختگی: نسخه دوم' } }); await ui.settle();
    await ui.click('ذخیره به‌عنوان');
    assert.equal(ui.button('تازه').props.disabled, true, 'an unknown v2 must not be replaced by another workbook');
    assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, true);
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true);
    assert.equal(ui.badge(), false);
    await ui.click('بررسی دوبارهٔ همین ثبت');
    assert.equal(posts.length, 1, 'recovery never POSTs');
    assert.deepEqual(reads, [`${path}?id=${id}&version=2`]);
    if (outcome !== 'committed') {
      if (outcome === 'late-commit') await fixture.transport(path, { method: 'POST', body: posts[0] });
      await ui.click('ارسال دوبارهٔ همین ثبت');
      assert.equal(posts[1], posts[0], 'same workbook, base, target and exact body');
      if (outcome === 'late-commit') {
        assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, true, 'a conflict is not confirmation');
        await ui.click('بررسی دوبارهٔ همین ثبت');
      }
    }
    assert.equal(fixture.snapshot().versions.length, 2);
    assert.deepEqual(fixture.snapshot().versions[0], original);
    assert.equal(fixture.snapshot().reviews.length, 1); assert.equal(ui.badge(), false);
    assert.equal(fixture.snapshot().publications.length, 0);
    assert.equal(ui.button('تازه').props.disabled, false);
    const reread = await fixture.transport(`${path}?id=${id}&version=1`);
    assert.deepEqual(reread.body.workbook, original.body);
    const reopened = mount(fixture.transport, id); await reopened.settle();
    assert.equal(reopened.find('input', e => e.props.id === 'title').props.value, 'نمونه ساختگی: نسخه دوم');
    assert.equal(reopened.badge(), false, 'reload cannot inherit v1 approval');
    await reopened.click('نسخهٔ ۱ ·');
    assert.equal(reopened.find('input', e => e.props.id === 'title').props.value, original.title);
    assert.equal(reopened.badge(), false, 'historical approval is not current approval');
    assert.throws(() => reopened.button('ایجاد نسخهٔ تازه برای بازبینی'), 'historical does not mean returned');
  } finally { restore(); }
});

test('START-B a missing v2 with an incompatible latest-version response cannot authorize a retry', async () => {
  const restore = workbookBrowserFixture(), fixture = createP07WorkflowFixture();
  const path = '/api/admin/intelligence/workbooks';
  const first = await fixture.transport(path, { method: 'POST', body: JSON.stringify({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() }) });
  let posts = 0, unknown = false;
  const transport: WorkbookTransport = async (url, init) => {
    if (init?.method === 'POST') { posts++; unknown = true; throw new Error('Synthetic no receipt'); }
    const result = await fixture.transport(url, init);
    return unknown && url.includes('?id=') ? { ...result, body: { ...result.body, latestVersion: 3 } } : result;
  };
  try {
    const ui = mount(transport, String(first.body.workbookId)); await ui.settle();
    (ui.find('input', e => e.props.id === 'title').props.onChange as (e: unknown) => void)({ target: { value: 'Synthetic v2' } }); await ui.settle();
    await ui.click('ذخیره به‌عنوان'); await ui.click('بررسی دوبارهٔ همین ثبت');
    assert.equal(posts, 1); assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, true);
    assert.throws(() => ui.button('ارسال دوبارهٔ همین ثبت'));
  } finally { restore(); }
});

function workbookBrowserFixture() {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const oldFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: () => true, addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  return () => {
    globalThis.fetch = oldFetch;
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document');
  };
}

// Actual default transport + handlers; only fetch is replaced by the existing
// in-memory server fixture. No browser, DB, model or external HTTP is involved.
for (const phase of ['fetch', 'body'] as const) test(`default workbook creation: ${phase} hang preserves the exact attempt for explicit recovery`, async t => {
  const restore = workbookBrowserFixture(), fixture = createP07WorkflowFixture();
  const bodies: string[] = [], signals: AbortSignal[] = [];
  let finishLate: (() => void) | undefined;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (url, init) => {
    const result = await fixture.transport(String(url), init);
    const response = Response.json(result.body, { status: result.status });
    if (init?.method !== 'POST') return response;
    bodies.push(String(init.body)); signals.push(init.signal as AbortSignal);
    if (bodies.length > 1) return response;
    // Commit happened, but fetch/body ignores abort and completes much later.
    if (phase === 'fetch') return new Promise<Response>(resolve => { finishLate = () => resolve(response); });
    response.json = () => new Promise(resolve => { finishLate = () => resolve(result.body); });
    return response;
  };
  try {
    const ui = mountComponent('components/admin/ResearchWorkbook.tsx', { initialWorkbook: p07FixtureWorkbook() }); await ui.settle();
    await ui.click('ذخیرهٔ نسخهٔ');
    assert.equal(fixture.snapshot().versions.length, 1);
    t.mock.timers.tick(14999); await ui.settle();
    assert.equal(ui.button('ذخیرهٔ نسخهٔ').props.disabled, true);
    t.mock.timers.tick(1); await ui.settle();
    assert.equal(ui.button('بررسی دوبارهٔ همین ثبت').props.disabled, false);
    assert.equal(signals[0].aborted, true);
    assert.equal(ui.button('تازه').props.disabled, true);
    assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, true);
    assert.equal(ui.find('input', e => e.props.id === 'title').props.value, p07FixtureWorkbook().title);
    assert.ok(finishLate); finishLate(); await ui.settle();
    assert.equal(ui.button('بررسی دوبارهٔ همین ثبت').props.disabled, false, 'late response cannot confirm the timed-out handler');
    await ui.click('بررسی دوبارهٔ همین ثبت');
    assert.equal(bodies.length, 1, 'recovery reads the saved version without another POST');
    const attempt = JSON.parse(bodies[0]); assert.equal(attempt.workbookId, attempt.creationId);
    assert.equal(fixture.snapshot().versions.length, 1, 'manual recovery reuses the first committed creation');
    assert.equal(ui.button('تازه').props.disabled, false);
  } finally { finishLate?.(); t.mock.timers.reset(); restore(); }
});

for (const phase of ['fetch', 'body'] as const) test(`default workbook listing: ${phase} hang reaches an actual retry without losing the draft`, async t => {
  const restore = workbookBrowserFixture(), fixture = createP07WorkflowFixture();
  let calls = 0, finishLate: (() => void) | undefined, signal: AbortSignal | undefined;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (url, init) => {
    const result = await fixture.transport(String(url), init);
    const response = Response.json(result.body, { status: result.status });
    if (++calls > 1) return response;
    signal = init?.signal as AbortSignal;
    if (phase === 'fetch') return new Promise<Response>(resolve => { finishLate = () => resolve(response); });
    response.json = () => new Promise(resolve => { finishLate = () => resolve(result.body); });
    return response;
  };
  try {
    const ui = mountComponent('components/admin/ResearchWorkbook.tsx', { initialWorkbook: p07FixtureWorkbook() }); await ui.settle();
    t.mock.timers.tick(15000); await ui.settle();
    assert.equal(signal?.aborted, true);
    await ui.click('بررسی دوبارهٔ ذخیرهٔ سروری');
    assert.equal(calls, 2);
    assert.equal(ui.button('ذخیرهٔ نسخهٔ').props.disabled, false);
    assert.equal(ui.find('input', e => e.props.id === 'title').props.value, p07FixtureWorkbook().title);
    assert.ok(finishLate); finishLate(); await ui.settle();
    assert.equal(ui.button('ذخیرهٔ نسخهٔ').props.disabled, false);
    assert.equal(calls, 2, 'late list completion does not trigger another read');
  } finally { finishLate?.(); t.mock.timers.reset(); restore(); }
});

for (const action of ['open', 'review'] as const) for (const phase of ['fetch', 'body'] as const) test(`default workbook ${action}: ${phase} hang releases controls and late completion cannot overwrite current state`, async t => {
  const restore = workbookBrowserFixture(), fixture = createP07WorkflowFixture(), path = '/api/admin/intelligence/workbooks';
  const saved = await fixture.transport(path, { method: 'POST', body: JSON.stringify({ action: 'save', baseVersion: 0, workbook: p07FixtureWorkbook() }) });
  let pause = false, finishLate: (() => void) | undefined, signal: AbortSignal | undefined;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (url, init) => {
    const result = await fixture.transport(String(url), init);
    const response = Response.json(result.body, { status: result.status });
    if (!pause || (action === 'open' ? !String(url).includes('?id=') : init?.method !== 'POST')) return response;
    pause = false; signal = init?.signal as AbortSignal;
    if (phase === 'fetch') return new Promise<Response>(resolve => { finishLate = () => resolve(response); });
    response.json = () => new Promise(resolve => { finishLate = () => resolve(result.body); });
    return response;
  };
  try {
    const ui = mountComponent('components/admin/ResearchWorkbook.tsx', { initialWorkbookId: String(saved.body.workbookId) }); await ui.settle();
    pause = true;
    await ui.click(action === 'open' ? p07FixtureWorkbook().title : 'تأیید داخلی نسخه');
    assert.equal(ui.button('تازه').props.disabled, true);
    t.mock.timers.tick(15000); await ui.settle();
    assert.equal(signal?.aborted, true);
    assert.equal(ui.button('تازه').props.disabled, false);
    assert.equal(ui.badge(), false, 'a timed-out review receipt is not a confirmed approval');
    const title = ui.find('input', e => e.props.id === 'title');
    (title.props.onChange as (event: unknown) => void)({ target: { value: 'Synthetic newer draft after deadline' } }); await ui.settle();
    assert.ok(finishLate); finishLate(); await ui.settle();
    assert.equal(ui.find('input', e => e.props.id === 'title').props.value, 'Synthetic newer draft after deadline');
    assert.equal(ui.badge(), false);
    // Explicit reopening independently reconciles a review that committed.
    await ui.click(p07FixtureWorkbook().title);
    assert.equal(ui.badge(), action === 'review');
    assert.equal(fixture.snapshot().reviews.length, action === 'review' ? 1 : 0);
  } finally { finishLate?.(); t.mock.timers.reset(); restore(); }
});

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

test('real workbook handler reads unknown creation without POST and never abandons it via New/edit',async()=>{
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
  await ui.click('بررسی دوبارهٔ همین ثبت');assert.equal(bodies.length,1);assert.equal(JSON.parse(bodies[0]).workbookId,JSON.parse(bodies[0]).creationId);assert.equal(fixture.snapshot().versions.length,1);
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
  await ui.click('بررسی دوبارهٔ همین ثبت');assert.equal(bodies.length,1);assert.equal(fixture.snapshot().versions.length,1);assert.equal(ui.find('input',e=>e.props.id==='title').props.value,'Synthetic late edit');assert.equal(ui.button('تأیید داخلی نسخه').props.disabled,true);
  (ui.find(ResearchPreparationFields,()=>true).props.onPendingChange as (pending:boolean)=>void)(false);await ui.settle();
  await ui.click('ذخیره به‌عنوان');assert.equal(fixture.snapshot().versions.length,2);assert.equal(fixture.snapshot().versions[1].workbookId,fixture.snapshot().versions[0].workbookId);assert.equal(fixture.snapshot().versions[1].title,'Synthetic late edit');
 }finally{release();if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');}
});

for (const initial of ['lost-response', 'initial-503'] as const) test(`creation ${initial} uses read-only recovery and requires a separate same-intent retry after proven absence`, async () => {
  const fixture = createP07WorkflowFixture(), bodies: string[] = [], responses: Record<string, unknown>[] = [];
  const readPaths: string[] = [];
  let recovering = false, release: (() => void) | undefined, fileReads = 0;
  const transport: WorkbookTransport = async (path, init) => {
    if (init?.method === 'POST') {
      bodies.push(String(init.body));
      if (bodies.length === 1) {
        if (initial === 'lost-response') { await fixture.transport(path, init); throw new Error('Synthetic committed response lost'); }
        fixture.failNext(503);
      }
    } else if (path.includes('?id=')) {
      readPaths.push(path);
      if (!recovering) return { status: 503, body: { unavailable: true } };
      await new Promise<void>(done => { release = done; });
    }
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
    assert.equal(ui.button('بررسی دوبارهٔ همین ثبت').props.disabled, false);
    assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, true);
    assert.equal(ui.button('ادامه از فایل').props.disabled, true);
    newHandler(); importHandler({ target: { files: [{ size: 1, text: async () => { fileReads++; return '{}'; } }] } });
    (ui.find('input', e => e.props.id === 'title').props.onChange as (e: unknown) => void)({ target: { value: 'Forbidden replacement' } }); await ui.settle();
    assert.equal(fileReads, 0); assert.equal(ui.find('input', e => e.props.id === 'title').props.value, p07FixtureWorkbook().title);
    await ui.click('بررسی دوبارهٔ همین ثبت');
    assert.equal(bodies.length, 1, 'unavailable read cannot become a write');
    assert.equal(fixture.snapshot().versions.length, initial === 'lost-response' ? 1 : 0, 'unavailable rejection cannot bypass the writer gate');
    recovering = true;
    const retry = ui.button('بررسی دوبارهٔ همین ثبت').props.onClick as () => void;
    retry(); const inflight = readPaths.length; retry(); await ui.settle();
    assert.equal(readPaths.length, inflight); assert.equal(bodies.length, 1); assert.equal(ui.button('بررسی دوبارهٔ همین ثبت').props.disabled, true);
    assert.ok(release); release(); await ui.settle();
    if (initial === 'initial-503') {
      assert.equal(fixture.snapshot().versions.length, 0);
      assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, true, '404 is not a successful save');
      await ui.click('ارسال دوبارهٔ همین ثبت');
      assert.equal(bodies.length, 2);
    } else assert.equal(bodies.length, 1);
    assert.ok(bodies.every(body => body === bodies[0]));
    const envelope = JSON.parse(bodies[0]); assert.equal(envelope.workbookId, envelope.creationId);
    const stored = fixture.snapshot().versions; assert.equal(stored.length, 1); assert.equal(stored[0].workbookId, envelope.creationId);
    const recovered = responses.findLast(body => body.workbookId === envelope.creationId && typeof body.savedAt === 'string')!;
    assert.equal(recovered.savedAt, stored[0].createdAt); assert.equal(recovered.workbookId, stored[0].workbookId); assert.equal(recovered.version, 1);
    assert.ok(readPaths.every(path => path.endsWith(`?id=${envelope.creationId}&version=1`)));
    if (initial === 'lost-response') assert.equal(recovered.authorMatchesSession, true);
    assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, false); assert.equal(ui.button('تازه').props.disabled, false);
  } finally {
    release?.();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});

for (const [label, change] of [
  ['body', (body: Record<string, unknown>) => ({ ...body, workbook: { ...(body.workbook as object), title: 'Different stored content' } })],
  ['author', (body: Record<string, unknown>) => ({ ...body, authorMatchesSession: false })],
  ['version', (body: Record<string, unknown>) => ({ ...body, version: 2 })],
  ['stale', (body: Record<string, unknown>) => ({ ...body, latestVersion: 2 })],
  ['time', (body: Record<string, unknown>) => ({ ...body, savedAt: 'invalid' })],
  ['id', (body: Record<string, unknown>) => ({ ...body, workbookId: '11111111-1111-4111-8111-111111111111' })],
] as const) test(`unknown creation rejects ${label} mismatch without POST or replacing the pending draft`, async () => {
  const restore = workbookBrowserFixture(), fixture = createP07WorkflowFixture();
  let posts = 0, altered = true;
  const reads: string[] = [];
  const transport: WorkbookTransport = async (path, init) => {
    if (init?.method === 'POST') { posts++; await fixture.transport(path, init); throw new Error('Synthetic lost response'); }
    const result = await fixture.transport(path, init);
    if (path.includes('?id=')) { reads.push(path); return altered ? { status: result.status, body: change(result.body) } : result; }
    return result;
  };
  try {
    const ui = mountComponent('components/admin/ResearchWorkbook.tsx', { transport, initialWorkbook: p07FixtureWorkbook() }); await ui.settle();
    await ui.click('ذخیرهٔ نسخهٔ'); await ui.click('بررسی دوبارهٔ همین ثبت');
    assert.equal(posts, 1); assert.equal(fixture.snapshot().versions.length, 1);
    assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, true);
    assert.equal(ui.find('input', e => e.props.id === 'title').props.value, p07FixtureWorkbook().title);
    altered = false; await ui.click('بررسی دوبارهٔ همین ثبت');
    assert.equal(posts, 1); assert.equal(new Set(reads).size, 1);
    assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, false);
  } finally { restore(); }
});

test('a generic or wrong-ID 404 never confirms absence or enables a write retry', async () => {
  const restore = workbookBrowserFixture(), fixture = createP07WorkflowFixture();
  let posts = 0;
  const transport: WorkbookTransport = async (path, init) => {
    if (init?.method === 'POST') { posts++; return { status: 503, body: { unavailable: true } }; }
    if (path.includes('?id=')) return { status: 404, body: { absent: true, workbookId: 'wrong-id', requestedVersion: 1 } };
    return fixture.transport(path, init);
  };
  try {
    const ui = mountComponent('components/admin/ResearchWorkbook.tsx', { transport, initialWorkbook: p07FixtureWorkbook() }); await ui.settle();
    await ui.click('ذخیرهٔ نسخهٔ'); await ui.click('بررسی دوبارهٔ همین ثبت');
    assert.equal(posts, 1); assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, true);
    assert.throws(() => ui.button('ارسال دوبارهٔ همین ثبت'));
  } finally { restore(); }
});

test('a stale retry handler cannot write after a newer recovery invalidates its absence proof', async () => {
  const restore = workbookBrowserFixture(), fixture = createP07WorkflowFixture();
  const bodies: string[] = [];
  let unavailable = false;
  const transport: WorkbookTransport = async (path, init) => {
    if (init?.method === 'POST') {
      bodies.push(String(init.body));
      if (bodies.length === 1) return { status: 503, body: { unavailable: true } };
    } else if (path.includes('?id=') && unavailable) return { status: 503, body: { unavailable: true } };
    return fixture.transport(path, init);
  };
  try {
    const ui = mountComponent('components/admin/ResearchWorkbook.tsx', { transport, initialWorkbook: p07FixtureWorkbook() }); await ui.settle();
    await ui.click('ذخیرهٔ نسخهٔ'); await ui.click('بررسی دوبارهٔ همین ثبت');
    const oldRetry = ui.button('ارسال دوبارهٔ همین ثبت').props.onClick as () => void;
    unavailable = true; await ui.click('بررسی دوبارهٔ همین ثبت'); oldRetry(); await ui.settle();
    assert.equal(bodies.length, 1); assert.equal(fixture.snapshot().versions.length, 0);
    assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, true);
    unavailable = false; await ui.click('بررسی دوبارهٔ همین ثبت'); await ui.click('ارسال دوبارهٔ همین ثبت');
    assert.equal(bodies.length, 2); assert.equal(bodies[1], bodies[0]); assert.equal(fixture.snapshot().versions.length, 1);
  } finally { restore(); }
});

for (const phase of ['fetch', 'body'] as const) test(`read-only recovery ${phase} timeout keeps the attempt locked and ignores late success`, async t => {
  const restore = workbookBrowserFixture(), fixture = createP07WorkflowFixture();
  let posts = 0, reads = 0, finishLate: (() => void) | undefined;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (path, init) => {
    const result = await fixture.transport(String(path), init);
    if (init?.method === 'POST') { posts++; return Response.json({ error: 'Synthetic lost response' }, { status: 500 }); }
    const response = Response.json(result.body, { status: result.status });
    if (!String(path).includes('?id=') || ++reads > 1) return response;
    if (phase === 'fetch') return new Promise<Response>(resolve => { finishLate = () => resolve(response); });
    response.json = () => new Promise(resolve => { finishLate = () => resolve(result.body); });
    return response;
  };
  try {
    const ui = mountComponent('components/admin/ResearchWorkbook.tsx', { initialWorkbook: p07FixtureWorkbook() }); await ui.settle();
    await ui.click('ذخیرهٔ نسخهٔ'); await ui.click('بررسی دوبارهٔ همین ثبت');
    assert.equal(ui.button('بررسی دوبارهٔ همین ثبت').props.disabled, true);
    t.mock.timers.tick(15000); await ui.settle();
    assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, true);
    assert.equal(posts, 1); assert.ok(finishLate); finishLate(); await ui.settle();
    assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, true);
    await ui.click('بررسی دوبارهٔ همین ثبت');
    assert.equal(posts, 1); assert.equal(reads, 2); assert.equal(fixture.snapshot().versions.length, 1);
    assert.equal(ui.find('input', e => e.props.id === 'title').props.disabled, false);
  } finally { finishLate?.(); t.mock.timers.reset(); restore(); }
});
