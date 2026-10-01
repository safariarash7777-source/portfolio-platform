import assert from "node:assert/strict";
import test from "node:test";
import { signInAndReturn } from "./loginFlow";

test("ورود موفق دقیقاً به مقصد محلی حفظ‌شده برمی‌گردد", async () => {
  const navigations: string[] = [];
  let refreshed = false;
  const error = await signInAndReturn(
    {
      signIn: async () => ({ error: null }),
      navigate: (destination) => navigations.push(destination),
      refresh: () => { refreshed = true; },
    },
    { email: "member@example.com", password: "secret" },
    "/market/funds?type=طلا#table",
  );

  assert.equal(error, null);
  assert.deepEqual(navigations, ["/market/funds?type=طلا#table"]);
  assert.equal(refreshed, true);
});

test("مقصد بیرونی حتی پس از ورود موفق به داشبورد امن برمی‌گردد", async () => {
  const navigations: string[] = [];
  await signInAndReturn(
    {
      signIn: async () => ({ error: null }),
      navigate: (destination) => navigations.push(destination),
      refresh: () => undefined,
    },
    { email: "member@example.com", password: "secret" },
    "https://evil.example/steal",
  );
  assert.deepEqual(navigations, ["/dashboard"]);
});

test("ورود ناموفق نه جابه‌جا می‌شود و نه صفحه را refresh می‌کند", async () => {
  let navigated = false;
  let refreshed = false;
  const error = await signInAndReturn(
    {
      signIn: async () => ({ error: { message: "Invalid login credentials" } }),
      navigate: () => { navigated = true; },
      refresh: () => { refreshed = true; },
    },
    { email: "member@example.com", password: "wrong" },
    "/market",
  );
  assert.equal(error?.message, "Invalid login credentials");
  assert.equal(navigated, false);
  assert.equal(refreshed, false);
});


// Exercise the actual middleware with an anonymous session, without network or credentials.
// This catches losing ?next before the already-tested login helper ever runs.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server";
import * as returnPaths from "./returnPath";


const localRequire = createRequire(import.meta.url);
const middlewareModule = { exports: {} as { middleware?: (request: NextRequest) => Promise<Response> } };
runInNewContext(ts.transpileModule(readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: middlewareModule.exports,
  require: (name: string) => name === "@supabase/ssr"
    ? { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }
    : name === "./components/account/returnPath" ? returnPaths
    : localRequire(name),
  process: { env: {} }, URL,AbortController,fetch,setTimeout,clearTimeout,
});

for (const path of ["/dashboard?tab=portfolio", "/admin/research", "/terminal/فملی?tab=financials"]) {
  test(`anonymous protected link survives login: ${path}`, async () => {
    const request = new NextRequest(new URL(path, "https://site.example"));
    const response = await middlewareModule.exports.middleware!(request);
    const redirect = new URL(response.headers.get("location")!);
    assert.equal(redirect.origin, request.nextUrl.origin);
    assert.equal(redirect.pathname, "/login");
    const intended = request.nextUrl.pathname + request.nextUrl.search;
    assert.equal(redirect.searchParams.get("next"), intended);
    const navigations: string[] = [];
    await signInAndReturn({ signIn: async () => ({ error: null }),
      navigate: path => navigations.push(path), refresh: () => undefined,
    }, { email: "member@example.com", password: "test-only" }, redirect.searchParams.get("next")!);
    assert.deepEqual(navigations, [intended]);
  });
}

test("nested external next remains data on a local protected path", async () => {
  const request = new NextRequest("https://site.example/dashboard?next=https%3A%2F%2Fevil.example");
  const response = await middlewareModule.exports.middleware!(request);
  const redirect = new URL(response.headers.get("location")!);
  assert.equal(redirect.searchParams.get("next"), "/dashboard?next=https%3A%2F%2Fevil.example");
});

for(const signedIn of [true,false]) {
  test(`middleware redirect preserves Auth cookie updates: authenticated=${signedIn}`,async()=>{
    const loadedMiddleware={exports:{} as {middleware:(request:NextRequest)=>Promise<Response>}};
    runInNewContext(ts.transpileModule(readFileSync(new URL('../../middleware.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
      exports:loadedMiddleware.exports,
      require:(name:string)=>name==='@supabase/ssr'?{createServerClient:(_url:unknown,_key:unknown,options:{cookies:{setAll:(values:object[])=>void}})=>({auth:{getUser:async()=>{options.cookies.setAll([{name:'synthetic-session',value:signedIn?'refreshed':'',options:{path:'/',httpOnly:true,sameSite:'lax',maxAge:signedIn?300:0}}]);return {data:{user:signedIn?{id:'synthetic-user'}:null}};}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'user'}})})})})})}:name==='./components/account/returnPath'?returnPaths:localRequire(name),
      process:{env:{}},URL,AbortController,fetch,setTimeout,clearTimeout,
    });
    const response=await loadedMiddleware.exports.middleware(new NextRequest('https://site.example/admin'));
    assert.match(response.headers.get('set-cookie')??'',signedIn?/synthetic-session=refreshed/:/Max-Age=0/);
    assert.equal(new URL(response.headers.get('location')!).pathname,signedIn?'/dashboard':'/login');
  });
}

test('A stalled authenticated gate returns a bounded, explicit retry and never private access',async()=>{
  let deadline:(()=>void)|undefined;let upstreamAborted=false;
  const loadedMiddleware={exports:{} as {middleware:(request:NextRequest)=>Promise<Response>;config:{runtime:string}}};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../../middleware.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports:loadedMiddleware.exports,
    require:(name:string)=>name==='@supabase/ssr'?{createServerClient:(_url:unknown,_key:unknown,options:{global:{fetch:typeof fetch}})=>({auth:{getUser:()=>{void options.global.fetch('https://not-a-network-request.test').catch(()=>{});return new Promise(()=>{});}}})}:name==='./components/account/returnPath'?returnPaths:localRequire(name),
    process:{env:{}},URL,AbortController,fetch:(_input:unknown,init:RequestInit)=>{init.signal?.addEventListener('abort',()=>{upstreamAborted=true;});return new Promise(()=>{});},
    setTimeout:(callback:()=>void,milliseconds:number)=>{assert.equal(milliseconds,8000);deadline=callback;return 1;},clearTimeout:()=>{},
  });
  const pending=loadedMiddleware.exports.middleware(new NextRequest('https://site.example/admin/fx'));
  assert.ok(deadline);deadline();const response=await pending;
  const target=new URL(response.headers.get('location')!);assert.equal(target.pathname,'/login');assert.equal(target.searchParams.get('error'),'auth_unavailable');assert.equal(target.searchParams.get('next'),'/admin/fx');assert.equal(upstreamAborted,true);assert.equal(loadedMiddleware.exports.config.runtime,'nodejs');
});
