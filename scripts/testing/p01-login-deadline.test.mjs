import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createBrowserClient} from '@supabase/ssr';

function load(file,imports,globals={}) {
  const target={exports:{}};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports:target.exports,require:name=>imports[name],process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public-key',NEXT_PUBLIC_SUPABASE_COOKIE_NAME:'fixture-login-auth'}},
    AbortController,AbortSignal,Response,setTimeout,clearTimeout,...globals,
  });
  return target.exports;
}
const deadline=load('lib/deadline.ts',{}, {setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,30))});
const credentials={email:'synthetic@example.invalid',password:'synthetic-test-only'};
// Opaque SDK transport fixtures, never accepted or sent to a live Auth server.
const accepted=()=>Response.json({access_token:'opaque-test-access',refresh_token:'opaque-test-refresh',token_type:'bearer',expires_in:3600,user:{id:'synthetic-user'}});
const rejected=()=>Response.json({msg:'Invalid login credentials',code:'invalid_credentials'},{status:400});
function fixture(transport) {
  const writes=[];const options=[];
  const sdk={createBrowserClient:(url,key,opt={})=>{
    options.push(opt);
    return createBrowserClient(url,key,{...opt,isSingleton:false,cookies:{getAll:()=>[],setAll:rows=>writes.push(...rows)},auth:{autoRefreshToken:false,detectSessionInUrl:false},global:{...opt.global,fetch:opt.global?.fetch??transport}});
  }};
  return {...load('lib/supabase/client.ts',{'@supabase/ssr':sdk,'../deadline':deadline},{fetch:transport}),writes,options};
}
test('baseline default SDK request remains pending without an AbortSignal',async()=>{
  let release;let receivedSignal;
  const f=fixture((_url,init)=>{receivedSignal=init?.signal;return new Promise(resolve=>{release=resolve;});});
  const pending=f.createClient().auth.signInWithPassword(credentials);
  assert.equal(await Promise.race([pending.then(()=> 'settled'),new Promise(resolve=>setTimeout(()=>resolve('pending'),40))]),'pending');
  assert.equal(receivedSignal,undefined);
  release(rejected());await pending;
});
test('hanging network is bounded, aborted and cannot persist a late session',async()=>{
  let release;let receivedSignal;let navigate=0;
  const f=fixture((_url,init)=>{receivedSignal=init?.signal;return new Promise(resolve=>{release=resolve;});});
  const started=Date.now();
  await assert.rejects(deadline.withDeadline(signal=>f.createClient(signal).auth.signInWithPassword(credentials),8000).then(()=>{navigate++;}),{name:'DeadlineError'});
  assert.ok(Date.now()-started<1000);assert.equal(receivedSignal.aborted,true);assert.equal(navigate,0);
  release(accepted());await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(f.writes.length,0);
});
test('hanging response body is bounded before SDK session writes',async()=>{
  let release;let receivedSignal;
  const f=fixture(async(_url,init)=>{receivedSignal=init.signal;const response=accepted();response.arrayBuffer=()=>new Promise(resolve=>{release=resolve;});return response;});
  await assert.rejects(deadline.withDeadline(signal=>f.createClient(signal).auth.signInWithPassword(credentials),8000),{name:'DeadlineError'});
  assert.equal(receivedSignal.aborted,true);
  release(new TextEncoder().encode(JSON.stringify({access_token:'opaque-test-access',refresh_token:'opaque-test-refresh',expires_in:3600,user:{id:'synthetic-user'}})).buffer);
  await new Promise(resolve=>setTimeout(resolve,50));assert.equal(f.writes.length,0);
});
test('healthy native SDK response still writes the configured cookie',async()=>{
  const f=fixture(async()=>accepted());
  const result=await deadline.withDeadline(signal=>f.createClient(signal).auth.signInWithPassword(credentials),8000);
  assert.equal(result.error,null);assert.equal(result.data.user.id,'synthetic-user');
  assert.ok(f.writes.some(row=>row.name==='fixture-login-auth'));
  assert.equal(f.options[0].isSingleton,false);
});
test('credential rejection is preserved; failed request writes no session',async()=>{
  const f=fixture(async()=>rejected());
  const result=await deadline.withDeadline(signal=>f.createClient(signal).auth.signInWithPassword(credentials),8000);
  assert.equal(result.error.status,400);assert.equal(result.error.message,'Invalid login credentials');assert.equal(f.writes.length,0);
});
test('a new attempt has a fresh signal and succeeds after timeout',async()=>{
  let call=0;const signals=[];
  const f=fixture(async(_url,init)=>{signals.push(init.signal);return ++call===1?new Promise(()=>{}):accepted();});
  await assert.rejects(deadline.withDeadline(signal=>f.createClient(signal).auth.signInWithPassword(credentials),8000),{name:'DeadlineError'});
  const result=await deadline.withDeadline(signal=>f.createClient(signal).auth.signInWithPassword(credentials),8000);
  assert.equal(result.error,null);assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);assert.notEqual(signals[0],signals[1]);
});
test('login integrates bounded SDK; input state is preserved and loading is released',()=>{
  const source=readFileSync(new URL('../../app/(auth)/login/page.tsx',import.meta.url),'utf8');
  assert.match(source,/await withDeadline\(signal =>\s*createClient\(signal\)\.auth\.signInWithPassword/);
  assert.match(source,/finally\s*\{\s*setLoading\(false\)/);
  assert.doesNotMatch(source,/setEmail\(""\)|setPassword\(""\)/);
});
