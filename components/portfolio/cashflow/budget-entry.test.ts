import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const dir="app/(protected)/dashboard/cashflow", nav=({children,...props}:{children?:React.ReactNode;href?:string})=>React.createElement("a",props,children);
function load(name: string, seams: Record<string, unknown>={}) {
  const filename=resolve(name),local=createRequire(filename),out={exports:{} as {default:React.ComponentType<{children?: React.ReactNode}>}};
  const code=ts.transpileModule(readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function("require","module","exports",code)((n:string)=>n in seams?seams[n]:local(n.startsWith("@/")?resolve(n.slice(2)):n),out,out.exports);
  return out.exports.default;
}
const Heading=load("components/portfolio/cashflow/BudgetEntryHeading.tsx");
const Layout=load(dir+"/layout.tsx",{"next/link":nav,"@/components/layout/Navbar":()=>null,"@/components/layout/Footer":()=>null,"@/components/portfolio/cashflow/BudgetEntryHeading":Heading});
test("the actual route shell owns exactly one named, focusable, sticky-header-safe budget arrival before its changing content",()=>{
  const loading=load(dir+"/loading.tsx");
  for(const child of [React.createElement(loading),React.createElement("p",{role:"alert"},"خطای نشست"),React.createElement("form",null,"انتخاب دوره")]){
    const html=renderToStaticMarkup(React.createElement(Layout,null,child));
    assert.equal(html.match(/id="period-budget"/g)?.length,1);
    assert.equal(html.match(/id="main-content"/g)?.length,1);
    assert.match(html,/<h2[^>]*id="period-budget"[^>]*tabindex="-1"[^>]*scroll-mt-28[^>]*>بودجهٔ دوره<\/h2>/i);
    assert.match(html,/href="#period-budget"/);
    assert.ok(html.indexOf('id="period-budget"')<html.indexOf(renderToStaticMarkup(child)));
    assert.doesNotMatch(html,/۰ تومان/);
  }
});

test("late streamed arrival restores keyboard focus once to the heading without stealing it from an existing control",()=>{
  const file=resolve("components/portfolio/cashflow/BudgetEntryHeading.tsx");
  const c=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  for(const [hash,hasTyped,expected] of [["#period-budget",false,1],["#period-budget",true,0],["",false,0],["#cashflow-editor",false,0]] as const){
    const local=createRequire(file),out={exports:{} as {default:()=>unknown}},calls:unknown[]=[];
    const node={focus:(opt:unknown)=>calls.push(opt),scrollIntoView:(opt:unknown)=>calls.push(opt)};
    const body={},doc={body,activeElement:hasTyped?{}:body};
    new Function("require","exports","document","window",c)((n:string)=>n==="react"?{
      useRef:()=>({current:node}),useEffect:(fn:()=>void,deps:unknown[])=>{assert.equal(deps.length,0);fn();},
    }:local(n),out.exports,doc,{location:{hash}});
    out.exports.default();
    assert.deepEqual(calls,expected?[{preventScroll:true},{block:"start",behavior:"instant"}]:[]);
  }
});
