// P09.1: real Next page / Chrome DOM. Reuses the owned native runtime and nine phases.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,realpathSync,statSync,existsSync,rmSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {runNativeAuthProfile,verifyEnvironment,allowedProfileURL,origin,browserChecks} from './native-auth-runtime.mjs';
import {workbookNativeScenarios} from './workbook-native-auth.mjs';
const endpoint='/api/admin/intelligence/workbooks',executable='/opt/google/chrome/chrome';
const check=(v,code)=>{if(!v)throw Error(code);};
const digest=v=>createHash('sha256').update(v).digest('hex');
export function chromeFileCompatible(meta){return meta.isFile&&meta.elf&&(meta.uid===0||meta.uid===meta.runnerUid)&&(meta.mode&0o022)===0;}
export function browserDestination(url,method='GET'){
 try{const u=new URL(url);if(u.hash||!url.startsWith(origin+'/'))return false;const raw=url.slice(origin.length).split('?')[0];if(/%(?:2e|2f|5c|25|00)/i.test(raw)||/[\\\u0000-\u0020]/.test(raw)||raw.split('/').some(x=>x==='.'||x==='..'))return false;allowedProfileURL('p09',url,true,method);return true;}catch{return false;}
}
export function sdkCookies(header){
 check(typeof header==='string'&&header.length>0,'p09_browser_sdk_cookie_missing');
 return header.split('; ').map(part=>{const i=part.indexOf('=');check(i>0,'p09_browser_sdk_cookie_invalid');return {name:part.slice(0,i),value:part.slice(i+1),url:origin,sameSite:'Lax'};});
}
function descendants(pid,seen=new Map()){
 try{
  const text=readFileSync('/proc/'+pid+'/stat','utf8'),rest=text.slice(text.lastIndexOf(')')+2).split(' ');seen.set(pid,rest[19]);
  for(const child of readFileSync('/proc/'+pid+'/task/'+pid+'/children','utf8').trim().split(/\s+/).filter(Boolean))descendants(Number(child),seen);
 }catch{/* A process may exit during this owned-tree read. */}return seen;
}
function sameProcess(pid,birth){try{const t=readFileSync('/proc/'+pid+'/stat','utf8');return t.slice(t.lastIndexOf(')')+2).split(' ')[19]===birth;}catch{return false;}}
async function preflight(){
 verifyEnvironment();check(existsSync(executable)&&realpathSync(executable)===executable,'p09_browser_existing_chrome_missing');
 const meta=statSync(executable),binary=readFileSync(executable),chromeSha256=digest(binary),fileIdentity={isFile:meta.isFile(),elf:binary.subarray(0,4).equals(Buffer.from([127,69,76,70])),uid:meta.uid,runnerUid:process.getuid(),mode:meta.mode&0o777};
 console.log('P09_BROWSER_PREFLIGHT_READ '+JSON.stringify({phase:'existing-chrome-file',executable,...fileIdentity,sha256:chromeSha256}));
 check(chromeFileCompatible(fileIdentity),'p09_browser_chrome_identity');
 const versionEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','LANG','TMPDIR'].includes(key))),chromeVersion=execFileSync(executable,['--version'],{env:versionEnv,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}).trim();
 check(/^Google Chrome [0-9.]+(?: .*)?$/.test(chromeVersion),'p09_browser_chrome_version');
 const require=createRequire(import.meta.url);check(require('playwright-core/package.json').version==='1.64.1','p09_browser_driver_version');
 const {chromium}=await import('playwright-core'),tempRoot=realpathSync(process.env.RUNNER_TEMP),local=mkdtempSync(resolve(tempRoot,'p09-browser-')),owner=randomUUID();
 check(realpathSync(local)===local&&dirname(local)===tempRoot,'p09_browser_owned_temp');writeFileSync(resolve(local,'owner.json'),JSON.stringify({owner,executable,chromeSha256}),{mode:0o600});
 const state={local,tempRoot,owner,chromeSha256,chromeVersion,contexts:[],checks:[],stage:'preflight',server:null,browser:null};
 const priorTmp=process.env.TMPDIR;process.env.TMPDIR=local;
 try{
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','LANG','TMPDIR'].includes(key)));env.XDG_CONFIG_HOME=resolve(local,'config');env.XDG_CACHE_HOME=resolve(local,'cache');
  state.server=await chromium.launchServer({executablePath:executable,headless:true,host:'127.0.0.1',env,timeout:30000,args:['--disable-background-networking','--disable-crash-reporter']});
  const ws=new URL(state.server.wsEndpoint());check(ws.protocol==='ws:'&&ws.hostname==='127.0.0.1','p09_browser_loopback_control');
  state.process=state.server.process();check(state.process?.pid>0,'p09_browser_owned_process');
  const profile=state.process.spawnargs.find(x=>x.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
  check(profile&&realpathSync(profile).startsWith(local+'/'),'p09_browser_profile_outside_owned_temp');
  state.browser=await chromium.connect(state.server.wsEndpoint());const context=await state.browser.newContext({serviceWorkers:'block'});state.contexts.push(context);
  const page=await context.newPage(),cdp=await context.newCDPSession(page),version=await cdp.send('Browser.getVersion');
  check(/^Chrome\/[0-9.]+$/.test(version.product),'p09_browser_cdp_version');
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:origin+endpoint,requestStage:'Response'}]});
  try{await cdp.send('Fetch.continueResponse',{requestId:'p09-preflight-no-request'});throw Error('p09_browser_cdp_probe_unexpected');}catch(error){check(/Invalid InterceptionId|Invalid requestId/i.test(error.message),'p09_browser_response_interception_unsupported');}
  await cdp.send('Fetch.disable');await context.close();check(page.isClosed()&&context.isClosed(),'p09_browser_preflight_context_cleanup');
  return state;
 }catch(error){await cleanup(state);throw error;}finally{if(priorTmp===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=priorTmp;}
}
async function cleanup(s){
 const owned=s.process?descendants(s.process.pid):new Map();
 for(const context of s.contexts)if(!context.isClosed())await context.close();
 if(s.browser?.isConnected())await s.browser.close();
 if(s.server){try{await s.server.close();}catch{await s.server.kill();}}
 const deadline=Date.now()+8000;while([...owned].some(([pid,birth])=>sameProcess(pid,birth))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
 const stopped=[...owned].every(([pid,birth])=>!sameProcess(pid,birth));check(stopped,'p09_browser_owned_process_cleanup');
 check(dirname(s.local)===s.tempRoot&&realpathSync(s.local)===s.local&&JSON.parse(readFileSync(resolve(s.local,'owner.json'),'utf8')).owner===s.owner,'p09_browser_cleanup_ownership');
 rmSync(s.local,{recursive:true});check(!existsSync(s.local),'p09_browser_owned_temp_cleanup');
 return {processStopped:stopped,contextsClosed:s.contexts.every(x=>x.isClosed()),ownedTempRemoved:!existsSync(s.local)};
}
async function storageAudit(page,privateText){
 const result=await page.evaluate(async needle=>{
  const contains=async(value,depth=0)=>{if(depth>20)throw Error('storage_limit');if(typeof value==='string')return value.includes(needle);if(value===null||value===undefined||['number','boolean'].includes(typeof value))return false;if(value instanceof Blob)return (await value.text()).includes(needle);if(value instanceof ArrayBuffer||ArrayBuffer.isView(value))return new TextDecoder().decode(value instanceof ArrayBuffer?value:new Uint8Array(value.buffer,value.byteOffset,value.byteLength)).includes(needle);if(value instanceof Date)return false;if(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype){for(const [key,v] of Object.entries(value))if(key.includes(needle)||await contains(v,depth+1))return true;return false;}throw Error('unreadable_storage');};
  let hits=0;for(const storage of [localStorage,sessionStorage])for(let i=0;i<storage.length;i++)if((await contains(storage.key(i)))||(await contains(storage.getItem(storage.key(i)))))hits++;
  const databases=await indexedDB.databases();if(databases.length>20)throw Error('storage_limit');
  for(const info of databases){if(!info.name)throw Error('database_name_unknown');const db=await new Promise((ok,bad)=>{const r=indexedDB.open(info.name);r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);r.onupgradeneeded=()=>{r.transaction.abort();bad(Error('database_changed'));};});
   try{for(const name of Array.from(db.objectStoreNames)){const rows=await new Promise((ok,bad)=>{const tx=db.transaction(name,'readonly'),r=tx.objectStore(name).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});if(rows.length>1000)throw Error('storage_limit');for(const row of rows)if(await contains(row))hits++;}}finally{db.close();}
  }
  const keys=await caches.keys();if(keys.length>20)throw Error('cache_limit');for(const key of keys){if(key.includes(needle))hits++;const cache=await caches.open(key),requests=await cache.keys();if(requests.length>1000)throw Error('cache_limit');for(const request of requests){if(decodeURIComponent(request.url).includes(needle))hits++;const response=await cache.match(request);if(response&&(await response.text()).includes(needle))hits++;}}
  return {hits,urlHit:decodeURIComponent(location.href).includes(needle)||/[?&#](?:access_token|refresh_token|password)=/i.test(location.href)};
 },privateText);
 check(result.hits===0&&!result.urlHit,'p09_browser_private_storage_or_url');return result;
}
function recordPass(s,name,evidence={}){check(browserChecks.includes(name)&&!s.checks.some(x=>x.name===name),'p09_browser_check_identity');const item={name,status:'PASS',...evidence};s.checks.push(item);console.log('P09_BROWSER_CHECK '+JSON.stringify(item));}
async function exercise(s,runtime,known){
 const {users,newSession,api,sql,wait}=runtime,book=known.workbookId,nextVersion=known.latestVersion+1,title='TEST browser durable close recovery';
 const baseline=await api('a',endpoint+'?'+new URLSearchParams({id:book,version:'1'}));check(baseline.status===200,'p09_browser_v1_baseline');
 const marker='TEST_PRIVATE_WORKBOOK_TEXT',initialToken=users.a.session.token;users.a.session=await newSession('a');check(users.a.session.token!==initialToken,'p09_browser_initial_password_login');
 let allPosts=0,privateHits=0,urlHits=0,closedPage=false,closedContext=false,cacheComplete=true,savedIntent=null,preparedAt=null;
 const responses=[],cacheResponses=[],blocked=[],pageErrors=[];let heldRead=null,armed=false,closing=false,releaseRead=false;
 const attach=async(context,page,holdRecovery=false)=>{
  page.on('pageerror',error=>pageErrors.push(error.name));
  page.on('response',response=>{if(new URL(response.url()).pathname===endpoint)responses.push(response);});
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
  cdp.on('Network.responseReceived',event=>{if(new URL(event.response.url).pathname===endpoint)cacheResponses.push({disk:!!event.response.fromDiskCache,worker:!!event.response.fromServiceWorker,prefetch:!!event.response.fromPrefetchCache,headers:event.response.headers});});
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'},{urlPattern:origin+endpoint+'*',requestStage:'Response'}]});
  cdp.on('Fetch.requestPaused',event=>{void(async()=>{
   const request=event.request,u=new URL(request.url),responseStage=event.responseStatusCode!==undefined;
   check(!event.responseErrorReason,'p09_browser_network_response_failed');
   if(!responseStage){
    if(decodeURIComponent(request.url).includes(marker)||/[?&#](?:access_token|refresh_token|password)=/i.test(request.url)){urlHits++;throw Error('p09_browser_private_request_url');}
    if(!browserDestination(request.url,request.method)){blocked.push(['/_next/image','/_next/webpack-hmr'].includes(u.pathname)?u.pathname:'unapproved_path');await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});return;}
    if(u.pathname===endpoint&&request.method==='POST')allPosts++;
    if(holdRecovery&&!releaseRead&&u.pathname===endpoint&&request.method==='GET'&&u.searchParams.get('id')===book&&u.searchParams.get('version')===String(nextVersion)){check(!heldRead,'p09_browser_duplicate_recovery_get');heldRead={cdp,id:event.requestId};return;}
    await cdp.send('Fetch.continueRequest',{requestId:event.requestId});return;
   }
   const intent=Object.entries(request.headers).find(([key])=>key.toLowerCase()==='x-workbook-save-intent')?.[1];
   if(armed&&request.method==='POST'&&intent&&event.responseStatusCode===201){
    check(event.responseHeaders?.some(x=>x.name.toLowerCase()==='cache-control'&&x.value.includes('no-store')),'p09_browser_save_response_cache_policy');
    savedIntent=intent;closing=true;await context.close();closedPage=page.isClosed();closedContext=context.isClosed();return;
   }
   await cdp.send('Fetch.continueResponse',{requestId:event.requestId});
  })().catch(error=>{if(!closing&&!context.isClosed())s.asyncFailure=/^p09_browser_[a-z0-9_]+$/.test(error.message)?error.message:'p09_browser_cdp_event_failed';});});
 };
 const first=await s.browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});s.contexts.push(first);await first.addCookies(sdkCookies(users.a.session.cookie));const page=await first.newPage();await attach(first,page);page.on('dialog',dialog=>void dialog.accept());
 s.stage='real_page';await page.goto(origin+'/admin/research',{waitUntil:'domcontentloaded',timeout:120000});
 await page.locator('#title').waitFor({state:'visible',timeout:30000});
 await page.getByRole('button',{name:new RegExp(known.titleV2)}).click();await wait(async()=>await page.locator('#title').inputValue()===known.titleV2,'p09_browser_original_workbook_open',30);
 check(page.url()===origin+'/admin/research'&&await page.locator('#interpretation').inputValue()===baseline.value.workbook.interpretation,'p09_browser_real_workbook_content');
 const beforeAudit=await storageAudit(page,marker);privateHits+=beforeAudit.hits;urlHits+=Number(beforeAudit.urlHit);
 recordPass(s,'real-next-workbook-page',{genuineSession:true,realPage:true,existingCasesNotMocked:true});
 s.stage='save_and_close';await page.locator('#title').fill(title);armed=true;
 try{await page.getByRole('button',{name:/ذخیره به‌عنوان/}).click();}catch(error){check(closing&&/closed/i.test(error.message),'p09_browser_save_click_failed');}
 await wait(()=>{if(s.asyncFailure)throw Error(s.asyncFailure);return closedPage&&closedContext&&savedIntent;},'p09_browser_real_context_close_after_response',60);
 check(closedPage&&closedContext,'p09_browser_close_not_observed');
 const native=await api('a',endpoint+'?'+new URLSearchParams({id:book,version:String(nextVersion)}));check(native.status===200&&native.value.workbook.title===title,'p09_browser_real_commit_after_close');
 recordPass(s,'save-response-real-tab-context-close',{pageClosed:true,contextClosed:true,actualResponseStatus:201,transportFulfill:false,tcpDisconnectClaim:false});
 armed=false;closing=false;
 s.stage='fresh_reopen';const prior=users.a.session.token;users.a.session=await newSession('a');check(users.a.session.token!==prior,'p09_browser_fresh_password_session');
 const second=await s.browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});s.contexts.push(second);await second.addCookies(sdkCookies(users.a.session.cookie));const reopened=await second.newPage();await attach(second,reopened,true);const postsBefore=allPosts;
 await reopened.goto(origin+'/admin/research',{waitUntil:'domcontentloaded',timeout:120000});await wait(()=>{if(s.asyncFailure)throw Error(s.asyncFailure);return !!heldRead;},'p09_browser_recovery_get_held',30);
 await reopened.locator('aside dd').filter({hasText:savedIntent}).first().waitFor({state:'visible',timeout:30000});check(allPosts===postsBefore,'p09_browser_reopen_automatic_post');
 const journal=await api('a',endpoint+'?intent='+savedIntent);check(journal.status===200&&journal.value.intentId===savedIntent&&journal.value.targetVersion===nextVersion,'p09_browser_same_durable_intent');preparedAt=journal.value.preparedAt;
 const times=await reopened.locator('aside time').evaluateAll(nodes=>nodes.map(x=>x.getAttribute('datetime')));check(times.includes(preparedAt),'p09_browser_real_prepared_time');
 const {intentHistoryFromPage,projectIntentHistory}=await import('../../lib/intelligence/research-history-metadata.ts');
 const listResponses=responses.filter(response=>response.request().method()==='GET'&&new URL(response.url()).pathname===endpoint&&!new URL(response.url()).search);check(listResponses.length>0,'p09_browser_existing_list_missing');const list=await listResponses.at(-1).json();
 const view=projectIntentHistory(intentHistoryFromPage({initial:true,status:200,availability:list.durableRecoveryAvailable,items:list.saveIntents,nextOffset:list.intentNextOffset,offset:0}),book),intent=view.history.events.find(x=>x.intentId===savedIntent);
 check(intent&&intent.times.preparedAt===preparedAt&&intent.versionId===null&&intent.writeOutcome==='unknown','p09_browser_intent_unknown_before_readback');
 releaseRead=true;await heldRead.cdp.send('Fetch.continueRequest',{requestId:heldRead.id});
 await wait(async()=>await reopened.locator('aside p[aria-live="polite"]').innerText().then(x=>x.includes('نسخهٔ ۳ از ۳')),'p09_browser_get_only_version_confirmed',30);
 check(await reopened.locator('#title').inputValue()===title&&allPosts===postsBefore,'p09_browser_reopen_exact_body_without_post');
 recordPass(s,'fresh-sdk-session-get-only-reopen',{sameIntent:true,freshPasswordAndSdkGetUser:true,automaticWorkbookPosts:allPosts-postsBefore,intentVersionId:null,intentWriteOutcome:'unknown'});
 s.stage='reload';await reopened.reload({waitUntil:'domcontentloaded',timeout:120000});await wait(async()=>await reopened.locator('#title').inputValue()===title,'p09_browser_real_reload_content',30);check(allPosts===postsBefore,'p09_browser_reload_automatic_post');recordPass(s,'real-reload-get-only',{actualReload:true,automaticWorkbookPosts:0});
 const after=await storageAudit(reopened,marker);privateHits+=after.hits;urlHits+=Number(after.urlHit);
 check(cacheResponses.length>0&&cacheResponses.every(r=>!r.disk&&!r.worker&&!r.prefetch&&Object.entries(r.headers).some(([key,v])=>key.toLowerCase()==='cache-control'&&String(v).includes('no-store'))),'p09_browser_private_http_cache');
 const retained=await api('a',endpoint+'?'+new URLSearchParams({id:book,version:'1'}));assert.deepEqual(retained.value.workbook,baseline.value.workbook);check(retained.value.historyMetadata.reviews.some(x=>x.id===known.review1Id&&x.versionId===known.version1Id),'p09_browser_v1_review_preserved');
 check(sql(`SELECT count(*) FROM public.research_workbook_versions WHERE workbook_id='${book}'`)===String(nextVersion),'p09_browser_no_duplicate_version');check(!s.asyncFailure&&pageErrors.length===0,'p09_browser_real_page_error');
 recordPass(s,'private-storage-cache-url-absent',{privateStorageHits:privateHits,privateUrlHits:urlHits,cacheAuditComplete:cacheComplete,httpCacheDisabledByTest:false,blockedPaths:[...new Set(blocked)].filter(x=>!x.startsWith(endpoint)),v1ReviewPreserved:true});
 return {pageClosed:closedPage,contextClosed:closedContext,freshLoginVerified:true,reloadGetOnly:true,automaticWorkbookPosts:allPosts-postsBefore,privateStorageHits:privateHits,privateUrlHits:urlHits,cacheAuditComplete:cacheComplete,intentId:savedIntent,preparedAt};
}
async function run(){
 let state;try{
  state=await preflight();recordPass(state,'browser-preflight-before-provision',{driverVersion:'1.64.1',executable,chromeVersion:state.chromeVersion,chromeSha256:state.chromeSha256,beforeProvision:true});
  await runNativeAuthProfile('p09',async runtime=>{
   let flow,clean;try{const known=await workbookNativeScenarios(runtime);flow=await exercise(state,runtime,known);}finally{clean=await cleanup(state);state.cleaned=true;}
   recordPass(state,'owned-browser-cleanup',clean);
   const browser={status:'PASS',driverVersion:'1.64.1',executable,chromeVersion:state.chromeVersion,chromeSha256:state.chromeSha256,checks:state.checks,...flow,cleanup:clean};
   runtime.write('browser-flow.json',{sha:runtime.sha,...browser});return {browser};
  },{browserMode:true});
 }catch(error){if(/^[a-z0-9_]+$/.test(error.message))throw error;throw Error('p09_browser_'+(state?.stage??'preflight')+'_failed');}
 finally{if(state&&!state.cleaned)await cleanup(state);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{await run();}catch(error){console.error('P09_BROWSER_AUTH '+JSON.stringify({status:'BLOCKED',reason:/^[a-z0-9_]+$/.test(error.message)?error.message:'p09_browser_driver_failed_review_private_receipt',automaticReplay:false,browserAcceptance:false}));process.exitCode=1;}}
