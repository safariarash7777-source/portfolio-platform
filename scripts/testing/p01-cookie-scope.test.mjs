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
  const gate=load('middleware.ts',{'@supabase/ssr':sdk,'./lib/entitlement-filter':{},'./components/account/returnPath':returnPath,'./lib/auth/session-error':error},env);
  const response=await gate.middleware(new NextRequest('https://site.test/dashboard'));
  assert.equal(received,expected);assert.equal(new URL(response.headers.get('location')).searchParams.get('next'),'/dashboard');
  const callbackSDK={createServerClient:(url,key,options)=>{
    const actual=createServerClient(url,key,options);received=actual.auth.storageKey;
    return {auth:{exchangeCodeForSession:async()=>({error:null})}};
  }};
  const callback=load('app/auth/callback/route.ts',{'@supabase/ssr':callbackSDK,'@/components/account/returnPath':returnPath,'@/lib/auth/session-error':error},env);
  const result=await callback.GET(new NextRequest('https://site.test/auth/callback?code=opaque-fixture&next=%2Fdashboard'));
  assert.equal(received,expected);assert.equal(result.headers.get('location'),'https://site.test/dashboard');
});
test('two independent names do not read another environment cookie',async()=>{
  const written=[];const jar=[{name:'fixture-one-auth',value:'opaque-other-environment'}];
  const sdk=createServerClient('https://fixture.invalid','fixture-public-key',{cookieOptions:{name:'fixture-two-auth'},cookies:{getAll:()=>jar,setAll:value=>written.push(...value)}});
  const {data,error}=await sdk.auth.getUser();assert.equal(data.user,null);assert.equal(error.name,'AuthSessionMissingError');assert.equal(written.length,0);
});
