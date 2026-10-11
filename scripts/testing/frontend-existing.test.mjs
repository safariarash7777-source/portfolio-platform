// Offline behavior checks for the existing components, not browser acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../../',import.meta.url));
const baseline=process.argv.includes('--baseline');
const source=path=>baseline?execFileSync('git',['show',`51fd0661d48d791ce8758a87828a81ce72cac6df:${path}`],{cwd:root,encoding:'utf8'}):readFileSync(resolve(root,path),'utf8');
const cache=new Map();
function pure(path){
  path=relative(root,resolve(root,path)).replaceAll('\\','/');
  if(cache.has(path))return cache.get(path);
  const loaded={exports:{}};cache.set(path,loaded.exports);
  runInNewContext(ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports:loaded.exports,require:name=>name.startsWith('.')?pure(resolve(dirname(path),name).replaceAll('\\','/')+'.ts'):require(name),Date,Intl,Number,String,Math,
  });return loaded.exports;
}
function harness(path,{initial=[],fetcher=()=>{throw Error('unexpected fetch')},query=''}={}){
  let cursor=0,refCursor=0;
  const values=[...initial],refs=[],effects=[],timers=[],calls=[],handlers=new Map();
  const react={...React,useState:initialValue=>{const i=cursor++;if(!(i in values))values[i]=typeof initialValue==='function'?initialValue():initialValue;return[values[i],next=>{values[i]=typeof next==='function'?next(values[i]):next;}];},useEffect:callback=>effects.push(callback),useMemo:fn=>fn(),useId:()=>':fixture:',useRef:initialValue=>{const i=refCursor++;refs[i]??={current:initialValue};return refs[i];}};
  const empty=()=>null;
  const imports={react,'next/navigation':{useSearchParams:()=>new URLSearchParams(query)},'@/components/layout/Navbar':{default:empty},'../ui/Logo':{default:empty},'../ui/ThemeToggle':{default:empty},'./Reveal':{default:({children})=>children}};
  const loaded={exports:{}};
  const globals={exports:loaded.exports,require:name=>{
    if(name in imports)return imports[name];
    if(name.startsWith('@/lib/'))return pure(name.slice(2)+'.ts');
    if(name==='@/components/account/returnPath')return pure('components/account/returnPath.ts');
    return require(name);
  },fetch:async(...args)=>{calls.push(args);return fetcher(...args);},AbortController,URL,URLSearchParams,console,
  setTimeout:(callback,milliseconds)=>{timers.push({callback,milliseconds});return timers.length;},clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
  window:{scrollY:0,addEventListener:()=>{},removeEventListener:()=>{}},document:{addEventListener:(name,callback)=>handlers.set(name,callback),removeEventListener:()=>{}},};
  runInNewContext(ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText+(path==='app/webinars/page.tsx'?'\nexports.content=WebinarsContent;exports.date=formatDate;':''),globals);
  const component=loaded.exports.content??loaded.exports.default;
  const tree=()=>{cursor=0;refCursor=0;effects.length=0;return component({});};
  return {tree,html:()=>renderToStaticMarkup(tree()),runEffects:()=>effects.map(callback=>callback()),calls,timers,handlers,refs,values,module:loaded.exports};
}
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of React.Children.toArray(node.props?.children)){const found=find(child,predicate);if(found)return found;}return null;}
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};

for(const [label,fetcher] of [
  ['HTTP503 JSON',async()=>new Response(JSON.stringify({error:'fixture'}),{status:503})],
  ['non-JSON gateway response',async()=>new Response('fixture HTML',{status:502})],
  ['invalid successful payload',async()=>new Response('{}',{status:200})],
  ['network rejection',async()=>{throw Error('fixture network');}],
])test(`existing webinars shows retryable error, not an empty schedule: ${label}`,async()=>{
  const h=harness('app/webinars/page.tsx',{fetcher});h.tree();h.runEffects();await settle();
  const html=h.html();assert.match(html,/فهرست وبینارها دریافت نشد/);assert.match(html,/تلاش دوباره/);assert.match(html,/role="alert"/);assert.doesNotMatch(html,/وبیناری برای نمایش|برنامه‌ریزی نشده/);
});

test('a valid empty webinar list remains an empty state',async()=>{
  const h=harness('app/webinars/page.tsx',{fetcher:async()=>Response.json({webinars:[]})});h.tree();h.runEffects();await settle();
  assert.match(h.html(),/وبیناری برای نمایش ثبت نشده/);assert.doesNotMatch(h.html(),/فهرست وبینارها دریافت نشد/);
});

test('the loading state has an accessible status and text',()=>{
  const h=harness('app/webinars/page.tsx');assert.match(h.html(),/role="status"/);assert.match(h.html(),/در حال دریافت وبینارها/);
});

test('retry repeats only the existing list request and can recover',async()=>{
  let attempt=0;
  const h=harness('app/webinars/page.tsx',{fetcher:async()=>++attempt===1?Response.json({error:'fixture'},{status:503}):Response.json({webinars:[]})});
  h.tree();h.runEffects();await settle();
  const retry=find(h.tree(),n=>n.type==='button'&&n.props.children==='تلاش دوباره');assert.ok(retry);retry.props.onClick();h.tree();h.runEffects();await settle();
  assert.match(h.html(),/وبیناری برای نمایش ثبت نشده/);assert.equal(h.calls.length,2);assert.ok(h.calls.every(([url])=>url==='/api/webinars/list'));
});

test('webinar fetch deadline becomes an error without infinite loading',async()=>{
  const h=harness('app/webinars/page.tsx',{fetcher:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('fixture abort'))))});
  h.tree();h.runEffects();assert.equal(h.timers[0]?.milliseconds,12000);h.timers[0].callback();await settle();assert.match(h.html(),/فهرست وبینارها دریافت نشد/);
});

test('a payment query parameter does not assert confirmed registration',async()=>{
  const h=harness('app/webinars/page.tsx',{query:'status=success',fetcher:async()=>Response.json({webinars:[]})});h.tree();h.runEffects();await settle();
  assert.doesNotMatch(h.html(),/ثبت‌نام شما تأیید شد/);assert.match(h.html(),/وضعیت ثبت‌نام را در حساب/);
});

test('webinar time is rendered in Tehran independently of local timezone',()=>{
  const h=harness('app/webinars/page.tsx');const iso='2026-10-01T22:00:00Z';
  assert.equal(h.module.date(iso),new Date(iso).toLocaleDateString('fa-IR',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'}));
});

for(const [label,fetcher] of [
  ['HTTP500 non-JSON',async()=>new Response('fixture gateway',{status:500})],
  ['HTTP200 without a valid receipt',async()=>Response.json({})],
  ['network rejection',async()=>{throw Error('fixture network');}],
])test(`consultation keeps email and announces failure: ${label}`,async()=>{
  const h=harness('components/landing/WaitlistForm.tsx',{fetcher});
  find(h.tree(),n=>n.type==='input').props.onChange({target:{value:'retained@example.test'}});
  await find(h.tree(),n=>n.type==='form').props.onSubmit({preventDefault(){}});
  const tree=h.tree(),input=find(tree,n=>n.type==='input');assert.equal(input.props.value,'retained@example.test');assert.equal(input.props['aria-invalid'],true);assert.equal(input.props['aria-describedby'],':fixture:');
  assert.match(renderToStaticMarkup(tree),/role="status"/);assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'/api/waitlist');assert.deepEqual(JSON.parse(h.calls[0][1].body),{email:'retained@example.test'});
});

test('successful consultation is a receipt, not a booking',async()=>{
  const h=harness('components/landing/WaitlistForm.tsx',{fetcher:async()=>Response.json({success:true})});
  find(h.tree(),n=>n.type==='input').props.onChange({target:{value:'receipt@example.test'}});
  await find(h.tree(),n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.match(h.html(),/وقت جلسه هنوز رزرو نشده/);assert.equal(find(h.tree(),n=>n.type==='input').props.value,'');
});

test('Escape closes the existing mobile menu and returns focus to its trigger',()=>{
  const h=harness('components/layout/Navbar.tsx');h.tree();
  find(h.tree(),n=>n.type==='button'&&n.props['aria-controls']==='mobile-menu').props.onClick();
  let focused=false;h.refs[1].current={focus:()=>{focused=true;}};
  assert.match(h.html(),/id="mobile-menu"/);h.runEffects();h.handlers.get('keydown')({key:'Escape'});
  assert.doesNotMatch(h.html(),/id="mobile-menu"/);assert.equal(focused,true);
});

test('an invalid-price market payload stops the skeleton and presents a truthful empty state',()=>{
  const h=harness('components/landing/LiveMarket.tsx',{initial:[{crypto:[{id:'fixture',faName:'نمونه',symbol:'TEST',price:0,change24h:null}],goldGlobal:[],fetchedAt:Date.now(),ok:true},false,null,Date.now()]});
  assert.match(h.html(),/ردیفی با قیمت معتبر/);assert.doesNotMatch(h.html(),/class="skeleton"/);
});

test('the homepage composition, local fonts and brand CSS remain byte-identical to main',()=>{
  for(const path of ['app/page.tsx','app/layout.tsx','app/globals.css','tailwind.config.js']){
    const original=execFileSync('git',['show',`51fd0661d48d791ce8758a87828a81ce72cac6df:${path}`],{cwd:root,encoding:'utf8'});
    assert.equal(readFileSync(resolve(root,path),'utf8').replaceAll('\r\n','\n'),original.replaceAll('\r\n','\n'));
  }
  assert.ok(existsSync(resolve(root,'public/fonts/Vazirmatn-Variable.woff2')));
});
