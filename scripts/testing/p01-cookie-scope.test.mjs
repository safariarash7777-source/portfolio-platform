import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {createBrowserClient,createServerClient} from '@supabase/ssr';
import {NextRequest} from 'next/server.js';
const require=createRequire(import.meta.url);
const deadline=load('lib/deadline.ts',{},{});
function load(path,imports,env){
  const target={exports:{}};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:target.exports,require:name=>name in imports?imports[name]:require(name),process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public-key',...env}},URL,AbortController,setTimeout,clearTimeout});
  return target.exports;
}
const returnPath=load('components/account/returnPath.ts',{},{});
const error=load('lib/auth/session-error.ts',{},{});
for(const name of [undefined,'fixture-demo-auth'])test(`client/server/middleware share SDK cookie name ${name??'default'}`,async()=>{
  const env=name?{NEXT_PUBLIC_SUPABASE_COOKIE_NAME:name}:{};const expected=name??'sb-fixture-auth-token';
  const cookies={getAll:()=>[],set:()=>{}};
  const client=load('lib/supabase/client.ts',{'@supabase/ssr':{createBrowserClient},'../deadline':deadline},env).createClient();assert.equal(client.auth.storageKey,expected);
  const server=await load('lib/supabase/server.ts',{'@supabase/ssr':{createServerClient},'next/headers':{cookies:async()=>cookies}},env).createClient();assert.equal(server.auth.storageKey,expected);
  let received;
  const sdk={createServerClient:(url,key,options)=>{
    const actual=createServerClient(url,key,options);received=actual.auth.storageKey;
    return {auth:{getUser:async()=>({data:{user:null},error:null})}};
  }};
  const gate=load('middleware.ts',{'@supabase/ssr':sdk,'./lib/entitlement-filter':{},'./components/account/returnPath':returnPath,'./lib/auth/session-error':error,'./lib/auth/origin':load('lib/auth/origin.ts',{},env)},env);
  const response=await gate.middleware(new NextRequest('https://site.test/dashboard'));
  assert.equal(received,expected);assert.equal(new URL(response.headers.get('location')).searchParams.get('next'),'/dashboard');
  const callbackSDK={createServerClient:(url,key,options)=>{
    const actual=createServerClient(url,key,options);received=actual.auth.storageKey;
    return {auth:{exchangeCodeForSession:async()=>({error:null})}};
  }};
  const callback=load('app/auth/callback/route.ts',{'@supabase/ssr':callbackSDK,'@/components/account/returnPath':returnPath,'@/lib/auth/session-error':error,'@/lib/auth/origin':load('lib/auth/origin.ts',{},env)},env);
  const result=await callback.GET(new NextRequest('https://site.test/auth/callback?code=opaque-fixture&next=%2Fdashboard'));
  assert.equal(received,expected);assert.equal(result.headers.get('location'),'https://site.test/dashboard');
});
test('two independent names do not read another environment cookie',async()=>{
  const written=[];const jar=[{name:'fixture-one-auth',value:'opaque-other-environment'}];
  const sdk=createServerClient('https://fixture.invalid','fixture-public-key',{cookieOptions:{name:'fixture-two-auth'},cookies:{getAll:()=>jar,setAll:value=>written.push(...value)}});
  const {data,error}=await sdk.auth.getUser();assert.equal(data.user,null);assert.equal(error.name,'AuthSessionMissingError');assert.equal(written.length,0);
});

for(const failure of [false,true])test(`callback behind proxy redirects to configured public origin, preserves Auth cookies: failure=${failure}`,async()=>{
  const env={NEXT_PUBLIC_APP_URL:'https://public.test:8445/base'};
  const sdk={createServerClient:(_url,_key,options)=>({auth:{exchangeCodeForSession:async()=>{
    options.cookies.setAll([{name:'fixture-auth',value:'opaque-fixture',options:{path:'/'}}],{'Cache-Control':'private, no-store'});
    return {error:failure?new Error('transport'):null};
  }}})};
  const callback=load('app/auth/callback/route.ts',{'@supabase/ssr':sdk,'@/components/account/returnPath':returnPath,'@/lib/auth/session-error':error,'@/lib/auth/origin':load('lib/auth/origin.ts',{},env)},env);
  const request=new NextRequest('https://0.0.0.0:3000/auth/callback?code=opaque-fixture&next=%2Fdashboard%3Ftab%3Dactions',{headers:{host:'evil.invalid','x-forwarded-host':'evil.invalid','x-forwarded-proto':'http'}});
  const result=await callback.GET(request);const location=new URL(result.headers.get('location'));
  assert.equal(location.origin,'https://public.test:8445');
  assert.equal(location.pathname,failure?'/login':'/dashboard');
  assert.equal(failure?location.searchParams.get('next'):location.searchParams.get('tab'),failure?'/dashboard?tab=actions':'actions');
  assert.match(result.headers.get('set-cookie'),/fixture-auth=/);assert.match(result.headers.get('cache-control'),/no-store/);
  const missing=await callback.GET(new NextRequest('https://0.0.0.0:3000/auth/callback?next=%2F%2Fevil.invalid'));
  assert.equal(new URL(missing.headers.get('location')).origin,'https://public.test:8445');
  assert.equal(new URL(missing.headers.get('location')).searchParams.get('next'),'/dashboard');
});

test('anonymous protected HTTP redirect uses configured public origin behind proxy',async()=>{
  const env={NEXT_PUBLIC_APP_URL:'https://public.test:8445'};
  const sdk={createServerClient:()=>({auth:{getUser:async()=>({data:{user:null},error:null})}})};
  const gate=load('middleware.ts',{'@supabase/ssr':sdk,'./lib/entitlement-filter':{},'./components/account/returnPath':returnPath,'./lib/auth/session-error':error,'./lib/auth/origin':load('lib/auth/origin.ts',{},env)},env);
  const response=await gate.middleware(new NextRequest('https://0.0.0.0:3000/dashboard?tab=actions',{headers:{'x-forwarded-host':'evil.invalid'}}));
  const location=new URL(response.headers.get('location'));assert.equal(location.origin,'https://public.test:8445');assert.equal(location.pathname,'/login');assert.equal(location.searchParams.get('next'),'/dashboard?tab=actions');assert.match(response.headers.get('cache-control'),/no-store/);
});
