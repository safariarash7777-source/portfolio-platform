import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import type { MemberFinanceSummary } from "./PersonalFinance";

// Exercise the actual two role-specific presentation entry points. Only framework
// navigation/rendering boundaries are replaced. Route authorization is tested
// separately at the HTTP boundary; this test cannot prove RLS.
function load<P extends object>(path: string, seams: Record<string, unknown> = {}) {
  const filename=resolve(path), local=createRequire(filename), output={exports:{} as {default:React.ComponentType<P>}};
  const compiled=ts.transpileModule(readFileSync(filename,"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const link=({href,children,className}:{href:string,children:React.ReactNode,className?:string}) => <a href={href} className={className}>{children}</a>;
  new Function("require","module","exports",compiled)((name:string)=>name==="next/link"?link:name in seams?seams[name]:local(name.startsWith("@/")?resolve(name.slice(2)):name),output,output.exports);
  return output.exports.default;
}
const fauxError=({label}:{label:string}) => <p role="alert">{label}</p>;
const Member=load<{summary:MemberFinanceSummary}>("components/dashboard/PersonalFinance.tsx",{"@/components/dashboard/ReadError":fauxError});
const Desk=load<{observedAt:string,quality:string,controls:React.ReactNode}>("components/admin/DeskFrontPage.tsx",{"./DeskFrontPage.module.css":{}});
const fixture:MemberFinanceSummary={assetsState:"empty",version:null,recordedAt:null,assetCount:null,debtsState:"empty",debtCount:null,scopeState:"empty",targetState:"empty"};
test("member without records gets an asset action, not invented zeroes, returns, or any manager link",()=>{
  const body=renderToStaticMarkup(<Member summary={fixture}/>);
  assert.match(body,/اولین دارایی را ثبت کنید/);assert.match(body,/هنوز ثبت نشده/);
  assert.doesNotMatch(body,/href="\/admin|۰ تومان/);
  for(const dest of ["/dashboard/holdings#asset-editor","/dashboard/holdings#debt-editor","/dashboard/holdings#investment-scope","/dashboard/consultation","/dashboard/goals","/dashboard/cashflow","/dashboard/cashflow#period-budget"]) assert.ok(body.includes('href="'+dest+'"'),dest);
});
test("failed owner read does not turn into a new account or fabricated amount",()=>{
  const body=renderToStaticMarkup(<Member summary={{...fixture,assetsState:"error",debtsState:"error",scopeState:"error",targetState:"error"}}/>);
  assert.match(body,/خواندن ناموفق/);assert.match(body,/بازخوانی اطلاعات/);assert.doesNotMatch(body,/اولین دارایی را ثبت کنید|۰ تومان/);
});
test("desk prioritizes research and authorized case review; delayed source is not promoted to live",()=>{
  const body=renderToStaticMarkup(<Desk observedAt="زمان آزمایشی" quality="دریافت تازه در مهلت مقرر پاسخ نداد" controls={<button>بازخوانی داده</button>}/>);
  assert.match(body,/دریافت تازه در مهلت مقرر پاسخ نداد/);assert.match(body,/خواندن صفحه: زمان آزمایشی/);assert.equal((body.match(/<h1>/g)??[]).length,1);
  for(const route of ["/admin/research","/admin/consultation","/admin/overview","/symbol/فولاد#fundamental"]) assert.ok(body.includes('href="'+route+'"'));
  assert.doesNotMatch(body,/پروندهٔ مالی من|href="\/dashboard|در صف تأیید:|تومان/);
});
