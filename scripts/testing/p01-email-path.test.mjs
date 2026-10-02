// Real TS email/status handlers; canned Auth transport only, no server/accounts/DB writes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {AuthApiError,AuthRetryableFetchError,AuthSessionMissingError} from '@supabase/supabase-js';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../../',import.meta.url));
const user={id:'fixture-existing-uuid',email_confirmed_at:'fixture-confirmed'};
function harness({env={},settings={external:{email:true},disable_signup:false,mailer_autoconfirm:false},settingsFailure=false,settingsStatus=200,authError=null,claimsError=null,confirmed=true,amr=[{method:'recovery',timestamp:Date.now()/1000-10}],actionError=null,anonymous=false,origin=true}={}){
  const calls={clients:0,settings:0,signup:[],recovery:[],verify:0,updates:0,privateReads:0,claims:0,emailFailures:0};
  const db={auth:{
    getUser:async()=>({data:{user:anonymous?null:{...user,email_confirmed_at:confirmed?user.email_confirmed_at:null}},error:authError}),
    getClaims:async()=>{calls.claims++;return {data:{claims:{amr}},error:claimsError};},
    signUp:async args=>{calls.signup.push(args);return {data:{user:{id:'PRIVATE returned uuid',email:'PRIVATE returned email'}},error:actionError};},
    resetPasswordForEmail:async(email,options)=>{calls.recovery.push({email,options});return {error:actionError};},
    verifyOtp:async()=>{calls.verify++;return {error:actionError};},
    updateUser:async()=>{calls.updates++;return {error:actionError};},
  },from:()=>{calls.privateReads++;throw Error('private role should not be read in recovery scope');}};
  const cache=new Map();
  function load(path){
    path=relative(root,resolve(root,path)).replaceAll('\\','/');if(cache.has(path))return cache.get(path);
    const target={exports:{}};cache.set(path,target.exports);
    const compiled=ts.transpileModule(readFileSync(resolve(root,path),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(compiled,{exports:target.exports,require:name=>{
      if(name==='server-only')return {};
      if(name==='@/lib/supabase/server')return {createClient:async()=>{calls.clients++;return db;}};
      if(name==='@/lib/auth/mobile-server')return {sameOrigin:()=>origin};
      if(name==='@/lib/auth/email-health')return {recordEmailFailure:()=>{calls.emailFailures++;}};
      if(name.startsWith('@/')||name.startsWith('.')){const candidate=name.startsWith('@/')?name.slice(2):resolve(dirname(path),name);return load(existsSync(resolve(root,candidate+'.ts'))?candidate+'.ts':candidate+'.tsx');}
      return require(name);
    },process:{env:{AUTH_EMAIL_ENABLED:'true',AUTH_EMAIL_ALLOW_SIGNUP:'true',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid/prefix',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public-key',...env}},Request,Response,URL,URLSearchParams,AbortSignal,TextDecoder,Date,Number,fetch:async(url,options)=>{
      calls.settings++;assert.equal(url,'https://fixture.invalid/prefix/auth/v1/settings');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.ok(options.signal);
      if(settingsFailure)throw Error('PRIVATE transport');return Response.json(settings,{status:settingsStatus});
    }});return target.exports;
  }
  const request=body=>new Request('https://site.test/api/auth/email',{method:'POST',headers:{origin:'https://site.test','content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
  return {load,calls,request,email:async body=>load('app/api/auth/email/route.ts').POST(request(body)),status:async()=>load('app/api/auth/status/route.ts').GET(new Request('https://site.test/api/auth/status?scope=email-recovery'))};
}
const signup={action:'signup',email:'fixture@example.invalid',fullName:'نام نمونه',password:'synthetic-only-password',next:'/admin/fx?tab=research'};
const privateResponse=async response=>{assert.match(response.headers.get('cache-control'),/no-store/);const body=await response.json();assert.doesNotMatch(JSON.stringify(body),/PRIVATE|fixture@example|synthetic-only|fixture-existing/);return body;};

test('signup uses native Auth once, safe metadata only, receipt without grant/session/provider claims',async()=>{
  const h=harness();const response=await h.email(signup);assert.equal(response.status,200);const body=await privateResponse(response);assert.equal(body.status,'confirmation_requested');
  assert.equal(h.calls.signup.length,1);const args=h.calls.signup[0];assert.deepEqual(JSON.parse(JSON.stringify(args.options.data)),{full_name:'نام نمونه'});assert.equal(args.email,signup.email);assert.equal(args.password,signup.password);
  const callback=new URL(args.options.emailRedirectTo);assert.equal(callback.origin,'https://site.test');assert.equal(callback.pathname,'/auth/callback');assert.equal(callback.searchParams.get('next'),signup.next);assert.equal(h.calls.privateReads,0);
});
for(const [name,options] of [
  ['feature off',{env:{AUTH_EMAIL_ALLOW_SIGNUP:'false'}}],['consumer off',{env:{AUTH_EMAIL_ENABLED:'false'}}],
  ['auto-confirm enabled',{settings:{external:{email:true},disable_signup:false,mailer_autoconfirm:true}}],
  ['signup disabled',{settings:{external:{email:true},disable_signup:true,mailer_autoconfirm:false}}],
  ['email provider disabled',{settings:{external:{email:false},disable_signup:false,mailer_autoconfirm:false}}],
  ['unknown configuration',{settings:{}}],['configuration network outage',{settingsFailure:true}],['configuration quota',{settingsStatus:429}],
])test(`signup ${name} fails closed before account creation`,async()=>{
  const h=harness(options);const response=await h.email(signup);assert.equal(response.status,503);await privateResponse(response);assert.equal(h.calls.signup.length,0);assert.equal(h.calls.clients,0);assert.equal(h.calls.privateReads,0);
  if(name.endsWith('off'))assert.equal(h.calls.settings,0);
});
for(const extra of [{national_id:'private-id'},{phone:'private-phone'},{role:'admin'},{data:{role:'admin'}}])test(`signup rejects forbidden payload key ${Object.keys(extra)[0]}`,async()=>{
  const h=harness();assert.equal((await h.email({...signup,...extra})).status,400);assert.equal(h.calls.signup.length,0);assert.equal(h.calls.settings,0);
});
for(const [name,options,status] of [
  ['invalid input',{actionError:new AuthApiError('PRIVATE invalid',400,'validation_failed')},400],
  ['quota',{actionError:new AuthApiError('PRIVATE quota',429)},429],
  ['provider outage',{actionError:new AuthRetryableFetchError('PRIVATE smtp',503)},503],
])test(`signup ${name} never claims completion`,async()=>{
  const h=harness(options);const response=await h.email(signup);assert.equal(response.status,status);const body=await privateResponse(response);assert.equal(body.ok,undefined);
});
test('duplicate signup returns the same neutral receipt, never changes existing credentials or grants',async()=>{
  for(const code of [undefined,'user_already_exists','email_exists']){
    const h=harness({actionError:code?new AuthApiError('PRIVATE duplicate',400,code):null});
    const response=await h.email(signup);assert.equal(response.status,200);const receipt=await privateResponse(response);
    assert.equal(receipt.status,'confirmation_requested');assert.match(receipt.message,/اگر ثبت/);assert.equal(h.calls.updates,0);assert.equal(h.calls.privateReads,0);
  }
});
test('cross-origin and malformed/oversized actions stop before Auth/network',async()=>{
  const foreign=harness({origin:false});assert.equal((await foreign.email(signup)).status,403);assert.equal(foreign.calls.clients,0);
  for(const body of ['{','null','[]',{}, {action:'unknown'}, {...signup,next:42},'x'.repeat(4097)]){
    const h=harness();const response=await h.email(body);assert.equal(response.status,typeof body==='string'&&body.length>4096?413:400);assert.equal(h.calls.clients,0);assert.equal(h.calls.settings,0);
  }
});
test('oversized streaming body cancels before consuming later chunks',async()=>{
  const h=harness();let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4097));},cancel(){cancelled=true;}});
  const request=new Request('https://site.test/api/auth/email',{method:'POST',body:stream,duplex:'half'});
  const response=await h.load('app/api/auth/email/route.ts').POST(request);assert.equal(response.status,413);assert.equal(cancelled,true);assert.equal(h.calls.clients,0);
});
test('recovery preserves a local return target through callback and fragment, rejects foreign targets',async()=>{
  for(const [target,expected] of [[signup.next,signup.next],['//foreign.test','/dashboard'],['/login','/dashboard']]){
    const h=harness();const response=await h.email({action:'recover',email:signup.email,next:target});assert.equal(response.status,200);const receipt=await privateResponse(response);assert.equal(receipt.status,'recovery_requested');
    const callback=new URL(h.calls.recovery[0].options.redirectTo);const page=new URL(callback.searchParams.get('next'),callback.origin);assert.equal(page.pathname,'/reset-password');assert.equal(page.searchParams.get('next')??'/dashboard',expected);
    const fragment='#type=recovery&token_hash='+'e'.repeat(64)+'&redirect='+encodeURIComponent(callback.href);
    const dest=h.load('lib/auth/email.ts').emailLinkDestination(fragment,'https://site.test');assert.equal(dest.next,page.pathname+page.search);
    const verified=await h.email({action:'verify',type:'recovery',tokenHash:dest.token,next:dest.next});assert.equal(verified.status,200);assert.equal((await privateResponse(verified)).next,page.pathname+page.search);
  }
});
test('malformed or foreign recovery next cannot break consumed link',async()=>{
  for(const next of ['http://%','https://foreign.test/reset-password?next=/admin','/reset-password?next=//foreign.test','/reset-password?next=/login']){
    const h=harness();const response=await h.email({action:'verify',type:'recovery',tokenHash:'a'.repeat(64),next});assert.equal(response.status,200);assert.equal((await response.json()).next,'/reset-password');assert.equal(h.calls.verify,1);
  }
});
for(const [name,options,expected] of [
  ['fresh recovery',{},'ready'],['fresh otp',{amr:[{method:'otp',timestamp:Date.now()/1000-10}]},'ready'],
  ['password-only',{amr:[{method:'password',timestamp:Date.now()/1000-10}]},'proof_required'],
  ['expired proof',{amr:[{method:'recovery',timestamp:Date.now()/1000-301}]},'proof_required'],
  ['future proof',{amr:[{method:'recovery',timestamp:Date.now()/1000+60}]},'proof_required'],
  ['missing proof',{amr:null},'proof_required'],['unconfirmed email',{confirmed:false},'proof_required'],
])test(`recovery check ${name} agrees with password mutation guard`,async()=>{
  const h=harness(options);const response=await h.status();assert.equal(response.status,200);assert.equal((await privateResponse(response)).recovery,expected);assert.equal(h.calls.privateReads,0);
  assert.equal(await h.load('lib/auth/email.ts').recoveryCheck(await h.status()),expected);
  const save=await h.email({action:'set-password',password:signup.password});assert.equal(save.status,expected==='ready'?200:403);assert.equal(h.calls.updates,expected==='ready'?1:0);
});
for(const [name,options,status,presentation] of [
  ['session missing',{authError:new AuthSessionMissingError(),anonymous:true},200,'proof_required'],
  ['session outage',{authError:new AuthRetryableFetchError('PRIVATE unavailable',503)},503,'unavailable'],
  ['claims rejected',{claimsError:new AuthApiError('PRIVATE rejected',401)},401,'proof_required'],
  ['claims unavailable',{claimsError:new AuthRetryableFetchError('PRIVATE unavailable',503)},503,'unavailable'],
])test(`recovery ${name} is not silently accepted`,async()=>{
  const h=harness(options);const response=await h.status();assert.equal(response.status,status);await privateResponse(response);assert.equal(await h.load('lib/auth/email.ts').recoveryCheck(await h.status()),presentation);assert.equal(h.calls.privateReads,0);
});
test('invalid recovery status payload/503 cannot masquerade as expired proof',async()=>{
  const parse=harness().load('lib/auth/email.ts').recoveryCheck;
  for(const response of [Response.json({authenticated:false},{status:503}),Response.json({authenticated:true}),Response.json(null),new Response('gateway html')])assert.equal(await parse(response),'unavailable');
});
