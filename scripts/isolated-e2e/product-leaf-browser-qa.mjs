// Public Preview / educational actual-component QA. No product route or account.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,symlinkSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {preflight,cleanup} from './owned-chrome-qa.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const targets=Object.freeze({
  public331:Object.freeze({pr:331,sha:'f12ba71c353e135f83d136105380f20dd59a95e0',deployment:7441643728,origin:'https://portfolio-platform-i5oti0t87-safariarash7777-4463s-projects.vercel.app',path:'/symbol/'+encodeURIComponent('فولاد')}),
  member357:Object.freeze({pr:357,sha:'7752638842c3f4c8a6984e3ec753a6c92aad80fc',deployment:7442919120,origin:'https://portfolio-platform-nczywax8c-safariarash7777-4463s-projects.vercel.app',path:'/dashboard/consultation'}),
});
const digest=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe'],maxBuffer:4*1024**2});
export function compilerDiagnostics(error){
  const text=String(error.stdout??'');return {exitCode:Number.isInteger(error.status)?error.status:null,codes:[...new Set(text.match(/\bTS\d{3,5}\b/g)??[])].slice(0,10),locations:[...text.matchAll(/([a-zA-Z0-9_.-]+\.tsx?)\((\d+),(\d+)\): error (TS\d+):/g)].slice(0,10).map(m=>({file:m[1],line:Number(m[2]),column:Number(m[3]),code:m[4]}))};
}
export function qaRequestAllowed(value,method,target,localOrigin){
  if(!['GET','HEAD'].includes(method)||typeof value!=='string')return false;
  try{
    const u=new URL(value);if(u.username||u.password||u.hash||/%(?:2e|2f|5c|25|00)/i.test(value.split('?')[0]))return false;
    if(localOrigin&&u.origin===localOrigin)return ['/', '/bundle.js','/style.css','/fonts/Vazirmatn-Variable.woff2','/fonts/Pelak-Bold.woff2','/fonts/Pelak-ExtraBold.woff2','/fonts/Pelak-Black.woff2'].includes(u.pathname)&&(!u.search||u.pathname==='/'&&/^\?mode=(?:advisor|member|revoked|read-error)$/.test(u.search));
    if(!target||u.origin!==target.origin)return false;
    if(u.pathname===target.path)return !u.search;
    if(u.pathname.startsWith('/_next/static/'))return /^\/[a-zA-Z0-9_./()[\]@%-]+$/.test(u.pathname)&&[...u.searchParams].every(([k,v])=>['dpl','v'].includes(k)&&/^[a-zA-Z0-9_-]{1,100}$/.test(v));
    if(['/brand/mark.png','/fonts/Vazirmatn-Variable.woff2','/fonts/Pelak-Bold.woff2','/fonts/Pelak-ExtraBold.woff2','/fonts/Pelak-Black.woff2'].includes(u.pathname))return !u.search;
    if(u.pathname==='/_next/image')return [...u.searchParams.keys()].every(k=>['url','w','q'].includes(k))&&u.searchParams.get('url')==='/brand/mark.png'&&/^\d{1,4}$/.test(u.searchParams.get('w')??'')&&/^\d{1,3}$/.test(u.searchParams.get('q')??'');
    if(target.pr===331&&['/api/symbol-detail','/api/codal-list'].includes(u.pathname)){const key=u.pathname==='/api/symbol-detail'?'l18':'symbol';return [...u.searchParams.keys()].length===1&&u.searchParams.get(key)==='فولاد';}
    return false;
  }catch{return false;}
}
async function deploymentIdentity(target){
  const base='https://api.github.com/repos/safariarash7777-source/portfolio-platform',headers={Accept:'application/vnd.github+json'};
  if(process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
  const get=async path=>{const r=await fetch(base+path,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'qa_github_identity_read');return r.json();};
  const deployment=await get('/deployments/'+target.deployment),statuses=await get('/deployments/'+target.deployment+'/statuses');
  assert.equal(deployment.sha,target.sha);assert.equal(deployment.environment,'Preview');
  assert.ok(statuses.some(x=>x.state==='success'&&x.environment_url===target.origin));
  return {...target,mapping:'GitHub exact-sha deployment + successful canonical environment_url',branchAliasUsed:false};
}
async function attach(state,context,target,localOrigin){
  const page=await context.newPage(),cdp=await context.newCDPSession(page),audit={blockedRequests:0,nonReadRequests:0,pageErrors:0,authRedirectBlocked:false};
  state.contexts.push(context);page.on('pageerror',()=>audit.pageErrors++);
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  cdp.on('Fetch.requestPaused',event=>{void(async()=>{
    if(!qaRequestAllowed(event.request.url,event.request.method,target,localOrigin)){
      audit.blockedRequests++;if(!['GET','HEAD'].includes(event.request.method))audit.nonReadRequests++;
      const u=new URL(event.request.url);if(['/login','/dashboard'].some(p=>u.pathname.startsWith(p))||u.hostname==='vercel.com')audit.authRedirectBlocked=true;
      await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});return;
    }
    await cdp.send('Fetch.continueRequest',{requestId:event.requestId});
  })().catch(()=>{audit.interceptionFailed=true;});});
  return {page,audit};
}
async function snapshot(page,output,name){
  await page.evaluate(async()=>{await document.fonts.ready;scrollTo(0,0);});await page.waitForTimeout(250);
  const metrics=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,rtl:document.documentElement.dir==='rtl',bodyCharacters:document.body.innerText.length}));
  assert.ok(metrics.bodyCharacters>100&&metrics.height<16000,'qa_invalid_or_unbounded_document');
  const path=resolve(output,name+'.png');await page.screenshot({path,fullPage:true});assert.ok(statSync(path).size<16*1024**2);
  return {name:name+'.png',sha256:digest(readFileSync(path)),...metrics,horizontalOverflow:metrics.documentWidth>metrics.width+2};
}
async function publicPreview(state,target,output){
  const result={target,scope:'real public Preview; no account or credentials',screenshots:[],viewports:[]};
  for(const width of [1440,390]){
    const context=await state.browser.newContext({serviceWorkers:'block',viewport:{width,height:1000}}),{page,audit}=await attach(state,context,target);
    try{
      const response=await page.goto(target.origin+target.path,{waitUntil:'domcontentloaded',timeout:60000});
      if(response?.status()!==200||page.url()!==target.origin+target.path||audit.authRedirectBlocked){result.status='BLOCKED';result.boundary='canonical_preview_navigation_or_protection';continue;}
      await page.getByText('فولاد',{exact:false}).first().waitFor({timeout:20000});
      result.screenshots.push(await snapshot(page,output,'331-public-'+width));
      const codal=page.getByRole('tab',{name:'گزارش‌ها',exact:true});assert.equal(await codal.count(),1,'qa_public_reports_tab_missing');
      await codal.click();assert.equal(await codal.getAttribute('aria-selected'),'true');result.screenshots.push(await snapshot(page,output,'331-codal-'+width));
      const fetchList=page.getByRole('button',{name:/دریافت فهرست/});
      let readStatus=null,filterInteraction='NOT_AVAILABLE';
      if(await fetchList.count()===1&&await fetchList.isEnabled()){
        const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/codal-list'&&r.request().method()==='GET',{timeout:25000}).catch(()=>null);
        await fetchList.click();readStatus=(await response)?.status()??null;await page.waitForFunction(()=>!document.body.innerText.includes('در حال دریافت…'),{},{timeout:25000});
        const search=page.getByRole('searchbox',{name:'جست‌وجو در عنوان'});
        if(await search.count()===1){await search.fill('QA_NO_MATCH_20261030');await page.getByText(/در فهرست دریافت‌شده موردی با این فیلتر پیدا نشد/).waitFor();await page.getByRole('button',{name:'پاک‌کردن فیلترها',exact:true}).click();assert.equal(await search.inputValue(),'');filterInteraction='REAL_FILTER_AND_RESET_OBSERVED';}
        result.screenshots.push(await snapshot(page,output,'331-codal-read-'+width));
      }
      result.viewports.push({width,readStatus,filterInteraction,...audit});assert.equal(audit.nonReadRequests,0);assert.ok(!audit.interceptionFailed);
    }catch(error){result.status='BLOCKED';result.boundary=error?.name==='TimeoutError'?'public_document_or_control_timeout':'public_document_boundary';result.viewports.push({width,...audit});}
    finally{await context.close();}
  }
  result.status??='OBSERVED';return result;
}
const example=String.raw`
import React from 'react';
import {createRoot} from 'react-dom/client';
import SessionCard from './components/consultation/SessionCard';
import type {ConsultationSession,ConsultationAction,RecommendationBody,FinancialBasis} from './lib/consultation/contracts';
import type {ReplyRead} from './lib/consultation/replies';
const mode=new URLSearchParams(location.search).get('mode')??'advisor';
const actor='11111111-1111-4111-8111-111111111111',relation='22222222-2222-4222-8222-222222222222',sid='33333333-3333-4333-8333-333333333333',member='44444444-4444-4444-8444-444444444444';
const basis:FinancialBasis={holdingsVersionId:null,cashFlowVersionId:null,goalsVersionId:null,cashFlowPeriod:{startOn:'2026-10-01',endOn:'2026-10-31'}};
const body:RecommendationBody={topic:'آموزشی: پیگیری پرسش‌های نسخهٔ مشخص',goal:'بررسی رابط مؤلفه با دادهٔ مصنوعی',clientSummary:'این نمونه متعلق به هیچ حساب یا عضو واقعی نیست.',rationale:'فقط نمایش تاریخچه و رفتار کنترل‌های واقعی بررسی می‌شود.',limitations:'حساب، پایگاه داده و حق خدمت متصل نیستند؛ توصیهٔ مالی ارائه نمی‌شود.',reviewOn:'2099-01-01',basis,evidence:[],researchVersionIds:[],actions:[{actionKey:actor,title:'اقدام آموزشیِ همین نسخه',responsible:'member',dueOn:'2099-01-01'}]};
const session:ConsultationSession={id:sid,relationshipId:relation,sessionKey:sid,version:3,createdAt:'2026-10-24T10:00:00Z',actorId:actor,contentHash:'a'.repeat(64),body,state:'published',approval:null};
const feedback:ConsultationAction[]=[{id:'q1',sessionId:sid,actionKey:actor,version:1,status:'question',text:'پرسش آموزشی نخست دربارهٔ همین اقدام',actorId:member,createdAt:session.createdAt},{id:'q2',sessionId:sid,actionKey:actor,version:2,status:'question',text:'پرسش آموزشی مستقل بدون پاسخ ثبت‌شده',actorId:member,createdAt:session.createdAt},{id:'done',sessionId:sid,actionKey:actor,version:3,status:'done',text:null,actorId:member,createdAt:session.createdAt}];
const replies:ReplyRead={contractVersion:'consultation-reply-read.v1',actorId:mode==='advisor'?actor:member,relationshipId:relation,sessionId:sid,canReply:mode==='advisor',readOnlyReason:mode==='revoked'?'revoked':mode==='advisor'?null:'not_owner',replies:[1,2].map(version=>({id:'r'+version,questionId:'q1',sessionId:sid,version,text:version===1?'پاسخ آموزشی پیشین':'پاسخ آموزشی تازه',actorId:actor,createdAt:session.createdAt,contentHash:'b'.repeat(64)}))};
createRoot(document.getElementById('root')!).render(<main className="container-page py-6 space-y-5"><header className="card p-4 space-y-2"><h1 className="text-xl font-bold">آموزشی — مؤلفهٔ واقعی، دادهٔ مصنوعی</h1><p>PR357 / 7752638 · فقط اثبات مؤلفه؛ حساب، DB، خدمت و پذیرش آرش اثبات نشده‌اند.</p></header><SessionCard session={session} latest={mode!=='revoked'} advisor={mode==='advisor'} owner={false} revoked={mode==='revoked'} basis={basis} feedback={feedback} locked={mode!=='advisor'} onCommand={async()=>false} onEdit={()=>{}} onDirty={()=>{}} replies={mode==='read-error'?undefined:replies} replyError={mode==='read-error'?'خواندن پاسخ‌ها انجام نشد — حالت آموزشی':undefined} onReply={async()=>false}/></main>);
`;
async function componentServer(state){
  const source=resolve(state.local,'component-source');mkdirSync(source);
  state.qaStage='component_source_fetch';
  git('fetch','--no-tags','--depth=1','origin',targets.member357.sha);assert.equal(git('rev-parse',targets.member357.sha+'^{commit}').toString().trim(),targets.member357.sha);
  state.qaStage='component_archive';
  const archive=resolve(state.local,'component-source.tar');execFileSync('git',['-c','core.autocrlf=false','archive','--format=tar','--output',archive,targets.member357.sha,'app/globals.css','components/consultation','lib','public/fonts','tailwind.config.js','postcss.config.js','tsconfig.json','package.json','package-lock.json'],{cwd:root,stdio:'pipe'});
  execFileSync('tar',['-xf',archive,'-C',source],{stdio:'pipe'});symlinkSync(resolve(root,'node_modules'),resolve(source,'node_modules'),'dir');
  const entry=resolve(source,'qa-leaf.tsx');writeFileSync(entry,example,{mode:0o600});
  const require=createRequire(import.meta.url),{build}=require('esbuild');
  state.qaStage='component_dependency_identity';
  const sourceLock=JSON.parse(readFileSync(resolve(source,'package-lock.json'),'utf8')),qaLock=JSON.parse(readFileSync(resolve(root,'package-lock.json'),'utf8'));
  const dependencyIdentity=Object.fromEntries(['react','react-dom','typescript','esbuild','tailwindcss'].map(name=>{const key='node_modules/'+name;assert.deepEqual(qaLock.packages[key],sourceLock.packages[key],'qa_source_dependency_identity');return [name,qaLock.packages[key].version];}));
  writeFileSync(resolve(source,'qa-tsconfig.json'),JSON.stringify({extends:'./tsconfig.json',compilerOptions:{noEmit:true,incremental:false},include:['qa-leaf.tsx'],exclude:['node_modules']}),{mode:0o600});
  state.qaStage='component_props_typecheck';
  try{execFileSync(process.execPath,[require.resolve('typescript/bin/tsc'),'-p',resolve(source,'qa-tsconfig.json')],{cwd:source,stdio:'pipe',timeout:60000});}
  catch(error){console.log('PRODUCT_LEAF_BUILD_FAILURE '+JSON.stringify({phase:state.qaStage,...compilerDiagnostics(error)}));throw Error('qa_props_typecheck_failed');}
  state.qaStage='component_bundle';
  await build({entryPoints:[entry],bundle:true,platform:'browser',format:'iife',outfile:resolve(source,'bundle.js'),tsconfig:resolve(source,'tsconfig.json'),logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'}});
  state.qaStage='component_css';
  execFileSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-i',resolve(source,'app/globals.css'),'-o',resolve(source,'style.css'),'--config',resolve(source,'tailwind.config.js'),'--content',resolve(source,'components/consultation/**/*.tsx')+','+entry],{cwd:source,stdio:'pipe',timeout:60000});
  const fontCSS=`@font-face{font-family:Vazirmatn;src:url('/fonts/Vazirmatn-Variable.woff2');font-weight:100 900;font-display:swap}@font-face{font-family:Pelak;src:url('/fonts/Pelak-Bold.woff2');font-weight:700;font-display:swap}@font-face{font-family:Pelak;src:url('/fonts/Pelak-ExtraBold.woff2');font-weight:800;font-display:swap}@font-face{font-family:Pelak;src:url('/fonts/Pelak-Black.woff2');font-weight:900;font-display:swap}:root{--font-vazirmatn:Vazirmatn;--font-pelak:Pelak;--font-display:Pelak}`;
  const css=Buffer.concat([readFileSync(resolve(source,'style.css')),Buffer.from(fontCSS)]);
  const html=Buffer.from('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>آموزشی — مؤلفهٔ واقعی PR357</title><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  const files=new Map([['/',{body:html,type:'text/html; charset=utf-8'}],['/bundle.js',{body:readFileSync(resolve(source,'bundle.js')),type:'application/javascript'}],['/style.css',{body:css,type:'text/css'}]]);
  for(const name of ['Vazirmatn-Variable','Pelak-Bold','Pelak-ExtraBold','Pelak-Black'])files.set('/fonts/'+name+'.woff2',{body:readFileSync(resolve(source,'public/fonts',name+'.woff2')),type:'font/woff2'});
  const server=createServer((req,res)=>{const file=files.get(new URL(req.url,'http://localhost').pathname);if(!['GET','HEAD'].includes(req.method)||!file){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':file.type,'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none';script-src 'self';style-src 'self' 'unsafe-inline';font-src 'self';connect-src 'none';frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:file.body);});
  state.qaStage='component_static_server';
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
  return {server,origin:'http://127.0.0.1:'+server.address().port,dependencyIdentity,propsTypecheck:'PASS',sourceManifest:Object.fromEntries(['components/consultation/SessionCard.tsx','components/consultation/RepliesPanel.tsx','components/consultation/questionFollowUp.ts','app/globals.css','tailwind.config.js',...['Vazirmatn-Variable','Pelak-Bold','Pelak-ExtraBold','Pelak-Black'].map(name=>'public/fonts/'+name+'.woff2')].map(path=>[path,{gitBlob:git('rev-parse',targets.member357.sha+':'+path).toString().trim(),sha256:digest(readFileSync(resolve(source,path)))}])),exampleSha256:digest(example),compiledCssSha256:digest(css)};
}
async function educationalComponent(state,server,output){
  const result={scope:'actual TSX/CSS from PR357@775; educational props only; no account/DB/service proof',sourceSha:targets.member357.sha,sourceManifest:server.sourceManifest,propsTypecheck:server.propsTypecheck,dependencyIdentity:server.dependencyIdentity,exampleSha256:server.exampleSha256,compiledCssSha256:server.compiledCssSha256,screenshots:[],checks:[]};
  for(const width of [1440,390])for(const mode of ['advisor','revoked','read-error']){
    const context=await state.browser.newContext({serviceWorkers:'block',viewport:{width,height:1000}}),{page,audit}=await attach(state,context,null,server.origin);
    try{
      await page.goto(server.origin+'/?mode='+mode,{waitUntil:'load'});await page.getByRole('heading',{name:'آموزشی — مؤلفهٔ واقعی، دادهٔ مصنوعی'}).waitFor();
      if(mode==='read-error'){assert.equal(await page.getByText('خواندن پاسخ‌ها انجام نشد — حالت آموزشی',{exact:true}).count(),1);assert.equal(await page.getByText(/پرسش بدون پاسخ ثبت‌شده ·/).count(),0);}
      else{
        assert.equal(await page.getByText('۱ پرسش بدون پاسخ ثبت‌شده · ۱ پرسش دارای پاسخ ثبت‌شده',{exact:true}).count(),1);
        const filter=page.getByLabel('نمایش پرسش‌ها');await filter.selectOption('waiting');assert.equal(await page.getByText('پرسش آموزشی نخست دربارهٔ همین اقدام',{exact:true}).count(),0);assert.equal(await page.getByText('پرسش آموزشی مستقل بدون پاسخ ثبت‌شده',{exact:true}).count(),1);await filter.selectOption('all');
        await page.getByText('نسخه‌های قبلی پاسخ',{exact:true}).click();assert.ok(await page.getByText('پاسخ آموزشی پیشین',{exact:true}).isVisible());
        if(mode==='advisor'){
          await page.getByRole('button',{name:'اصلاح پاسخ در نسخهٔ تازه',exact:true}).click();await page.getByLabel('متن پاسخ مشاور').fill('ویرایش آموزشی؛ ارسال نشده است.');assert.ok(await filter.isDisabled());
          result.screenshots.push(await snapshot(page,output,'357-educational-edit-'+width));
          await page.getByRole('button',{name:'انصراف از ویرایش پاسخ',exact:true}).click();assert.ok(await filter.isEnabled());await filter.focus();assert.ok(await filter.evaluate(el=>el===document.activeElement));
        }else{assert.equal(await page.getByRole('button',{name:/نوشتن پاسخ|اصلاح پاسخ|ثبت پرسش خصوصی/}).count(),0);}
      }
      result.screenshots.push(await snapshot(page,output,'357-educational-'+mode+'-'+width));assert.equal(audit.nonReadRequests,0);assert.equal(audit.pageErrors,0);assert.equal(audit.blockedRequests,0);assert.ok(!audit.interceptionFailed);result.checks.push({width,mode,status:'PASS',...audit});
    }finally{await context.close();}
  }
  result.status='PASS_COMPONENT_ONLY';return result;
}
async function run(){
  assert.equal(process.platform,'linux');const qaSha=git('rev-parse','HEAD').toString().trim(),output=resolve(root,'product-leaf-qa-artifacts');assert.ok(!existsSync(output));mkdirSync(output,{mode:0o700});
  const report={qaSha,source356Frozen:'67aeda9ff84fb1d3e936fc39564c0e551b3ff17e',recordedAt:new Date().toISOString(),primaryTouched:false,modelCalls:0,infrastructureCost:null,dataCost:null,modelCost:null,newPurchase:false,arashAcceptance:'UNOBSERVED'};
  let state,server;
  try{
    report.deployments=await Promise.all(Object.values(targets).map(deploymentIdentity));
    state=await preflight();report.chrome={sourceSha256:state.sourceSha256,chromeSha256:state.chromeSha256,chromeVersion:state.chromeVersion,closure:state.closure};
    report.public331=await publicPreview(state,targets.public331,output);
    const probe=await fetch(targets.member357.origin+targets.member357.path,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(15000)});report.real357={sourceSha:targets.member357.sha,httpStatus:probe.status,status:probe.status===200?'NEEDS_VALID_SESSION_REVIEW':'BLOCKED',credentialsSent:false,redirectsFollowed:false,accountScreenshot:false};
    server=await componentServer(state);state.qaStage='component_dom';report.component357=await educationalComponent(state,server,output);
  }catch(error){report.status='BLOCKED';report.failureStage=state?.qaStage??'deployment_or_browser';report.failureCode=/^qa_[a-z0-9_]+$/.test(error.message)?error.message:error?.name==='TimeoutError'?'qa_browser_timeout':'qa_boundary_failed';}
  finally{
    if(server)await new Promise(ok=>server.server.close(ok));
    if(state)report.cleanup=await cleanup(state);
    report.status??='REVIEWABLE_WITH_EXPLICIT_SCOPE_LIMITS';writeFileSync(resolve(output,'qa-receipt.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log('PRODUCT_LEAF_QA '+JSON.stringify({qaSha,status:report.status,public331:report.public331?.status,component357:report.component357?.status,real357:report.real357?.status,cleanup:report.cleanup}));
  }
  if(report.status==='BLOCKED')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await run();
