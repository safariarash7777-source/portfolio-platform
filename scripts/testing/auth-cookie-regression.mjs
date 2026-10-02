import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {NextRequest} from 'next/server.js';
import ts from 'typescript';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const sourceBefore=execFileSync('git',['show','7cb030c:middleware.ts'],{encoding:'utf8'});
const sourceAfter=readFileSync('middleware.ts','utf8');
const authModule={exports:{}};
runInNewContext(ts.transpileModule(readFileSync('lib/auth/session-error.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:authModule.exports,require,Set});
async function evaluate(source,signedIn){
  const target={exports:{}};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports:target.exports,
    require:name=>name==='@supabase/ssr'?{createServerClient:(_url,_key,options)=>({auth:{getUser:async()=>{options.cookies.setAll([{name:'synthetic-session',value:signedIn?'refreshed':'',options:{path:'/',maxAge:signedIn?300:0}}]);return {data:{user:signedIn?{id:'synthetic'}:null}};}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'user'}})})})})})}:name==='./components/account/returnPath'?{accountEntryHref:(_entry,path)=>'/login?next='+encodeURIComponent(path)}:name==='./lib/auth/session-error'?authModule.exports:name==='./lib/entitlement-filter'?{}:require(name),process:{env:{}},URL,AbortController,fetch,setTimeout,clearTimeout,
  });
  return (await target.exports.middleware(new NextRequest('https://site.example/admin'))).headers.get('set-cookie');
}
const checks=[];
for(const signedIn of [false,true]){
  const before=await evaluate(sourceBefore,signedIn),after=await evaluate(sourceAfter,signedIn);
  assert.equal(before,null);assert.ok(after?.includes('synthetic-session='));
  checks.push({signedIn,before:'cookie_dropped',after:'cookie_preserved'});
}
writeFileSync('docs/ops/seasonal-program/followup-auth-evidence/cookie-regression.json',JSON.stringify({at:new Date().toISOString(),synthetic:true,baseline:'7cb030c',checks},null,2));
console.log('Before/fixed cookie regression reproduced for both refreshed and expired sessions.');
