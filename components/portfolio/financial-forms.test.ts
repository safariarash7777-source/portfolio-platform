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
 for(const status of [401,403,429])test(`${kind} actual form: lost commit then retry ${status} retains original attempt until access recovers`,async()=>{
  const prior=globalThis.fetch,bodies:string[]=[];let stored:string|null=null,writes=0;
  globalThis.fetch=async(url,options)=>{
   bodies.push(String(options?.body));
   if(bodies.length === 2)return Response.json({error:"Synthetic denied retry"},{status});
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
  globalThis.fetch=async(_url, options)=>{bodies.push(String(options?.body));return Response.json({error:"Synthetic rejection"},{status:bodies.length === 1?400:409});};
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
