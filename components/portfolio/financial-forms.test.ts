import { test } from "node:test";
import assert from "node:assert/strict";
import { mountFinancialForm } from "./financial-form-test-host";
import { postFinancialSnapshot } from "../../lib/portfolio/financialHttp";
const receipt = { version_id: "11111111-1111-4111-8111-111111111111", version: 2, position_count: 1, reused: false };
const asset = { positionKey: "gold", manualLabel: "طلای ساختگی", symbol: null, assetClass: "gold", qty: null, unit: "قلم", costBasis: null, asOf: "2026-10-03", ownershipPct: 50, valuationMode: "declared", declaredValue: 2000, valuationSource: "ساختگی", valuationAsOf: "2026-10-03", valuationStatus: "valid" };
const debt = { debt_key: "d", title: "وام ساختگی", kind: "loan", balance_toman: 1500, currency: "IRT", balance_as_of: "2026-10-03", next_installment_toman: null, next_due_on: null, note: null };
for(const kind of ["holdings", "debts"] as const) {
 const mount = () => kind === "holdings" ? mountFinancialForm("components/portfolio/HoldingsWorkbench.tsx", { ready: true, targetFailed: false, activeVersion: 1, latestVersion: 1, history: [], activePositions: [asset], rows: [], gaps: [], definitive: false, notes: [], totalValue: null, showComparison: false, showImport: false }) : mountFinancialForm("components/portfolio/DebtsWorkbench.tsx", { ready: true, activeVersion: 1, latestVersion: 1, debts: [debt] });
 const saveLabel = kind === "holdings" ? "ذخیرهٔ نسخهٔ تازه" : "ذخیرهٔ بدهی‌ها";
 for(const retry of [{status:401,body:"valid"},{status:403,body:"valid"},{status:429,body:"valid"},{status:404,body:"valid"},{status:408,body:"valid"},{status:400,body:"valid"},{status:400,body:"non-json"},{status:409,body:"non-json"},{status:409,body:"non-canonical"}])test(`${kind} actual form: lost commit then retry ${retry.status}/${retry.body} retains original attempt until recovery`,async()=>{
  const prior=globalThis.fetch,bodies:string[]=[];let stored:string|null=null,writes=0;
  globalThis.fetch=async(url,options)=>{
   bodies.push(String(options?.body));
   if(bodies.length === 2)return retry.body === "non-json" ? new Response("Synthetic gateway HTML",{status:retry.status}) : Response.json({error:"Synthetic denied retry"},{status:retry.status});
   const result=await postFinancialSnapshot(new Request(`http://localhost${url}`,options),kind,async()=>({async authenticate(){return {user:{id:"synthetic-owner"},error:false};},async rpc(_name,args){const value=JSON.stringify(args);if(stored!==null && stored!==value)return {data:null,error:{code:"PT409"}};const reused=stored!==null;if(!reused){stored=value;writes++;}return {data:[{...receipt,reused}],error:null};}}));
   if(bodies.length === 1)throw new Error("Synthetic response lost after commit");return result;
  };
  try {
   const ui=mount();await ui.submit(saveLabel);await ui.submit("بررسی دوبارهٔ همین ثبت");
   assert.equal(bodies[1],bodies[0]);assert.equal(writes,1);assert.equal(ui.navigation.length,0);
   assert.ok(ui.elements().filter(e=>["input","select","textarea"].includes(String(e.type))).every(e=>e.props.disabled === true));
   assert.equal(ui.button(kind === "holdings"?"افزودن قلم":"افزودن بدهی").props.disabled,true);
   await ui.submit("بررسی دوبارهٔ همین ثبت");assert.equal(bodies[2],bodies[0]);assert.equal(writes,1);assert.equal(ui.navigation.length,1);
   assert.match(ui.navigation[0],new RegExp(receipt.version_id));
  }finally{globalThis.fetch=prior;}
 });
 for(const deniedResponse of [{status:404,body:"valid"},{status:408,body:"valid"},{status:400,body:"non-json"},{status:409,body:"non-json"}])test(`${kind} actual form: initial ${deniedResponse.status}/${deniedResponse.body} is unknown and retries exact request`,async()=>{
  const prior=globalThis.fetch,bodies:string[]=[];
  globalThis.fetch=async(_url,options)=>{bodies.push(String(options?.body));return bodies.length === 1 ? deniedResponse.body === "non-json" ? new Response("Synthetic gateway HTML",{status:deniedResponse.status}) : Response.json({error:"Synthetic gateway error"},{status:deniedResponse.status}) : Response.json(receipt);};
  try {
   const ui=mount();await ui.submit(saveLabel);assert.ok(ui.elements().filter(e=>e.type === "input").every(e=>e.props.disabled === true));
   await ui.submit("بررسی دوبارهٔ همین ثبت");assert.equal(bodies[1],bodies[0]);assert.equal(ui.navigation.length,1);
  }finally{globalThis.fetch=prior;}
 });
 test(`${kind} actual form: only canonical CAS response after unknown enters conflict review without overwriting`,async()=>{
  const prior=globalThis.fetch,bodies:string[]=[];
  globalThis.fetch=async(url,options)=>{bodies.push(String(options?.body));if(bodies.length === 1)throw new Error("Synthetic unanswered request");return postFinancialSnapshot(new Request(`http://localhost${url}`,options),kind,async()=>({async authenticate(){return {user:{id:"synthetic-owner"},error:false};},async rpc(){return {data:null,error:{code:"PT409"}};}}));};
  try {const ui=mount();await ui.submit(saveLabel);await ui.submit("بررسی دوبارهٔ همین ثبت");assert.equal(bodies[1],bodies[0]);assert.equal(ui.button(saveLabel).props.disabled,true);assert.equal(ui.navigation.length,0);assert.equal(ui.find("a",e=>e.props.href === "/dashboard/holdings").props.target,"_blank");assert.equal(JSON.parse(bodies[1]).base_version,1);}finally{globalThis.fetch=prior;}
 });
 test(`${kind} actual form: committed response lost freezes all editing; retry preserves exact request and reuses version`, async()=>{
  const prior = globalThis.fetch, bodies: string[] = []; let stored: string | null = null, writes = 0;
  globalThis.fetch = async (url, options) => {
   bodies.push(String(options?.body));
   const result = await postFinancialSnapshot(new Request(`http://localhost${url}`, options), kind, async()=>({ async authenticate(){return { user: { id: "synthetic-owner" }, error: false };}, async rpc(_name, args){const value=JSON.stringify(args); if(stored !== null && stored !== value) return { data: null, error: { code: "PT409" } }; const reused=stored !== null; if(!reused){stored=value;writes++;} return { data: [{ ...receipt, reused }], error: null };} }));
   if(bodies.length === 1) throw new Error("Synthetic response lost after commit"); return result;
  };
  try {
   const ui = mount(); await ui.submit(saveLabel);
   assert.equal(writes, 1); assert.equal(ui.navigation.length, 0);
   const editControls=ui.elements().filter(e=>["input","select","textarea"].includes(String(e.type)));
   assert.ok(editControls.length > 0); assert.ok(editControls.every(e=>e.props.disabled === true));
   assert.equal(ui.button(kind === "holdings" ? "افزودن قلم" : "افزودن بدهی").props.disabled, true);
   assert.equal(ui.find("button", e=>e.props["aria-label"] === "حذف قلم از نسخهٔ تازه" || String(e.props.children).includes("حذف از نسخهٔ تازه")).props.disabled, true);
   await ui.submit("بررسی دوبارهٔ همین ثبت");
   assert.equal(bodies[1], bodies[0]); assert.equal(writes, 1); assert.equal(ui.navigation.length, 1); assert.match(ui.navigation[0], new RegExp(receipt.version_id));
  } finally { globalThis.fetch = prior; }
 });
 for(const unknown of ["503", "malformed-success", "wrong-version", "wrong-count"])test(`${kind} actual form: ${unknown} keeps draft frozen and same token/body on retry`,async()=>{
  const prior=globalThis.fetch,bodies:string[]=[];
  globalThis.fetch=async(_url, options)=>{bodies.push(String(options?.body));return bodies.length === 1 ? unknown === "503" ? new Response("service unavailable",{status:503}) : Response.json(unknown === "wrong-version" ? {...receipt,version:9} : unknown === "wrong-count" ? {...receipt,position_count:2} : { version: 2 }) : Response.json({...receipt,reused:true});};
  try {const ui=mount();await ui.submit(saveLabel);assert.ok(ui.elements().filter(e=>e.type === "input").every(e=>e.props.disabled === true));await ui.submit("بررسی دوبارهٔ همین ثبت");assert.equal(bodies[1],bodies[0]);assert.equal(ui.navigation.length,1);}finally{globalThis.fetch=prior;}
 });
 test(`${kind} actual form: definitive rejection allows corrected draft with a fresh token; conflict never silently rebases`,async()=>{
  const prior=globalThis.fetch,bodies:string[]=[];
  globalThis.fetch=async(url, options)=>{bodies.push(String(options?.body));return bodies.length === 1 ? Response.json({error:"Synthetic rejection"},{status:400}) : postFinancialSnapshot(new Request(`http://localhost${url}`,options),kind,async()=>({async authenticate(){return {user:{id:"synthetic-owner"},error:false};},async rpc(){return {data:null,error:{code:"PT409"}};}}));};
  try {
   const ui=mount();await ui.submit(saveLabel);
   const field=ui.find("input",e=>kind === "holdings" ? e.props["aria-label"] === "عنوان دارایی دستی" : e.props.value === "1500");assert.equal(field.props.disabled,false);
   (field.props.onChange as (e:{target:{value:string}})=>void)({target:{value:kind === "holdings"?"بازبینی":"1600"}});ui.render();
   await ui.submit(saveLabel);assert.notEqual(JSON.parse(bodies[0]).client_token,JSON.parse(bodies[1]).client_token);
   assert.notEqual(bodies[0],bodies[1]);assert.equal(ui.navigation.length,0);assert.equal(ui.button(saveLabel).props.disabled,true);
   assert.equal(ui.find("a",e=>e.props.href === "/dashboard/holdings").props.target,"_blank");assert.equal(JSON.parse(bodies[1]).base_version,1);
  }finally{globalThis.fetch=prior;}
 });
}

// The same page-local coordinator is used by the actual wrapper and both handlers.
import { createFinancialEditor, type FinancialEditorKind } from "./financialEditor";
import { readFileSync } from "node:fs";
const labelFor = (kind: FinancialEditorKind) => kind === "holdings" ? "ذخیرهٔ نسخهٔ تازه" : "ذخیرهٔ بدهی‌ها";
function pair(version = 1, editor = createFinancialEditor()) {
 const holdings=mountFinancialForm("components/portfolio/HoldingsWorkbench.tsx",{ready:true,targetFailed:false,activeVersion:version,latestVersion:version,history:[],activePositions:[asset],rows:[],gaps:[],definitive:false,notes:[],totalValue:null,showComparison:false,showImport:false},editor);
 const debts=mountFinancialForm("components/portfolio/DebtsWorkbench.tsx",{ready:true,activeVersion:version,latestVersion:version,debts:[debt]},editor);
 return {holdings,debts,editor,render(){holdings.render();debts.render();}};
}
function change(ui: ReturnType<typeof mountFinancialForm>, kind: FinancialEditorKind, value: string) {
 const input=ui.find("input",e=>kind === "holdings" ? e.props["aria-label"] === "عنوان دارایی دستی" : e.props.value === "1500");
 (input.props.onChange as (event:{target:{value:string}})=>void)({target:{value}});
 ui.render();
}
for(const first of ["holdings","debts"] as const) {
 const second=first === "holdings" ? "debts" : "holdings";
 test(`${first} first: normal save navigates to receipt, remount lets ${second} save on new base`,async()=>{
  const prior=globalThis.fetch,bodies:Record<string,unknown>[]=[];
  globalThis.fetch=async(_url,options)=>{bodies.push(JSON.parse(String(options?.body)));return Response.json({...receipt,version:bodies.length+1,version_id:bodies.length === 1?receipt.version_id:"22222222-2222-4222-8222-222222222222"});};
  try {
   const page=pair();change(page[first],first,first === "holdings"?"ویرایش ساختگی":"1600");page.render();
   assert.equal(page[second].button(labelFor(second)).props.disabled,true);
   await page[first].submit(labelFor(first));page.render();
   assert.equal(page[first].navigation[0],`/dashboard/holdings?v=${receipt.version_id}`);assert.equal(page[first].refreshes,1);
   assert.equal(page.editor.navigating,true);assert.equal(page[second].button(labelFor(second)).props.disabled,true);
   assert.match(page[first].text(),/خلاصه و سابقهٔ این صفحه هنوز مربوط به نسخهٔ قبلی‌اند/);
   // Returned UUID changes the real page wrapper key, giving both forms a new lease/base.
   const reloaded=pair(2);change(reloaded[second],second,second === "holdings"?"ویرایش ساختگی":"1700");reloaded.render();
   assert.equal(reloaded[second].button(labelFor(second)).props.disabled,false);
   await reloaded[second].submit(labelFor(second));
   assert.deepEqual(bodies.map(body=>body.base_version),[1,2]);assert.equal(reloaded[second].navigation.length,1);
  }finally{globalThis.fetch=prior;}
 });
 test(`${first} draft prevents sibling edits/stale submit; explicit cancel restores original and releases ${second}`,async()=>{
  const prior=globalThis.fetch;let writes=0;globalThis.fetch=async()=>{writes++;return Response.json(receipt);};
  try {
   const page=pair();
   const staleEdit=page[second].find("input",e=>second === "holdings"?e.props["aria-label"] === "عنوان دارایی دستی":e.props.value === "1500").props.onChange as (event:{target:{value:string}})=>void;
   const staleSave=second === "holdings"? page.holdings.button(labelFor(second)).props.onClick as ()=>Promise<void> : ()=> (page.debts.find("form",()=>true).props.onSubmit as (event:{preventDefault():void})=>Promise<void>)({preventDefault(){}});
   change(page[first],first,first === "holdings"?"پیش‌نویس ساختگی":"1600");page.render();
   staleEdit({target:{value:"stale"}});await staleSave();page.render();assert.equal(writes,0);
   assert.equal(page[second].find("input",e=>second === "holdings"?e.props["aria-label"] === "عنوان دارایی دستی":e.props.value === "1500").props.value,second === "holdings"?asset.manualLabel:"1500");
   assert.equal(page[first].beforeUnload(),true);
   await page[first].submit("لغو تغییرات");page.render();assert.equal(page.editor.active,null);assert.equal(page[first].beforeUnload(),false);
   assert.equal(page[first].find("input",e=>first === "holdings"?e.props["aria-label"] === "عنوان دارایی دستی":e.props.value === "1500").props.value,first === "holdings"?asset.manualLabel:"1500");
   assert.equal(page[second].button(labelFor(second)).props.disabled,false);
   await page[second].submit(labelFor(second));assert.equal(writes,1);assert.equal(page[second].navigation.length,1);
  }finally{globalThis.fetch=prior;}
 });
 test(`${first} pending/unknown attempt blocks cancel and ${second}; retry exact body returns UUID without duplicate write`,async()=>{
  const prior=globalThis.fetch,bodies:string[]=[];let resolve!: (response:Response)=>void;
  globalThis.fetch=async(_url,options)=>{bodies.push(String(options?.body));return bodies.length === 1 ? new Promise<Response>(done=>{resolve=done;}) : Response.json({...receipt,reused:true});};
  try {
   const page=pair();const saving=page[first].submit(labelFor(first));page.render();
   assert.equal(page[second].button(labelFor(second)).props.disabled,true);assert.equal(page[first].button("لغو تغییرات").props.disabled,true);assert.equal(page[first].beforeUnload(),true);
   const cancel=page[first].button("لغو تغییرات").props.onClick as ()=>void;cancel();page.render();assert.equal(page.editor.active,first);
   resolve(new Response("synthetic unavailable",{status:503}));await saving;page.render();
   assert.equal(page[first].button("لغو تغییرات").props.disabled,true);cancel();page.render();assert.equal(page.editor.active,first);
   assert.equal(page[second].button(labelFor(second)).props.disabled,true);assert.equal(page[first].beforeUnload(),true);
   await page[first].submit("بررسی دوبارهٔ همین ثبت");page.render();assert.equal(bodies[0],bodies[1]);assert.equal(page[first].navigation[0],`/dashboard/holdings?v=${receipt.version_id}`);assert.equal(page[first].beforeUnload(),false);
  }finally{globalThis.fetch=prior;}
 });
 test(`${first} external-device CAS409 keeps original base/draft, blocks ${second}, then allows explicit discard`,async()=>{
  const prior=globalThis.fetch,bodies:Record<string,unknown>[]=[];
  globalThis.fetch=async(url,options)=>{bodies.push(JSON.parse(String(options?.body)));return postFinancialSnapshot(new Request(`http://localhost${url}`,options),first,async()=>({async authenticate(){return {user:{id:"synthetic-owner"},error:false};},async rpc(){return {data:null,error:{code:"PT409"}};}}));};
  try {
   const page=pair();change(page[first],first,first === "holdings"?"پیش‌نویس ساختگی":"1600");await page[first].submit(labelFor(first));page.render();
   assert.equal(bodies[0].base_version,1);assert.equal(page[first].navigation.length,0);
   assert.equal(page[first].find("input",e=>first === "holdings"?e.props["aria-label"] === "عنوان دارایی دستی":e.props.value === "1600").props.value,first === "holdings"?"پیش‌نویس ساختگی":"1600");
   assert.equal(page[first].button(labelFor(first)).props.disabled,true);assert.equal(page[second].button(labelFor(second)).props.disabled,true);
   assert.equal(page[first].find("a",e=>e.props.href === "/dashboard/holdings").props.target,"_blank");
   assert.equal(page[first].button("لغو تغییرات").props.disabled,false);await page[first].submit("لغو تغییرات");page.render();assert.equal(page.editor.active,null);assert.equal(page[first].beforeUnload(),false);
  }finally{globalThis.fetch=prior;}
 });
}
test("actual FinancialEditors wrapper rerenders lease status and page keys it by returned snapshot identity",()=>{
 const ui=mountFinancialForm("components/portfolio/FinancialEditors.tsx",{children:null});
 const context=()=>ui.elements().find(element=>typeof element.props.value === "object" && element.props.value !== null)!;
 const lease=context().props.value as ReturnType<typeof createFinancialEditor>;
 assert.equal(lease.acquire("holdings"),true);assert.equal(lease.acquire("debts"),false);ui.render();assert.match(ui.text(),/لغو تغییرات/);
 lease.release("holdings");ui.render();assert.equal((context().props.value as ReturnType<typeof createFinancialEditor>).active,null);
 lease.acquire("debts");lease.navigate("debts");ui.render();assert.match(ui.text(),/نسخهٔ قبلی/);
 const page=readFileSync("app/(protected)/dashboard/holdings/page.tsx","utf8");
 assert.match(page,/<FinancialEditors key=\{`financial-editors-\$\{snapshot.holdings\?\.id \?\? "new"\}`\}>[\s\S]*<HoldingsWorkbench[\s\S]*<DebtsWorkbench[\s\S]*<\/FinancialEditors>/);
});
