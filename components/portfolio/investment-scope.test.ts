import { test } from "node:test";
import assert from "node:assert/strict";
import { mountFinancialForm } from "./financial-form-test-host";
import { postInvestmentScope } from "../../lib/portfolio/scopeHttp";
import type { ScopeRead } from "../../lib/portfolio/scopeContract";

const holdingId = "11111111-1111-4111-8111-111111111111";
const receipt = { id: "22222222-2222-4222-8222-222222222222", scopeVersion: 1, holdingVersionId: holdingId, holdingVersion: 1, rulesVersion: "member-selected.v0.1", memberConfirmedAt: "2026-10-09T12:00:00Z", assignments: [{ positionKey: "gold", use: "allocatable" }], reused: false };
const mount = () => {
  const ui = mountFinancialForm("components/portfolio/InvestmentScopeWorkbench.tsx", { holdings: { id: holdingId, version: 1, positions: [{ positionKey: "gold", manualLabel: "طلای ساختگی", symbol: null, assetClass: "gold", qty: null, unit: "قلم", costBasis: null, asOf: "2026-10-09", ownershipPct: 50, valuationMode: "declared", declaredValue: 2000, valuationSource: "ساختگی", valuationAsOf: "2026-10-09", valuationStatus: "valid" }] }, storedTarget: null, priceRows: [], pricesFailed: false, scopeState: { status: "ready", review: null }, editable: true });
  const select = ui.find("select", () => true);
  (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "allocatable" } }); ui.render(); return ui;
};
const save = "محدودهٔ این نسخه";
const retryLabel = "بررسی دوبارهٔ همین ثبت";

for (const phase of ["fetch", "body"] as const) test(`scope actual handler: ${phase} hang reaches unknown and exact retry recovers one late commit`, async t => {
  const prior = globalThis.fetch, bodies: string[] = [], signals: AbortSignal[] = [];
  let finishLate!: () => void, writes = 0, settled = false;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  globalThis.fetch = async (_url, options) => {
    bodies.push(String(options?.body)); signals.push(options?.signal as AbortSignal);
    if (bodies.length > 1) { assert.equal(writes, 1); return Response.json({ ...receipt, reused: true }); }
    if (phase === "fetch") return new Promise<Response>(resolve => { finishLate = () => { writes++; resolve(Response.json(receipt)); }; });
    writes++;
    const response = Response.json(receipt);
    response.json = () => new Promise((_resolve, reject) => { finishLate = () => reject(new Error("Synthetic late body rejection")); });
    return response;
  };
  try {
    const ui = mount(), saving = ui.submit(save).then(() => { settled = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    t.mock.timers.tick(14999); await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(settled, false);
    t.mock.timers.tick(1); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(settled, true, "a stalled scope response must become unknown rather than stay busy forever");
    await saving;
    assert.equal(signals[0].aborted, true); assert.equal(ui.button(retryLabel).props.disabled, false);
    assert.equal(ui.find("select", () => true).props.disabled, true); assert.equal(ui.beforeUnload(), true); assert.equal(ui.refreshes, 0);
    finishLate(); await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(ui.refreshes, 0);
    await ui.submit(retryLabel);
    assert.equal(bodies[1], bodies[0]); assert.equal(writes, 1); assert.equal(ui.refreshes, 1);
    assert.equal(ui.find("select", () => true).props.value, "allocatable");
    assert.equal(JSON.parse(bodies[1]).base_scope_version, 0);
  } finally { globalThis.fetch = prior; t.mock.timers.reset(); }
});

test('committed scope allows read-only refresh retries through stale/error/wrong receipts and unlocks only matching ready readback', async () => {
  const { createFinancialEditor } = await import('./financialEditor');
  const { scopeReviewFromStored } = await import('../../lib/portfolio/scopeContract');
  const editor = createFinancialEditor();
  const position = { positionKey: 'gold', manualLabel: 'synthetic gold', symbol: null, assetClass: 'gold', qty: null, unit: 'قلم', costBasis: null, asOf: '2026-10-09', ownershipPct: 50, valuationMode: 'declared', declaredValue: 2000, valuationSource: 'synthetic', valuationAsOf: '2026-10-09', valuationStatus: 'valid' };
  const holding = { id: holdingId, version: 1, positions: [position] };
  const stored = scopeReviewFromStored({ id: receipt.id, scope_version: 1, holding_version_id: holdingId, rules_version: receipt.rulesVersion, member_confirmed_at: receipt.memberConfirmedAt, assignments: receipt.assignments }, holding);
  const props = { holdings: holding, storedTarget: null, priceRows: [], pricesFailed: false, scopeState: { status: 'ready', review: null } as ScopeRead, editable: true };
  let scope = mountFinancialForm('components/portfolio/InvestmentScopeWorkbench.tsx', props, editor);
  const assets = mountFinancialForm('components/portfolio/HoldingsWorkbench.tsx', { ready: true, targetFailed: false, activeVersion: 1, latestVersion: 1, history: [], activePositions: [position], rows: [], gaps: [], definitive: false, notes: [], totalValue: null, showComparison: false, showImport: false }, editor);
  const prior = globalThis.fetch; let writes = 0;
  globalThis.fetch = async () => { writes++; return Response.json(receipt); };
  try {
    (scope.find('select', () => true).props.onChange as (e: unknown) => void)({ target: { value: 'allocatable' } }); scope.render();
    await scope.submit(save); assert.equal(writes, 1); assert.equal(scope.refreshes, 1);
    const readRetry = 'بررسی دوبارهٔ نسخهٔ ثبت‌شده';
    for (const state of [{ status: 'ready', review: null }, { status: 'error', review: null }, { status: 'ready', review: { ...stored, id: '33333333-3333-4333-8333-333333333333' } }, { status: 'error', review: stored }] as ScopeRead[]) {
      props.scopeState = state; scope.render(); assets.render();
      assert.equal(editor.navigating, true); assert.equal(scope.find('select', () => true).props.disabled, true); assert.equal(scope.button(save).props.disabled, true);
      assert.equal(assets.button('ذخیرهٔ نسخهٔ تازه').props.disabled, true);
      const before: number = scope.refreshes; await scope.submit(readRetry); await scope.submit(readRetry);
      assert.equal(scope.refreshes, before + 2); assert.equal(writes, 1, 'readback retry must never POST again');
    }
    // Retry remains visible across a remount while the provider retains the lease.
    props.scopeState = { status: 'error', review: null };
    scope = mountFinancialForm('components/portfolio/InvestmentScopeWorkbench.tsx', props, editor);
    await scope.submit(readRetry); assert.equal(writes, 1); assert.equal(editor.navigating, true);
    props.scopeState = { status: 'ready', review: stored }; scope.render(); scope.render(); assets.render();
    assert.equal(editor.navigating, false); assert.equal(editor.active, null);
    assert.equal(scope.find('select', () => true).props.disabled, false); assert.equal(assets.button('ذخیرهٔ نسخهٔ تازه').props.disabled, false);
    assert.equal(writes, 1);
  } finally { globalThis.fetch = prior; }
});

for (const retry of [{ status: 401, nonJson: false }, { status: 403, nonJson: false }, { status: 429, nonJson: false }, { status: 404, nonJson: false }, { status: 408, nonJson: false }, { status: 400, nonJson: false }, { status: 400, nonJson: true }, { status: 409, nonJson: true }, { status: 409, nonJson: false }]) test(`scope actual handler: lost commit then ${retry.status}/${retry.nonJson ? "HTML" : "non-canonical JSON"} preserves original replay`, async () => {
  const prior = globalThis.fetch, bodies: string[] = []; let stored: string | null = null, writes = 0;
  globalThis.fetch = async (url, options) => {
    bodies.push(String(options?.body));
    if (bodies.length === 2) return retry.nonJson ? new Response("Synthetic gateway HTML", { status: retry.status }) : Response.json({ error: "Synthetic retry failure" }, { status: retry.status });
    const response = await postInvestmentScope(new Request(`http://localhost${url}`, options), async () => ({ async authenticate() { return { user: { id: "synthetic-owner" }, error: false }; }, async rpc(_name, args) { const serialized = JSON.stringify(args); if (stored !== null && stored !== serialized) return { data: null, error: { code: "PT409" } }; const reused = stored !== null; if (!reused) { stored = serialized; writes++; } return { data: { ...receipt, reused }, error: null }; } }));
    if (bodies.length === 1) throw new Error("Synthetic reply lost after commit"); return response;
  };
  try {
    const ui = mount(); await ui.submit(save); await ui.submit(retryLabel);
    assert.equal(bodies[1], bodies[0]); assert.equal(writes, 1); assert.equal(ui.refreshes, 0);
    const select = ui.find("select", () => true); assert.equal(select.props.disabled, true);
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "excluded" } }); ui.render();
    assert.equal(ui.find("select", () => true).props.value, "allocatable");
    await ui.submit(retryLabel); assert.equal(bodies[2], bodies[0]); assert.equal(writes, 1); assert.equal(ui.refreshes, 1);
    assert.match(ui.text(), /تأیید ثبت‌شدهٔ این نسخه/); assert.equal(ui.button(save).props.disabled, true);
  } finally { globalThis.fetch = prior; }
});

for (const outcome of ["HTML400", "JSON404", "wrong-scope-version", "wrong-holding", "wrong-assignments", "missing-reused"]) test(`scope actual handler: initial ${outcome} freezes until matching receipt`, async () => {
  const prior = globalThis.fetch, bodies: string[] = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(String(options?.body));
    if (bodies.length > 1) return Response.json({ ...receipt, reused: true });
    if (outcome === "HTML400") return new Response("Synthetic HTML", { status: 400 });
    if (outcome === "JSON404") return Response.json({ error: "Synthetic missing route" }, { status: 404 });
    return Response.json(outcome === "wrong-scope-version" ? { ...receipt, scopeVersion: 9 } : outcome === "wrong-holding" ? { ...receipt, holdingVersionId: receipt.id } : outcome === "wrong-assignments" ? { ...receipt, assignments: [{ positionKey: "gold", use: "excluded" }] } : { ...receipt, reused: undefined });
  };
  try { const ui = mount(); await ui.submit(save); assert.equal(ui.find("select", () => true).props.disabled, true); assert.equal(ui.refreshes, 0); await ui.submit(retryLabel); assert.equal(bodies[1], bodies[0]); assert.equal(ui.refreshes, 1); } finally { globalThis.fetch = prior; }
});

test("scope actual handler: definitive first rejection permits correction; canonical CAS preserves draft without rebasing", async () => {
  const prior = globalThis.fetch, bodies: string[] = [];
  globalThis.fetch = async (url, options) => {
    bodies.push(String(options?.body));
    return bodies.length === 1 ? Response.json({ error: "Synthetic rejection" }, { status: 400 }) : postInvestmentScope(new Request(`http://localhost${url}`, options), async () => ({ async authenticate() { return { user: { id: "synthetic-owner" }, error: false }; }, async rpc() { return { data: null, error: { code: "PT409" } }; } }));
  };
  try {
    const ui = mount(); await ui.submit(save); const select = ui.find("select", () => true); assert.equal(select.props.disabled, false);
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "excluded" } }); ui.render(); await ui.submit(save);
    assert.notEqual(JSON.parse(bodies[0]).client_token, JSON.parse(bodies[1]).client_token); assert.equal(JSON.parse(bodies[1]).base_scope_version, 0);
    assert.equal(ui.find("select", () => true).props.value, "excluded"); assert.equal(ui.button(save).props.disabled, true); assert.equal(ui.refreshes, 0);
    assert.equal(ui.find("a", element => element.props.href === "/dashboard/holdings").props.target, "_blank");
  } finally { globalThis.fetch = prior; }
});

test('scope draft shares financial lease, cancel restores choices; pending/unknown scope keeps financial edits blocked until receipt readback',async()=>{
 const {createFinancialEditor}=await import('./financialEditor');const editor=createFinancialEditor();
 const position={positionKey:'gold',manualLabel:'synthetic gold',symbol:null,assetClass:'gold',qty:null,unit:'قلم',costBasis:null,asOf:'2026-10-09',ownershipPct:50,valuationMode:'declared',declaredValue:2000,valuationSource:'synthetic',valuationAsOf:'2026-10-09',valuationStatus:'valid'};
 const holding={id:holdingId,version:1,positions:[position]};
 const props={holdings:holding,storedTarget:null,priceRows:[],pricesFailed:false,scopeState:{status:'ready',review:null},editable:true};
 const scope=mountFinancialForm('components/portfolio/InvestmentScopeWorkbench.tsx',props,editor);
 const assets=mountFinancialForm('components/portfolio/HoldingsWorkbench.tsx',{ready:true,targetFailed:false,activeVersion:1,latestVersion:1,history:[],activePositions:[position],rows:[],gaps:[],definitive:false,notes:[],totalValue:null,showComparison:false,showImport:false},editor);
 const choose=scope.find('select',()=>true).props.onChange as (e:{target:{value:string}})=>void;
 choose({target:{value:'excluded'}});scope.render();assets.render();assert.equal(assets.button('ذخیرهٔ نسخهٔ تازه').props.disabled,true);assert.equal(scope.beforeUnload(),true);
 await scope.submit('لغو تغییرات محدوده');assets.render();assert.equal(assets.button('ذخیرهٔ نسخهٔ تازه').props.disabled,false);assert.equal(scope.find('select',()=>true).props.value,'unknown');
 choose({target:{value:'allocatable'}});scope.render();const prior=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{if(++calls===1)throw new Error('Synthetic response lost');return Response.json(receipt);};
 try {
  await scope.submit(save);assets.render();assert.equal(scope.button('لغو تغییرات محدوده').props.disabled,true);assert.equal(assets.button('ذخیرهٔ نسخهٔ تازه').props.disabled,true);
  await scope.submit(retryLabel);assets.render();assert.equal(scope.refreshes,1);assert.equal(editor.navigating,true);assert.equal(assets.button('ذخیرهٔ نسخهٔ تازه').props.disabled,true);
  const {scopeReviewFromStored}=await import('../../lib/portfolio/scopeContract');
  const stored=scopeReviewFromStored({id:receipt.id,scope_version:1,holding_version_id:holdingId,rules_version:receipt.rulesVersion,member_confirmed_at:receipt.memberConfirmedAt,assignments:receipt.assignments},holding);
  mountFinancialForm('components/portfolio/InvestmentScopeWorkbench.tsx',{...props,scopeState:{status:'ready',review:stored}},editor);assets.render();assert.equal(editor.active,null);assert.equal(assets.button('ذخیرهٔ نسخهٔ تازه').props.disabled,false);
 }finally{globalThis.fetch=prior;}
});
