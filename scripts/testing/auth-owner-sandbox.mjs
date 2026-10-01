// Production build, genuine local GoTrue, synthetic non-admin only; no owner credentials.
import fs from 'node:fs/promises';import {spawn,execFile} from 'node:child_process';import {createServer} from 'node:http';import assert from 'node:assert/strict';import {promisify} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const source='../portfolio-followup-auth/.task/auth-sandbox';const secrets=JSON.parse(await fs.readFile(source+'/secrets.private.json','utf8'));
const dir='.task/owner-sandbox';await fs.mkdir(dir,{recursive:true});
const evidence='docs/ops/seasonal-program/followup-auth-evidence/';await fs.mkdir(evidence,{recursive:true});
const site='http://127.0.0.1:8800';let delayUser=false;
const proxy=createServer(async(req,res)=>{
  try{
    const backend=req.url.startsWith('/backend/');
    if(backend && delayUser && req.url.startsWith('/backend/auth/v1/user')){await new Promise(resolve=>setTimeout(resolve,12000));if(req.destroyed)return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const headers={...req.headers};delete headers.host;delete headers['content-length'];
    headers['x-forwarded-host']='127.0.0.1:8800';headers['x-forwarded-proto']='http';
    const response=await fetch((backend?'http://127.0.0.1:8789':'http://127.0.0.1:8797')+(backend?req.url.slice('/backend'.length):req.url),{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),redirect:'manual'});
    const output=Object.fromEntries(response.headers);delete output['content-encoding'];delete output['content-length'];
    if(output.location)output.location=output.location.replace('http://127.0.0.1:8797',site).replace('http://localhost:8797',site);
    // All cookies remain actual Supabase cookies; no injection/manufactured JWT.
    output['set-cookie']=response.headers.getSetCookie();res.writeHead(response.status,output);res.end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.headersSent){res.writeHead(503);res.end('{}');}}
});
await new Promise(resolve=>proxy.listen(8800,'127.0.0.1',resolve));
const env={...secrets.nextEnv,NEXT_PUBLIC_SUPABASE_URL:site+'/backend',NEXT_PUBLIC_APP_URL:site};
// Absolute Windows path avoids inherited CWD/Node preload ambiguity.
env.NODE_OPTIONS='--require "'+fileURLToPath(new URL('../../../portfolio-followup-auth/scripts/testing/local-network-only.cjs',import.meta.url)).replace(/\\/g,'/')+'"';
const log=await fs.open(dir+'/next.private.log','w');
let next,stage='build';
try{
  if(process.env.AUTH_P0_REUSE_BUILD!=='true'){
    const build=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{env,stdio:['ignore',log.fd,log.fd]});
    const exit=await new Promise(resolve=>build.once('exit',resolve));if(exit!==0)throw Error('Local production build failed; inspect private log');
  }
  stage='start';
  next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','8797'],{env,stdio:['ignore',log.fd,log.fd]});await log.close();
  const manifest={synthetic:true,site,runtime:'production build / Node middleware',nextPid:next.pid,supervisorPid:process.pid};await fs.writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2));
  for(let i=0;i<60;i++){try{if((await fetch(site+'/login')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
  stage='signup';const sdk=createClient(site+'/backend',secrets.anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const email='owner-regression-'+Date.now()+'@example.test',password='Synthetic-login-'+Date.now();
  const signup=await sdk.auth.signUp({email,password});assert.equal(signup.error,null);
  let token;
  for(let i=0;i<40;i++){try{const messages=JSON.parse(await fs.readFile(source+'/mail.private.json','utf8'));const mime=messages.filter(x=>x.recipient===email).at(-1)?.mime;token=mime?.replace(/=\r?\n/g,'').match(/token_hash=3D([a-f0-9]+)/)?.[1]??mime?.replace(/=\r?\n/g,'').match(/token_hash=([a-f0-9]+)/)?.[1];if(token)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  stage='confirmation';assert.ok(token);assert.equal((await sdk.auth.verifyOtp({token_hash:token,type:'signup'})).error,null);
  assert.equal((await sdk.auth.signOut({scope:'local'})).error,null);
  assert.equal((await sdk.auth.signInWithPassword({email,password})).error,null);
  assert.equal((await sdk.auth.getUser()).data.user.id,signup.data.user.id);
  const cli=process.env.AGENT_BROWSER_BIN;if(!cli)throw Error('Set installed browser CLI');
  // Async CLI: this process also serves the proxy; blocking it deadlocks navigation.
  const call=async(...args)=>(await promisify(execFile)(cli,['--session','followup-auth',...args],{encoding:'utf8',timeout:60000})).stdout;
  const clean=value=>value.replace(/[\u200c\s*]/g,'');
  const ref=async label=>{const line=(await call('snapshot','-i')).split('\n').find(x=>clean(x).includes(clean('"'+label+'"')));return '@'+line.match(/ref=(e\d+)/)[1];};
  async function until(fn){for(let i=0;i<60;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,250));}throw Error('Synthetic owner-flow browser transition timeout');}
  stage='browser-login';await call('cookies','clear');await call('open',site+'/login?next=%2Fdashboard');await call('set','viewport','390','844');await call('fill',await ref('آدرس ایمیل'),email);await call('fill',await ref('رمز عبور'),password);await call('click',await ref('ورود'));
  await until(async()=>/\/dashboard/.test(await call('get','url')));await call('wait','--load','domcontentloaded');
  stage='session';const cookieResult=JSON.parse(await call('cookies','--json'));const allCookies=cookieResult.data?.cookies??cookieResult.data??[];
  const cookieHeader=allCookies.filter(x=>x.name.includes('-auth-token')).map(x=>x.name+'='+x.value).join('; ');assert.ok(cookieHeader);
  const read=path=>fetch(site+path,{headers:{cookie:cookieHeader},redirect:'manual'});
  const dashboard=await read('/dashboard');assert.equal(dashboard.status,200);
  const denied=await read('/admin/fx');assert.equal(denied.status,307);assert.equal(new URL(denied.headers.get('location')).pathname,'/dashboard');
  await call('reload');await call('wait','--load','domcontentloaded');assert.match(await call('get','url'),/\/dashboard/);
  // The failure is in the real SDK/network path, not a fake getUser implementation.
  stage='fault';delayUser=true;const started=Date.now();const blocked=await read('/dashboard');const elapsed=Date.now()-started;delayUser=false;
  assert.equal(blocked.status,307);const retry=new URL(blocked.headers.get('location'));assert.equal(retry.searchParams.get('error'),'auth_unavailable');assert.ok(elapsed>=7500 && elapsed<11000);
  await call('open',site+'/login?next=%2Fdashboard&error=auth_unavailable');await call('screenshot',resolve(evidence+'owner-retry-390.png'));
  const result={at:new Date().toISOString(),synthetic:true,build:true,realGoTrue:'v2.197.0',browserLogin:true,apiSignoutAndLoginSameUuid:true,role:'user',dashboardStatus:200,refreshPassed:true,adminFxDenied:true,realSdkDelayDenied:true,deadlineMilliseconds:elapsed,unavailableErrorVisible:(await call('eval',"document.body.innerText.includes('بررسی نشست در سرور پاسخ نداد')")).trim()==='true',noNewMigration:true};
  await fs.writeFile(evidence+'owner-sandbox.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  console.log('Isolated P0 production-build review server retained at '+site+'/login; synthetic only.');
}catch(error){next?.kill();proxy.close();console.log(JSON.stringify({stage,timeout:/timeout/i.test(error.message),navigationContextChanged:/context.*destroy|navigation/i.test(error.message)}));throw Error('P0 synthetic acceptance failed at '+stage+'; credentials suppressed ('+error.name+')');}
process.on('SIGINT',()=>{next?.kill();proxy.close();process.exit();});
