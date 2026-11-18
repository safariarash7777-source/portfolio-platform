import test from "node:test";import assert from "node:assert/strict";
import React from "react";import ts from "typescript";import {readFileSync} from "node:fs";import {createRequire} from "node:module";import {resolve} from "node:path";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
type Element=React.ReactElement<Record<string,unknown>>;
const nodes=(n:unknown):Element[]=>Array.isArray(n)?n.flatMap(nodes):React.isValidElement(n)?[n as Element,...nodes((n.props as {children?:unknown}).children)]:[];
const words=(n:unknown):string=>Array.isArray(n)?n.map(words).join(''):React.isValidElement(n)?words((n.props as {children?:unknown}).children):typeof n==='string'?n:'';
function mount(){
 const slots:unknown[]=[];let cursor=0,tree:unknown;const effects:(()=>void)[]=[],cleanups:(()=>void)[]=[];let posted:Record<string,unknown>|null=null,confirmed=false;const methods:string[]=[];
 const data={ownerId:id(9),snapshot:{id:id(3),payload:{entries:[{entryKey:'payment',basis:'actual',kind:'expense',amountToman:300,occurredOn:'2026-11-17',source:{label:'synthetic',observedOn:'2026-11-17'}}]}}};
 const hooks={...React,useState(initial:unknown){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],(next:unknown)=>{slots[i]=next;}];},useRef(initial:unknown){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn:()=>void|(()=>void),deps:unknown[]){const i=cursor++;if(!(i in slots)){slots[i]=deps;effects.push(()=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);});}}};
 const transport=async(url:string,init:RequestInit={})=>{methods.push(init.method??'GET');if(init.method==='POST'){posted=JSON.parse(String(init.body));throw Error('synthetic lost acknowledgement');}
  if(url==='/api/portfolio/holdings')return Response.json({ownerId:id(9),state:'ready',version:{id:id(2)},debts:[{debt_key:'loan',title:'وام آزمایشی',next_installment_toman:1000,next_due_on:'2026-11-17'}]});
  return Response.json({ownerId:id(9),version:confirmed?1:0,payments:confirmed?[{id:id(4),version:1,payment_key:posted!.paymentKey,action:'record',debt_key:'loan',due_on:'2026-11-17',installment_toman:1000,amount_toman:300,principal_toman:null,interest_toman:null,cash_matches:true,client_token:posted!.clientToken,request:posted}]:[]});
 };
 const filename=resolve('components/portfolio/cashflow/InstallmentPayments.tsx'),local=createRequire(filename),mod={exports:{} as {default:(props:unknown)=>unknown}};
 const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017,jsx:ts.JsxEmit.React,esModuleInterop:true},fileName:filename}).outputText;
 new Function('require','module','exports','React','fetch',code)((name:string)=>name==='react'?hooks:local(name.startsWith('@/')?resolve(name.slice(2)):name),mod,mod.exports,React,transport);
 const render=()=>{cursor=0;tree=mod.exports.default({data,disabled:false});effects.splice(0).forEach(f=>f());};
 const flush=async()=>{for(let i=0;i<4;i++){await new Promise(r=>setImmediate(r));render();}};
 const click=async(label:string)=>{const b=nodes(tree).find(x=>x.type==='button'&&words(x).includes(label));assert.ok(b);(b.props.onClick as ()=>void)();render();await flush();};
 render();return {flush,click,methods,text:()=>words(tree),fields:()=>nodes(tree).filter(n=>n.type==='fieldset'),select:()=>{nodes(tree).filter(n=>n.type==='select').forEach((n,i)=>(n.props.onChange as (e:unknown)=>void)({target:{value:i?'payment':'loan'}}));render();},confirm:()=>{confirmed=true;},unmount:()=>cleanups.forEach(f=>f())};
}
test('actual installment handler keeps lost-ack intent, disables new writes, and reconciles by GET only',async()=>{
 const h=mount();await h.flush();h.select();await h.click('اتصال پرداخت');assert.equal(h.methods.filter(m=>m==='POST').length,1);assert.match(h.text(),/نامعلوم/);assert.equal(h.fields()[0].props.disabled,true);
 await h.click('بازخوانی دفتر');assert.equal(h.methods.filter(m=>m==='POST').length,1);assert.match(h.text(),/هنوز مشخص نیست/);
 h.confirm();await h.click('بازخوانی دفتر');assert.equal(h.fields()[0].props.disabled,false);assert.match(h.text(),/مستقل بازخوانی شد/);assert.match(h.text(),/۷۰۰/);assert.equal(h.methods.filter(m=>m==='POST').length,1);h.unmount();
});

