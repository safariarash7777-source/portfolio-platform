// Actual TypeScript handlers with SDK errors/canned transport; no server, DB or account writes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {NextRequest} from 'next/server.js';
import {AuthApiError,AuthPKCECodeVerifierMissingError,AuthSessionMissingError,AuthRetryableFetchError,AuthUnknownError,createClient} from '@supabase/supabase-js';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../../',import.meta.url));
const baseline=process.argv.includes('--baseline');
const base='31c44ab635b672b589b7833bcbc78b41d36f1e75';
const source=path=>baseline?execFileSync('git',['show',`${base}:${path}`],{cwd:root,encoding:'utf8'}):readFileSync(resolve(root,path),'utf8');
function loader(overrides={},extra={}){
  const cache=new Map();
  function load(path){
    path=relative(root,resolve(root,path)).replaceAll('\\','/');
    if(cache.has(path))return cache.get(path);
    const target={exports:{}};cache.set(path,target.exports);
    const compiled=ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(compiled,{exports:target.exports,require:name=>{
      if(name in overrides)return overrides[name];
      if(name==='server-only')return {};
      if(name.startsWith('@/')||name.startsWith('.')){
        const candidate=name.startsWith('@/')?name.slice(2):resolve(dirname(path),name);
        return load(existsSync(resolve(root,candidate+'.ts'))?candidate+'.ts':candidate+'.tsx');
      }
      return require(name);
    },process:{env:{}},Buffer,TextDecoder,Request,Response,URL,AbortController,AbortSignal,fetch,setTimeout,clearTimeout,Date,Intl,console,...extra});
    return target.exports;
  }
  return load;
}
const errors=[
  ['missing SDK session',new AuthSessionMissingError(),401],
  ['rejected JWT',new AuthApiError('PRIVATE detail',401,'bad_jwt'),401],
  ['rejected session',new AuthApiError('PRIVATE detail',403),401],
  ['expired refresh',new AuthApiError('PRIVATE detail',400,'refresh_token_not_found'),401],
  ['replayed refresh',new AuthApiError('PRIVATE detail',400,'refresh_token_already_used'),401],
  ['expired session',new AuthApiError('PRIVATE detail',400,'session_expired'),401],
  ['unknown400',new AuthApiError('PRIVATE detail',400,'bad_json'),503],
  ['wrong endpoint404',new AuthApiError('PRIVATE detail',404),503],
  ['rate limited429',new AuthApiError('PRIVATE detail',429,'over_request_rate_limit'),503],
  ['upstream503',new AuthRetryableFetchError('PRIVATE detail',503),503],
  ['nonJSON parse',new AuthUnknownError('PRIVATE detail',SyntaxError('PRIVATE upstream')),503],
  ['configuration exception',Error('PRIVATE configuration'),503],
];
function harness(error,{user=null,origin=true,refreshThrows=false,signoutError=null,exchangeError=error,exchangeHangs=false,authHangs=false,claimsError=null,actionError=null,oldProof=false,configurationThrows=false}={}){
  const calls={reads:0,writes:0,refresh:0,signout:[],exchange:0,claims:0,update:0,action:0,emailFailures:0},timers=[],options=[];
  const db={auth:{getUser:async()=>authHangs?new Promise(()=>{}):({data:{user},error}),refreshSession:async()=>{calls.refresh++;if(refreshThrows)throw Error('PRIVATE network');return {error};},signOut:async scope=>{calls.signout.push(scope);return {error:signoutError};},
    getClaims:async()=>{calls.claims++;return {data:{claims:{amr:[{method:'otp',timestamp:Date.now()/1000-(oldProof?3600:10)}]}},error:claimsError};},
    updateUser:async()=>{calls.update++;return {error:actionError};},verifyOtp:async()=>{calls.action++;return {error:actionError};},signInWithOtp:async()=>{calls.action++;return {error:actionError};},resetPasswordForEmail:async()=>({error:actionError})},
    from:()=>{calls.reads++;throw Error('must not read private records');},rpc:()=>{calls.reads++;throw Error('must not read private RPC');}};
  const sdk={createServerClient:(_url,_key,config)=>{
    if(configurationThrows)throw Error('PRIVATE missing configuration');
    options.push(config);const update=()=>config.cookies.setAll([{name:'fixture-session',value:'opaque-fixture',options:{httpOnly:true,secure:true,path:'/'}}],{'Cache-Control':'private, no-cache, no-store, must-revalidate, max-age=0','Expires':'0','Pragma':'no-cache'});
    return {auth:{getUser:async()=>{update();return db.auth.getUser();},exchangeCodeForSession:async()=>{calls.exchange++;update();return exchangeHangs?new Promise(()=>{}):{error:exchangeError};}},from:db.from};
  }};
  const load=loader({'@/lib/supabase/server':{createClient:async()=>db},'../supabase/server':{createClient:async()=>db},'@/lib/supabase/admin':{createAdminClient:()=>{calls.writes++;throw Error('must not create private writer');}},'@/lib/auth/mobile-server':{sameOrigin:()=>origin,mobileEnabled:()=>true,admitMobile:async()=>{}},'@/lib/auth/email-health':{recordEmailFailure:()=>{calls.emailFailures++;}},'@supabase/ssr':sdk},{process:{env:{AUTH_EMAIL_ENABLED:'true'}},setTimeout:(callback,milliseconds)=>{timers.push({callback,milliseconds});return timers.length;},clearTimeout:()=>{}});
  const request=(action,body)=>new Request('https://site.example/api/auth/session',{method:'POST',headers:{origin:'https://site.example','content-type':'application/json'},body:body??JSON.stringify({action})});
  return {load,calls,timers,options,request};
}
const privateResponse=response=>{assert.match(response.headers.get('cache-control'),/no-store/);};
for(const [label,error,status] of errors){
  test(`session boundaries agree and perform no private IO: ${label}`,async()=>{
    const h=harness(error,{user:{id:'fixture-user'}});
    assert.equal(h.load('lib/auth/session-error.ts').authSessionFailure(error),status);
    assert.equal(h.load('lib/seasonal/resource-access.ts').resourceAuthStatus(error,{id:'fixture-user'}),status);
    const gateway=await h.load('lib/seasonal/server.ts').connectSeasonal();
    const auth=await gateway.authenticate();assert.equal(auth.user,null);assert.equal(auth.error,status===503);
    const access=await h.load('lib/seasonal/server.ts').getModuleAccess('resources','fixture-cohort');
    assert.equal(access.allowed,false);assert.equal(access.reason,status===401?'sign_in_required':'unavailable');
    for(const response of [await h.load('app/api/auth/session/route.ts').POST(h.request('refresh')),await h.load('app/api/auth/identity/route.ts').GET(),await h.load('app/api/auth/email/route.ts').POST(h.request(null,JSON.stringify({action:'set-password',password:'synthetic-only-value'}))),await h.load('app/api/auth/mobile/route.ts').POST(h.request(null,JSON.stringify({action:'link',phone:'+989121234567'})))]){
      assert.equal(response.status,status);privateResponse(response);assert.doesNotMatch(await response.text(),/PRIVATE|opaque-fixture/);
    }
    const response=await h.load('app/api/auth/status/route.ts').GET();
    assert.equal(response.status,status===503?503:200);privateResponse(response);
    const body=await response.json();assert.equal(body.authenticated,false);
    if(status===503)assert.equal(body.status,'network_or_configuration_error');
    const middleware=await h.load('middleware.ts').middleware(new NextRequest('https://site.example/admin?tab=course'));
    const redirect=new URL(middleware.headers.get('location'));assert.equal(redirect.searchParams.get('next'),'/admin?tab=course');
    assert.equal(redirect.searchParams.get('error'),status===503?'auth_unavailable':null);
    privateResponse(middleware);assert.match(middleware.headers.get('set-cookie'),/fixture-session=opaque-fixture/);assert.equal(middleware.headers.get('expires'),'0');assert.equal(middleware.headers.get('pragma'),'no-cache');
    assert.equal(h.calls.reads,0);assert.equal(h.calls.writes,0);assert.equal(h.calls.claims,0);assert.equal(h.calls.update,0);
  });
}
test('real SDK parses a canned429 as service unavailability, never an anonymous acceptance',async()=>{
  let calls=0;
  const sdk=createClient('https://fixture.invalid','fixture-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async()=>{calls++;return Response.json({code:'over_request_rate_limit',msg:'PRIVATE detail'},{status:429});}}});
  const {error}=await sdk.auth.getUser('opaque-fixture');assert.ok(error instanceof AuthApiError);
  assert.equal(loader()('lib/auth/session-error.ts').authSessionFailure(error),503);assert.equal(calls,1);
});
test('valid anonymous seasonal claim requires login, not a service failure',async()=>{
  const h=harness(new AuthSessionMissingError());const connect=h.load('lib/seasonal/server.ts').connectSeasonal;
  const response=await h.load('lib/seasonal/http.ts').postSeasonal(new Request('https://site.example/claim',{method:'POST',body:JSON.stringify({registrationRef:1})}),connect,'claim');
  assert.equal(response.status,401);assert.equal(h.calls.reads,0);privateResponse(response);
});
test('successful refresh and local signout retain existing receipt shape',async()=>{
  const h=harness(null);const session=h.load('app/api/auth/session/route.ts');
  for(const action of ['refresh','signout']){const response=await session.POST(h.request(action));assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});privateResponse(response);}
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.signout)),[{scope:'local'}]);assert.equal(h.calls.refresh,1);assert.equal(h.calls.reads,0);
});
for(const [label,options] of [['thrown refresh',{refreshThrows:true}],['failed signout',{signoutError:new AuthRetryableFetchError('PRIVATE outage',503)}]])test(label+' remains a service error',async()=>{
  const h=harness(null,options);const response=await h.load('app/api/auth/session/route.ts').POST(h.request(label==='failed signout'?'signout':'refresh'));
  assert.equal(response.status,503);privateResponse(response);assert.equal((await response.json()).ok,false);
});
test('cross-origin and malformed/unknown actions fail before any session operation',async()=>{
  const h=harness(null,{origin:false});const response=await h.load('app/api/auth/session/route.ts').POST(h.request('refresh'));assert.equal(response.status,403);privateResponse(response);assert.equal(h.calls.refresh,0);
  for(const body of ['{','null','[]','{"action":"other"}']){const local=harness(null);const rejected=await local.load('app/api/auth/session/route.ts').POST(local.request(null,body));assert.equal(rejected.status,400);privateResponse(rejected);assert.equal(local.calls.refresh,0);assert.equal(local.calls.signout.length,0);}
});
for(const [label,error,reason] of [
  ['consumed or missing PKCE verifier',new AuthPKCECodeVerifierMissingError(),'auth_callback_failed'],
  ['expired PKCE',new AuthApiError('PRIVATE expired',400,'flow_state_expired'),'auth_callback_failed'],
  ['unknown400',new AuthApiError('PRIVATE detail',400,'bad_json'),'auth_unavailable'],
  ['wrong endpoint404',new AuthApiError('PRIVATE detail',404),'auth_unavailable'],
  ['rate limited429',new AuthApiError('PRIVATE detail',429),'auth_unavailable'],
  ['provider500',new AuthApiError('PRIVATE detail',500),'auth_unavailable'],
  ['provider503',new AuthRetryableFetchError('PRIVATE detail',503),'auth_unavailable'],
  ['gateway outage',new AuthUnknownError('PRIVATE gateway',Error()),'auth_unavailable'],
])test(`callback preserves destination and cookie/cache updates: ${label}`,async()=>{
  const h=harness(error);const response=await h.load('app/auth/callback/route.ts').GET(new NextRequest('https://site.example/auth/callback?code=opaque-fixture-code&next=%2Fdashboard%3Fcohort%3Dfixture'));
  if(error instanceof AuthPKCECodeVerifierMissingError) assert.equal(h.load('lib/auth/session-error.ts').authSessionFailure(error),503);
  const next=new URL(response.headers.get('location'));assert.equal(next.pathname,'/login');assert.equal(next.searchParams.get('next'),'/dashboard?cohort=fixture');assert.equal(next.searchParams.get('error'),reason);assert.equal(next.searchParams.has('code'),false);privateResponse(response);assert.match(response.headers.get('set-cookie'),/fixture-session=opaque-fixture/);assert.equal(response.headers.get('expires'),'0');
});
test('successful callback returns only a safe local destination and preserved SSR cookies',async()=>{
  const h=harness(null);const response=await h.load('app/auth/callback/route.ts').GET(new NextRequest('https://site.example/auth/callback?code=opaque-fixture-code&next=%2F%2Fevil.invalid'));
  assert.equal(response.headers.get('location'),'https://site.example/dashboard');privateResponse(response);assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.equal(response.headers.get('pragma'),'no-cache');
});
test('missing callback code keeps the valid return path and never calls Auth',async()=>{
  const h=harness(null);const response=await h.load('app/auth/callback/route.ts').GET(new NextRequest('https://site.example/auth/callback?next=%2Fdashboard'));
  assert.equal(new URL(response.headers.get('location')).searchParams.get('next'),'/dashboard');assert.equal(h.calls.exchange,0);privateResponse(response);
});
for(const layer of ['callback','middleware'])test(`${layer} deadline rejects without private reads`,async()=>{
  const h=harness(null,{exchangeHangs:true,authHangs:true});
  const pending=layer==='callback'?h.load('app/auth/callback/route.ts').GET(new NextRequest('https://site.example/auth/callback?code=opaque-fixture-code&next=%2Fdashboard')):h.load('middleware.ts').middleware(new NextRequest('https://site.example/dashboard'));
  const deadline=h.timers.find(timer=>timer.milliseconds===8000);assert.ok(deadline);deadline.callback();
  const response=await pending;assert.equal(new URL(response.headers.get('location')).searchParams.get('error'),'auth_unavailable');privateResponse(response);assert.equal(h.calls.reads,0);
});
for(const layer of ['callback','middleware'])test(`${layer} initialization failure preserves destination without private IO`,async()=>{
  const h=harness(null,{configurationThrows:true});
  const response=layer==='callback'?await h.load('app/auth/callback/route.ts').GET(new NextRequest('https://site.example/auth/callback?code=opaque-fixture-code&next=%2Fdashboard')):await h.load('middleware.ts').middleware(new NextRequest('https://site.example/dashboard'));
  const destination=new URL(response.headers.get('location'));assert.equal(destination.searchParams.get('error'),'auth_unavailable');assert.equal(destination.searchParams.get('next'),'/dashboard');privateResponse(response);assert.equal(h.calls.reads,0);assert.equal(h.calls.writes,0);assert.equal(h.calls.exchange,0);
});
test('admin metadata does not bypass an explicit resource-module denial',async()=>{
  let calls=0;const allowed=await loader()('lib/seasonal/resource-access.ts').resourceModuleAllowed({rpc:async(name,args)=>{calls++;assert.equal(name,'seasonal_module_access');assert.equal(args.p_cohort,'fixture-cohort');return {data:{allowed:false},error:null};}},'resources','fixture-cohort');
  assert.equal(allowed,false);assert.equal(calls,1);
});
const confirmedUser={id:'fixture-user',phone:'+989121234567',phone_confirmed_at:'fixture-confirmation',email_confirmed_at:'fixture-confirmation'};
for(const [label,claimsError,status] of [['rejected claims',new AuthApiError('PRIVATE expired',401),401],['claims outage',new AuthRetryableFetchError('PRIVATE outage',503),503]])test(`${label} prevents password update in both channels`,async()=>{
  for(const channel of ['email','mobile']){const h=harness(null,{user:confirmedUser,claimsError});const response=await h.load(`app/api/auth/${channel}/route.ts`).POST(h.request(null,JSON.stringify({action:'set-password',phone:confirmedUser.phone,password:'synthetic-only-value'})));assert.equal(response.status,status);privateResponse(response);assert.equal(h.calls.update,0);assert.equal(h.calls.claims,1);assert.doesNotMatch(await response.text(),/PRIVATE/);}
});
test('an old confirmation proof cannot change either channel password',async()=>{
  for(const channel of ['email','mobile']){const h=harness(null,{user:confirmedUser,oldProof:true});const response=await h.load(`app/api/auth/${channel}/route.ts`).POST(h.request(null,JSON.stringify({action:'set-password',phone:confirmedUser.phone,password:'synthetic-only-value'})));assert.equal(response.status,403);assert.equal(h.calls.update,0);privateResponse(response);}
});
for(const [label,actionError,status] of [
  ['expired OTP',new AuthApiError('PRIVATE expired',400,'otp_expired'),400],
  ['invalid credentials',new AuthApiError('PRIVATE rejected',400,'invalid_credentials'),400],
  ['billing unavailable',new AuthApiError('PRIVATE payment',402),503],
  ['provider quota',new AuthApiError('PRIVATE limited',429,'over_sms_send_rate_limit'),429],
  ['disabled provider',new AuthApiError('PRIVATE disabled',400,'phone_provider_disabled'),503],
  ['transport outage',new AuthRetryableFetchError('PRIVATE outage',503),503],
  ['nonJSON action failure',new AuthUnknownError('PRIVATE gateway',SyntaxError()),503],
])test(`${label} remains distinct in mobile and email actions`,async()=>{
  for(const channel of ['email','mobile']){const h=harness(null,{actionError});const body=channel==='email'?{action:'verify',type:'signup',tokenHash:'f'.repeat(64)}:{action:'send',phone:'+989121234567'};const response=await h.load(`app/api/auth/${channel}/route.ts`).POST(h.request(null,JSON.stringify(body)));assert.equal(response.status,status);privateResponse(response);assert.doesNotMatch(await response.text(),/PRIVATE|completed/);}
});
test('a recovery request is an identical non-enumerating receipt when SMTP is unavailable',async()=>{
  for(const actionError of [null,new AuthRetryableFetchError('PRIVATE smtp',503)]){const h=harness(null,{actionError});const response=await h.load('app/api/auth/email/route.ts').POST(h.request(null,JSON.stringify({action:'recover',email:'fixture@example.invalid'})));assert.equal(response.status,200);const body=await response.json();assert.equal(body.status,'recovery_requested');assert.match(body.message,/اگر حسابی وجود/);assert.doesNotMatch(body.message,/PRIVATE|fixture@example/);assert.equal(h.calls.emailFailures,actionError?1:0);privateResponse(response);}
});
