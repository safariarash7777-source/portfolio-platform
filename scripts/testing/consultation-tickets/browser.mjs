// P03 browser-only derivative of frozen67; real existing request pages, no product import.
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,realpathSync,statSync,lstatSync,existsSync,rmSync,readdirSync,readlinkSync,symlinkSync,mkdirSync,chmodSync,statfsSync,openSync,closeSync,fstatSync,constants} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {runNativeAuthProfile,verifyEnvironment,allowedProfileURL,origin,browserChecks,browserSourceSha} from './native-auth-runtime.mjs';
const endpoint='/api/consultation/tickets',executable='/opt/google/chrome/chrome';
const check=(v,code)=>{if(!v)throw Error(code);};
const digest=v=>createHash('sha256').update(v).digest('hex');
export function chromeFileCompatible(meta){return meta.isFile&&meta.elf&&meta.uid===meta.runnerUid&&(meta.mode&0o222)===0&&(meta.mode&0o100)!==0;}
export function closureBudget(entries,bytes,freeBytes){return Number.isSafeInteger(entries)&&entries>0&&entries<=4096&&Number.isSafeInteger(bytes)&&bytes>0&&bytes<=1024**3&&Number.isFinite(freeBytes)&&freeBytes>=bytes+4*1024**3;}
const inside=(root,path)=>path===root||path.startsWith(root+'/');
function inventory(root){
 check(realpathSync(root)===root,'p09_browser_closure_realpath');const rows=[];let bytes=0;
 const walk=(path,depth=0)=>{check(depth<=12,'p09_browser_closure_depth');for(const name of readdirSync(path).sort()){
  check(!/[\u0000-\u001f\\]/.test(name),'p09_browser_closure_name');const file=resolve(path,name),rel=relative(root,file),meta=lstatSync(file);check(inside(root,file)&&!isAbsolute(rel)&&!rel.split('/').includes('..'),'p09_browser_closure_path');
  let row;if(meta.isSymbolicLink()){const link=readlinkSync(file);check(!isAbsolute(link)&&inside(root,realpathSync(file)),'p09_browser_closure_symlink_escape');bytes+=Buffer.byteLength(link);row={path:rel,type:'link',size:Buffer.byteLength(link),sha256:digest(link),link};}
  else if(meta.isDirectory()){check(inside(root,realpathSync(file)),'p09_browser_closure_directory');row={path:rel,type:'directory',size:0};}
  else{check(meta.isFile()&&inside(root,realpathSync(file)),'p09_browser_closure_type');bytes+=meta.size;check(bytes<=1024**3&&meta.size<=512*1024**2,'p09_browser_closure_bytes');const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{check(fstatSync(fd).isFile(),'p09_browser_closure_file');row={path:rel,type:'file',size:meta.size,sha256:digest(readFileSync(fd)),executable:!!(meta.mode&0o111)};}finally{closeSync(fd);}}
  rows.push(row);check(rows.length<=4096&&bytes<=1024**3,'p09_browser_closure_count_or_bytes');if(row.type==='directory')walk(file,depth+1);
 }};walk(root);return {rows,bytes,entries:rows.length,sha256:digest(JSON.stringify(rows))};
}
function copyClosure(source,local){
 const before=inventory(source),fs=statfsSync(local),freeBeforeBytes=Number(fs.bavail)*Number(fs.bsize);check(closureBudget(before.entries,before.bytes,freeBeforeBytes),'p09_browser_closure_budget');
 console.log('P03_TICKET_BROWSER_PREFLIGHT_READ '+JSON.stringify({phase:'closure-budget',entries:before.entries,bytes:before.bytes,sha256:before.sha256,freeBeforeBytes,maxEntries:4096,maxBytes:1024**3,reserveBytes:4*1024**3}));
 const target=resolve(local,'chrome');mkdirSync(target,{mode:0o700});
 for(const row of before.rows){const src=resolve(source,row.path),dst=resolve(target,row.path);check(inside(source,src)&&inside(target,dst),'p09_browser_closure_copy_path');
  if(row.type==='directory')mkdirSync(dst,{mode:0o700});else if(row.type==='link')symlinkSync(row.link,dst);else{
   check(inside(source,realpathSync(src)),'p09_browser_closure_changed_path');const fd=openSync(src,constants.O_RDONLY|constants.O_NOFOLLOW);let value;try{const m=fstatSync(fd);check(m.isFile()&&m.size===row.size,'p09_browser_closure_changed_type');value=readFileSync(fd);}finally{closeSync(fd);}check(value.length===row.size&&digest(value)===row.sha256,'p09_browser_closure_changed_bytes');writeFileSync(dst,value,{flag:'wx',mode:row.executable?0o500:0o400});
  }
 }
 const after=inventory(source),copied=inventory(target);check(before.sha256===after.sha256&&before.sha256===copied.sha256,'p09_browser_closure_manifest_mismatch');
 for(const row of [...before.rows].reverse())if(row.type==='directory')chmodSync(resolve(target,row.path),0o500);chmodSync(target,0o500);
 for(const row of before.rows)if(row.type!=='link'){const m=lstatSync(resolve(target,row.path));check(m.uid===process.getuid()&&(m.mode&0o222)===0,'p09_browser_copy_permissions');}
 check(lstatSync(target).uid===process.getuid()&&(lstatSync(target).mode&0o222)===0,'p09_browser_copy_root_permissions');
 writeFileSync(resolve(local,'closure-manifest.json'),JSON.stringify({source:before,runtime:copied}),{mode:0o600});
 return {executable:resolve(target,'chrome'),closure:{sha256:before.sha256,entries:before.entries,bytes:before.bytes,freeBeforeBytes,sourceStable:true,copyMatched:true,runtimeReadonly:true}};
}
function removalPermissions(root,path=root){
 check(inside(root,resolve(path)),'p09_browser_cleanup_path');const m=lstatSync(path);if(m.isSymbolicLink())return;
 check(inside(root,realpathSync(path)),'p09_browser_cleanup_realpath');if(m.isDirectory()){chmodSync(path,m.mode|0o700);for(const name of readdirSync(path))removalPermissions(root,resolve(path,name));}
}
export function browserDestination(url,method='GET',acceptance='ticket'){
 try{const u=new URL(url);if(u.hash||!url.startsWith(origin+'/'))return false;const raw=url.slice(origin.length).split('?')[0];if(/%(?:2e|2f|5c|25|00)/i.test(raw)||/[\\\u0000-\u0020]/.test(raw)||raw.split('/').some(x=>x==='.'||x==='..'))return false;allowedProfileURL('consultation-ticket',url,true,method,acceptance);return true;}catch{return false;}
}
export function browserFailureCode(error){
 const text=String(error?.message??'');return /^p09_browser_[a-z0-9_]+$/.test(text)?text:text.match(/\bnet::ERR_[A-Z0-9_]+\b/)?.[0]??(/strict mode violation/.test(text)?'selector_ambiguous':error?.name==='TimeoutError'?'playwright_timeout':'browser_operation_failed');
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
function sameProcess(pid,birth){try{const t=readFileSync('/proc/'+pid+'/stat','utf8'),fields=t.slice(t.lastIndexOf(')')+2).split(' ');return fields[19]===birth&&fields[0]!=='Z';}catch{return false;}}
function ownedBrowserProcesses(s){
 const result=new Map();for(const name of readdirSync('/proc'))if(/^\d+$/.test(name)&&Number(name)!==process.pid){try{if(statSync('/proc/'+name).uid!==process.getuid())continue;const first=readFileSync('/proc/'+name+'/cmdline','utf8').split('\0')[0];if(inside(resolve(s.local,'chrome'),first))descendants(Number(name),result);}catch{/* Process exited or belongs to another principal. */}}
 return result;
}
export async function preflight(){
 verifyEnvironment();check(!process.env.DEBUG&&!process.env.PWDEBUG,'p09_browser_debug_logging_forbidden');check(existsSync(executable)&&realpathSync(executable)===executable,'p09_browser_existing_chrome_missing');
 const meta=statSync(executable);check(meta.isFile()&&meta.size>0&&meta.size<=512*1024**2,'p09_browser_source_binary_size');
 const binary=readFileSync(executable),sourceSha256=digest(binary),fileIdentity={isFile:meta.isFile(),elf:binary.subarray(0,4).equals(Buffer.from([127,69,76,70])),uid:meta.uid,runnerUid:process.getuid(),mode:meta.mode&0o777};
 console.log('P03_TICKET_BROWSER_PREFLIGHT_READ '+JSON.stringify({phase:'existing-chrome-file',executable,...fileIdentity,sha256:sourceSha256}));
 check(fileIdentity.isFile&&fileIdentity.elf&&sourceSha256===browserSourceSha,'p09_browser_source_chrome_identity');
 const require=createRequire(import.meta.url);check(require('playwright-core/package.json').version==='1.64.1','p09_browser_driver_version');
 const {chromium}=await import('playwright-core'),tempRoot=realpathSync(process.env.RUNNER_TEMP),owner=randomUUID(),local=mkdtempSync(resolve(tempRoot,'p09b-'));
 check(realpathSync(local)===local&&dirname(local)===tempRoot,'p09_browser_owned_temp');writeFileSync(resolve(local,'owner.json'),JSON.stringify({owner,sourceExecutable:executable,sourceSha256}),{mode:0o600});
 const state={local,tempRoot,owner,sourceSha256,contexts:[],checks:[],stage:'preflight',server:null,browser:null};
 const priorTmp=process.env.TMPDIR;process.env.TMPDIR=local;
 try{
  check(Buffer.byteLength(local)<=40,'p09_browser_socket_path_budget');
  state.stage='closure_copy';
  const copy=copyClosure(dirname(executable),local);state.executable=copy.executable;state.closure=copy.closure;
  const runtimeMeta=statSync(copy.executable),runtimeBytes=readFileSync(copy.executable);state.chromeSha256=digest(runtimeBytes);
  check(chromeFileCompatible({isFile:runtimeMeta.isFile(),elf:runtimeBytes.subarray(0,4).equals(Buffer.from([127,69,76,70])),uid:runtimeMeta.uid,runnerUid:process.getuid(),mode:runtimeMeta.mode&0o777})&&state.chromeSha256===sourceSha256,'p09_browser_owned_chrome_identity');
  console.log('P03_TICKET_BROWSER_PREFLIGHT_READ '+JSON.stringify({phase:'owned-copy-attested',executable:copy.executable,uid:runtimeMeta.uid,mode:runtimeMeta.mode&0o777,sha256:state.chromeSha256,closure:state.closure}));
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','LANG','TMPDIR'].includes(key)));env.XDG_CONFIG_HOME=resolve(local,'config');env.XDG_CACHE_HOME=resolve(local,'cache');
  state.stage='owned_version';
  state.chromeVersion=execFileSync(copy.executable,['--version'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}).trim();check(/^Google Chrome [0-9.]+(?: .*)?$/.test(state.chromeVersion),'p09_browser_chrome_version');
  console.log('P03_TICKET_BROWSER_PREFLIGHT_READ '+JSON.stringify({phase:'owned-version',chromeVersion:state.chromeVersion}));state.stage='owned_launch';
  state.server=await chromium.launchServer({executablePath:copy.executable,headless:true,host:'127.0.0.1',env,timeout:30000,args:['--disable-background-networking','--disable-crash-reporter']});
  const ws=new URL(state.server.wsEndpoint());check(ws.protocol==='ws:'&&ws.hostname==='127.0.0.1','p09_browser_loopback_control');
  state.process=state.server.process();check(state.process?.pid>0,'p09_browser_owned_process');
  const profile=state.process.spawnargs.find(x=>x.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
  check(profile&&realpathSync(profile).startsWith(local+'/'),'p09_browser_profile_outside_owned_temp');
  state.stage='cdp_connect';
  state.browser=await chromium.connect(state.server.wsEndpoint());const context=await state.browser.newContext({serviceWorkers:'block'});state.contexts.push(context);
  const page=await context.newPage(),cdp=await context.newCDPSession(page),version=await cdp.send('Browser.getVersion');
  check(/^Chrome\/[0-9.]+$/.test(version.product),'p09_browser_cdp_version');
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:origin+endpoint,requestStage:'Response'}]});
  try{await cdp.send('Fetch.continueResponse',{requestId:'p09-preflight-no-request'});throw Error('p09_browser_cdp_probe_unexpected');}catch(error){check(/Invalid InterceptionId|Invalid requestId/i.test(error.message),'p09_browser_response_interception_unsupported');}
  await cdp.send('Fetch.disable');await context.close();check(page.isClosed()&&context.isClosed(),'p09_browser_preflight_context_cleanup');
  return state;
 }catch(error){
  // Pre-auth only: no users or credentials have been provisioned. Never emit a
  // launch command/WS capability, stack, host file listing or raw trace.
  const redact=value=>String(value??'').replace(/(?:wss?|https?):\/\/\S+/g,'<url>').replaceAll(local,'<owned-temp>').replace(/\/(?:[^\s'"<>]+)/g,'<path>').split('\n').filter(Boolean)[0]?.slice(0,260)??'';
  const launchErrors=String(error.message??'').split('\n').filter(line=>line.includes('[err]')&&!line.includes('<launching>')).slice(0,5).map(redact);
  console.log('P03_TICKET_BROWSER_PREFLIGHT_FAILURE '+JSON.stringify({stage:state.stage,name:error.name,code:error.code??null,status:error.status??null,signal:error.signal??null,reason:redact(error.message),stderr:redact(error.stderr),launchErrors}));
  await cleanup(state);throw error;
 }finally{if(priorTmp===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=priorTmp;}
}
export async function cleanup(s){
 check(dirname(s.local)===s.tempRoot&&realpathSync(s.local)===s.local&&JSON.parse(readFileSync(resolve(s.local,'owner.json'),'utf8')).owner===s.owner,'p09_browser_cleanup_ownership');
 const owned=s.process?descendants(s.process.pid):ownedBrowserProcesses(s);
 for(const context of s.contexts)if(!context.isClosed())await context.close();
 if(s.browser?.isConnected())await s.browser.close();
 if(s.server){try{await s.server.close();}catch{await s.server.kill();}}
 for(const [pid,birth] of ownedBrowserProcesses(s)){owned.set(pid,birth);if(sameProcess(pid,birth))process.kill(pid,'SIGTERM');}
 const deadline=Date.now()+8000;while([...owned].some(([pid,birth])=>sameProcess(pid,birth))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
 for(const [pid,birth] of owned)if(sameProcess(pid,birth))process.kill(pid,'SIGKILL');
 const killDeadline=Date.now()+2000;while([...owned].some(([pid,birth])=>sameProcess(pid,birth))&&Date.now()<killDeadline)await new Promise(r=>setTimeout(r,50));
 const stopped=[...owned].every(([pid,birth])=>!sameProcess(pid,birth));check(stopped,'p09_browser_owned_process_cleanup');
 check(dirname(s.local)===s.tempRoot&&realpathSync(s.local)===s.local&&JSON.parse(readFileSync(resolve(s.local,'owner.json'),'utf8')).owner===s.owner,'p09_browser_cleanup_ownership');
 removalPermissions(s.local);rmSync(s.local,{recursive:true});check(!existsSync(s.local),'p09_browser_owned_temp_cleanup');
 const result={processStopped:stopped,contextsClosed:s.contexts.every(x=>x.isClosed()),ownedTempRemoved:!existsSync(s.local),ownerId:s.owner};console.log('P03_TICKET_BROWSER_CLEANUP '+JSON.stringify({status:'REMOVED_OWNED_RESOURCES',...result,processesObserved:owned.size}));return result;
}
export async function storageAudit(page,needles){
 const result=await page.evaluate(async needles=>{
  const textHas=value=>needles.some(needle=>value.includes(needle));
  const contains=async(value,depth=0)=>{if(depth>20)throw Error('storage_limit');if(typeof value==='string')return textHas(value);if(value===null||value===undefined||['number','boolean'].includes(typeof value))return false;if(value instanceof Blob)return textHas(await value.text());if(value instanceof ArrayBuffer||ArrayBuffer.isView(value))return textHas(new TextDecoder().decode(value instanceof ArrayBuffer?value:new Uint8Array(value.buffer,value.byteOffset,value.byteLength)));if(value instanceof Date)return false;if(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype){for(const [key,v] of Object.entries(value))if(textHas(key)||await contains(v,depth+1))return true;return false;}throw Error('unreadable_storage');};
  let hits=0,storageEntries=0,indexedDbRecords=0,cacheEntries=0;for(const storage of [localStorage,sessionStorage])for(let i=0;i<storage.length;i++){storageEntries++;if((await contains(storage.key(i)))||(await contains(storage.getItem(storage.key(i)))))hits++;}
  const databases=await indexedDB.databases();if(databases.length>20)throw Error('storage_limit');
  for(const info of databases){if(!info.name)throw Error('database_name_unknown');if(textHas(info.name))hits++;const db=await new Promise((ok,bad)=>{const r=indexedDB.open(info.name);r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);r.onupgradeneeded=()=>{r.transaction.abort();bad(Error('database_changed'));};});
   try{for(const name of Array.from(db.objectStoreNames)){if(textHas(name))hits++;const records=await new Promise((ok,bad)=>{const tx=db.transaction(name,'readonly'),store=tx.objectStore(name),keys=store.getAllKeys(),rows=store.getAll();tx.oncomplete=()=>ok({keys:keys.result,rows:rows.result});tx.onerror=()=>bad(tx.error);tx.onabort=()=>bad(tx.error??Error('database_read_aborted'));});if(records.keys.length>1000||records.rows.length>1000)throw Error('storage_limit');indexedDbRecords+=records.rows.length;for(const row of [...records.keys,...records.rows])if(await contains(row))hits++;}}finally{db.close();}
  }
  const keys=await caches.keys();if(keys.length>20)throw Error('cache_limit');for(const key of keys){if(textHas(key))hits++;const cache=await caches.open(key),requests=await cache.keys();if(requests.length>1000)throw Error('cache_limit');for(const request of requests){cacheEntries++;if(textHas(decodeURIComponent(request.url))||await contains([...request.headers]))hits++;const response=await cache.match(request);if(response&&(textHas(await response.text())||await contains([...response.headers])))hits++;}}
  return {hits,storageEntries,indexedDbDatabases:databases.length,indexedDbRecords,cacheStores:keys.length,cacheEntries,urlHit:textHas(decodeURIComponent(location.href))||/[?&#](?:access_token|refresh_token|password)=/i.test(location.href)};
 },needles);
 check(result.hits===0&&!result.urlHit,'p09_browser_private_storage_or_url');return result;
}
function recordPass(s,name,evidence={}){check(browserChecks.includes(name)&&!s.checks.some(x=>x.name===name),'p09_browser_check_identity');const item={name,status:'PASS',...evidence};s.checks.push(item);console.log('P03_TICKET_BROWSER_CHECK '+JSON.stringify(item));}

const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const memberPath='/dashboard/consultation/requests',advisorPath='/admin/consultation/requests';
async function browserCase(s,ctx){
 const {api,sql,users,newSession,pass}=ctx;
 const expect=async(actor,path,body,status=body===undefined?200:201)=>{const response=await api(actor,path,body);check(response.status===status,'p09_browser_real_api_status');return response.value;};
 const period={startOn:'2026-10-01',endOn:'2026-10-31'},date='2026-10-29';
 const position={position_key:'browser-synthetic-cash',manual_label:'Synthetic declared cash',symbol:null,asset_class:'cash',qty:null,unit:'item',as_of:date,title:'Synthetic member declaration',ownership_pct:100,valuation_mode:'declared',declared_value:1000000,currency:'IRT',valuation_source:'Synthetic member declaration only',valuation_as_of:date,valuation_status:'estimated'};
 await expect('a','/api/portfolio/holdings',{base_version:0,client_token:randomUUID(),positions:[position],note:'P03 browser owned fixture only'});
 const source={label:'Synthetic financial statement',observedOn:date};
 await expect('a','/api/personal-finance/cash-flow',{contractVersion:'cash-flow-request.v1',expectedOwnerId:users.a.id,clientToken:randomUUID(),baseVersion:0,payload:{contractVersion:1,period,accountDefinitions:[{accountKey:'bank',label:'Synthetic bank'}],scopeAccountKeys:['bank'],opening:{amountToman:500000,atStartOn:period.startOn,source},coverage:{planned:{status:'unknown',memberAffirmed:false,source:null},actual:{status:'complete',memberAffirmed:true,source}},entries:[{entryKey:'income',basis:'actual',kind:'income',accountKey:'bank',amountToman:100000,occurredOn:'2026-10-02',source,category:null,note:null},{entryKey:'expense',basis:'actual',kind:'expense',accountKey:'bank',amountToman:20000,occurredOn:'2026-10-03',source,category:null,note:null}]}});
 const holdings=await expect('a','/api/portfolio/holdings'),cashflow=await expect('a','/api/personal-finance/cash-flow?'+new URLSearchParams(period));
 check(holdings.positions[0]?.declared_value===1000000&&cashflow.report.actual.closingToman===580000&&cashflow.report.planned.netToman===null,'p09_browser_financial_independent_readback');
 sql(`INSERT INTO public.consultation_advisors(user_id,display_name,enabled,is_owner) VALUES(${quote(users.owner.id)},'Synthetic browser owner',true,true);`);
 const command=async(actor,command)=>expect(actor,'/api/consultation',{contractVersion:'consultation-request.v1',expectedActorId:users[actor].id,clientToken:randomUUID(),command});
 const relation=(await command('a',{kind:'grant',advisorId:users.owner.id,clientLabel:'Synthetic browser member'})).id;
 const parent=await expect('a','/api/consultation?'+new URLSearchParams({...period,relationshipId:relation}));
 check(parent.dossier?.basis?.holdingsVersionId&&parent.dossier.basis.cashFlowVersionId,'p09_browser_nonzero_basis_missing');
 const fingerprint=()=>sql("SELECT jsonb_build_object("+['member_holding_versions','member_holding_positions','member_debt_positions','member_cash_flow_versions','member_cash_flow_entries','member_goals_versions'].map(name=>quote(name)+",(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]'),'UTF8')),'hex') FROM public."+name+' r)').join(',')+');');
 const before=fingerprint();
 ctx.write('browser-financial-before.json',{fingerprint:before,basis:parent.dossier.basis},true);
 pass('browser-owned-nonzero-dossier-real-consent',{holdingsToman:1000000,actualClosingToman:580000,plannedUnknown:true});
 const marker='SYNTHETIC_PRIVATE_BROWSER_MEMBER_BODY',subject='Synthetic browser request',reply='SYNTHETIC_SHARED_BROWSER_ADVISOR_REPLY',followup='SYNTHETIC_PRIVATE_BROWSER_MEMBER_FOLLOWUP';
 const needles=[marker,reply,followup];let posts=0,lost=false,armed=false,original=null,automatic=0,preparationPosts=0,closeCommand=false,closePreparation=false,destroyedCommand=false,destroyedPreparation=false,capturedCommand=null,capturedPreparation=null;
 const pages=[],cache=[],observedLookups=[],http=[],pageErrors=[];
 const history=page=>page.locator('section[aria-label="تاریخچهٔ نسخه‌دار درخواست"]');
 // React mirrors a controlled textarea value into its child text. Playwright
 // 1.64.1's exact label selector includes that nested text; use the actual
 // composer textarea, with normal actionability checks and no forced events.
 const textField=page=>page.locator('form[aria-label="ثبت درخواست یا پیگیری"] textarea');
 const submit=page=>page.getByRole('button',{name:'ثبت آزمایشی با بررسی سرور',exact:true});
 const reload=page=>page.getByRole('button',{name:'بازخوانی بدون ارسال دوباره',exact:true});
 const settle=async(page,condition,code)=>ctx.wait(async()=>{if(s.asyncFailure)throw Error(s.asyncFailure);return condition(page);},code,60);
 const open=async(actor,path,requestId)=>{
  const context=await s.browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});s.contexts.push(context);
  needles.push(users[actor].session.token,...sdkCookies(users[actor].session.cookie).map(x=>x.value).filter(Boolean));
  await context.addCookies(sdkCookies(users[actor].session.cookie));const page=await context.newPage();pages.push(page);page.on('dialog',dialog=>void dialog.accept());
  page.on('pageerror',error=>pageErrors.push({name:error.name,category:/React is not defined/.test(error.message)?'react_missing':/Maximum update depth/.test(error.message)?'render_loop':/hydration/i.test(error.message)?'hydration':'other_runtime_error'}));
  page.on('response',response=>{const u=new URL(response.url());if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/auth/'))http.push({path:u.pathname,status:response.status()});});
  s.pageDiagnostic=async()=>({stage:s.stage,operation:s.operation,urlClass:[memberPath,advisorPath].includes(new URL(page.url()).pathname)?new URL(page.url()).pathname:'other',http:http.slice(-20),pageErrors:pageErrors.slice(-5),dom:await page.evaluate(()=>({subjectLabels:[...document.querySelectorAll('label')].filter(x=>x.textContent.trim()==='موضوع').length,textLabels:[...document.querySelectorAll('label')].filter(x=>x.textContent.trim()==='متن').length,inputs:[...document.querySelectorAll('input')].map(x=>({disabled:x.disabled,width:x.getBoundingClientRect().width})),fieldsets:[...document.querySelectorAll('fieldset')].map(x=>({disabled:x.disabled})),checking:document.body.textContent.includes('در حال تأیید نشست'),retry:document.body.textContent.includes('بررسی نشست و بازخوانی'),overlay:document.querySelectorAll('nextjs-portal').length}))});
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
  cdp.on('Network.responseReceived',event=>{if([endpoint,'/api/consultation/ticket-attempts'].includes(new URL(event.response.url).pathname))cache.push({disk:!!event.response.fromDiskCache,worker:!!event.response.fromServiceWorker,prefetch:!!event.response.fromPrefetchCache,headers:event.response.headers});});
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'},{urlPattern:origin+endpoint+'*',requestStage:'Response'},{urlPattern:origin+'/api/consultation/ticket-attempts*',requestStage:'Response'}]});
  cdp.on('Fetch.requestPaused',event=>{void(async()=>{
   const request=event.request,u=new URL(request.url),responseStage=event.responseStatusCode!==undefined;
   if(!responseStage){
    if(!browserDestination(request.url,request.method)){await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});return;}
    if(u.pathname===endpoint&&request.method==='POST'){posts++;if(armed){check(!original,'p09_browser_second_armed_post');original=JSON.parse(request.postData);ctx.write('browser-original-intent.json',{input:original},true);}}
    if(u.pathname===endpoint&&request.method==='POST'&&closeCommand){capturedCommand=JSON.parse(request.postData);ctx.write('browser-destroy-command-intent.json',{body:request.postData},true);}
    if(u.pathname==='/api/consultation/ticket-attempts'&&request.method==='POST'){preparationPosts++;if(closePreparation){capturedPreparation=JSON.parse(request.postData);ctx.write('browser-destroy-preparation-intent.json',{body:request.postData},true);}}
    if(u.pathname===endpoint&&request.method==='GET'&&u.searchParams.get('mode')==='lookup')observedLookups.push({requestId:u.searchParams.get('requestId'),clientToken:u.searchParams.get('clientToken')});
    await cdp.send('Fetch.continueRequest',{requestId:event.requestId});return;
   }
   if(closeCommand&&u.pathname===endpoint&&request.method==='POST'&&event.responseStatusCode===201){check(capturedCommand,'p09_browser_destroy_command_missing');closeCommand=false;destroyedCommand=true;await context.close();return;}
   if(closePreparation&&u.pathname==='/api/consultation/ticket-attempts'&&request.method==='POST'&&event.responseStatusCode===201){check(capturedPreparation,'p09_browser_destroy_preparation_missing');closePreparation=false;destroyedPreparation=true;await context.close();return;}
   if(armed&&u.pathname===endpoint&&request.method==='POST'&&event.responseStatusCode===201){check(original&&!lost,'p09_browser_lost_response_identity');lost=true;armed=false;await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Aborted'});return;}
   await cdp.send('Fetch.continueResponse',{requestId:event.requestId});
  })().catch(error=>{if(!context.isClosed())s.asyncFailure=browserFailureCode(error);});});
  const url=origin+path+'?'+new URLSearchParams({relation,...(requestId?{request:requestId}:{})});
  s.operation='navigate_'+actor;const document=await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});check(document?.status()===200,'p09_browser_real_document_not_200');s.operation='document_loaded_'+actor;
  return {page,context};
 };
 s.stage='default_right_page';const first=await open('a',memberPath),page=first.page;
 s.operation='default_submit_visible';await submit(page).waitFor({state:'visible',timeout:60000});check(await submit(page).isDisabled(),'p09_browser_product_right_not_closed');
 s.operation='default_subject_fill';await page.getByLabel('موضوع',{exact:true}).fill(subject);s.operation='default_text_fill';await textField(page).fill(marker);
 s.operation='default_text_readback';check(await textField(page).inputValue()===marker&&posts===0,'p09_browser_closed_draft_or_post');
 recordPass(s,'real-member-page-default-right-closed',{actualDocument:200,draftRetained:true,posts:0,productRight:'NOT_CONNECTED'});
 ctx.apply('scripts/testing/consultation-tickets/owned-fixture.sql');
 sql(`INSERT INTO consultation_ticket_fixture.allowed(relationship_id,actor_id) VALUES(${quote(relation)},${quote(users.a.id)}),(${quote(relation)},${quote(users.owner.id)});`);
 await reload(page).click();await settle(page,async()=>!(await submit(page).isDisabled()),'p09_browser_fixture_capability_not_read');
 s.stage='live_lost_response';armed=true;await submit(page).click();
 await settle(page,async()=>lost&&(await page.getByText('نتیجهٔ ثبت نامعلوم است؛ ارسال دوباره بسته است. فقط همان تلاش را بازخوانی کنید.',{exact:true}).count())===1,'p09_browser_uncertain_ui_not_seen');
 check(posts===1&&await textField(page).inputValue()===marker,'p09_browser_unknown_draft_or_duplicate');
 check(sql(`SELECT count(*) FROM consultation_ticket_private.events WHERE request_id=${quote(original.command.requestId)}`)==='1','p09_browser_lost_actual_effect_count');
 recordPass(s,'real-201-discard-live-page-one-post',{actualStatus:201,bodyDeliveryAborted:true,pageStayedOpen:!page.isClosed(),ticketPosts:posts,storedEvents:1,httpFulfill:false});
 s.stage='same_attempt_recovery';await reload(page).click();
 await settle(page,async()=>!(await textField(page).inputValue())&&(await history(page).innerText()).includes(marker),'p09_browser_exact_recovery_not_rendered');
 check(posts===1&&observedLookups.some(x=>x.requestId===original.command.requestId&&x.clientToken===original.clientToken),'p09_browser_recovery_not_same_get_only');
 const lookup=await expect('a',endpoint+'?'+new URLSearchParams({mode:'lookup',relationshipId:relation,requestId:original.command.requestId,clientToken:original.clientToken}));
 check(lookup.data.attempt.state==='found'&&lookup.data.attempt.receipt.command.text===marker&&lookup.data.request.data.history.events[0].id===lookup.data.attempt.receipt.id,'p09_browser_independent_receipt_not_exact');
 const eventId=lookup.data.attempt.receipt.id;
 recordPass(s,'same-attempt-get-only-recovery',{sameRequest:true,sameToken:true,sameEventId:eventId,postsAfterRecovery:posts,draftClearedOnlyAfterReadback:true});
 await storageAudit(page,needles);
 const resourceId=original.command.requestId,resourceUrl=page.url();check(new URL(resourceUrl).searchParams.get('request')===resourceId,'p09_browser_resource_url_not_preserved');
 const signedOut=await ctx.post('/auth/v1/logout',{}, {Authorization:'Bearer '+users.a.session.token,apikey:ctx.anon});check([200,204].includes(signedOut.status),'p09_browser_real_signout_failed');
 await first.context.close();check(page.isClosed()&&first.context.isClosed(),'p09_browser_first_context_not_closed');
 const priorToken=users.a.session.token;users.a.session=await newSession('a');check(users.a.session.token!==priorToken,'p09_browser_fresh_sdk_login_missing');
 s.stage='fresh_context';const reopened=await open('a',memberPath,resourceId);let member=reopened.page;
 await history(member).waitFor({state:'visible',timeout:60000});await settle(member,async()=>!(await reload(member).isDisabled()),'p09_browser_fresh_read_not_settled');
 check((await history(member).innerText()).includes(marker)&&posts===1,'p09_browser_fresh_context_not_get_only');
 await member.reload({waitUntil:'domcontentloaded',timeout:120000});await history(member).waitFor({state:'visible',timeout:60000});await settle(member,async()=>!(await reload(member).isDisabled()),'p09_browser_reload_not_settled');
 check((await history(member).innerText()).includes(marker)&&posts===1,'p09_browser_reload_automatic_post');
 recordPass(s,'fresh-sdk-context-and-reload-get-only',{realSignout:true,newPasswordSession:true,sdkGetUser:true,oldContextClosed:true,actualReload:true,postsBefore:1,postsAfter:posts,resourceHistoryOnly:true,unknownIntentAfterDestroy:'SEPARATE_DURABILITY_CRITERIA'});
 s.stage='advisor_reply';const advisor=await open('owner',advisorPath,resourceId);
 await submit(advisor.page).waitFor({state:'visible',timeout:60000});await settle(advisor.page,async()=>!(await submit(advisor.page).isDisabled()),'p09_browser_advisor_not_ready');
 await textField(advisor.page).fill(reply);await submit(advisor.page).click();
 await settle(advisor.page,async()=>(await history(advisor.page).innerText()).includes(reply)&&!(await textField(advisor.page).inputValue()),'p09_browser_advisor_reply_not_read');
 await reload(member).click();await settle(member,async()=>(await history(member).innerText()).includes(reply),'p09_browser_member_reply_not_read');
 await textField(member).fill(followup);await submit(member).click();
 await settle(member,async()=>(await history(member).innerText()).includes(followup)&&!(await textField(member).inputValue()),'p09_browser_followup_not_read');
 await reload(advisor.page).click();await settle(advisor.page,async()=>(await history(advisor.page).innerText()).includes(followup),'p09_browser_advisor_followup_not_read');
 check(posts===3&&sql(`SELECT count(*) FROM consultation_ticket_private.events WHERE request_id=${quote(resourceId)}`)==='3','p09_browser_versions_not_three');
 recordPass(s,'real-advisor-response-and-member-followup',{memberOpen:1,ownerReply:2,memberFollowup:3,actualDomSubmits:3,independentSameText:true});
 s.stage='unconfirmed_command_destroy';
 const commandMarker='SYNTHETIC_PRIVATE_DESTROY_BEFORE_COMMAND_CONFIRM';needles.push(commandMarker);
 await member.getByRole('button',{name:'آماده‌کردن درخواست تازه',exact:true}).click();await member.getByLabel('موضوع',{exact:true}).fill('Synthetic destroyed command');await textField(member).fill(commandMarker);
 const beforeDestroyPosts=posts;closeCommand=true;
 try{await submit(member).click();}catch(error){check(destroyedCommand&&/closed/i.test(error.message),'p09_browser_command_destroy_click');}
 await ctx.wait(()=>destroyedCommand&&member.isClosed()&&capturedCommand,'p09_browser_command_context_not_destroyed',60);
 check(posts===beforeDestroyPosts+1,'p09_browser_destroy_command_duplicate');
 const destroyedInput=capturedCommand,preparationId=sql(`SELECT id FROM consultation_ticket_private.prepared_intents WHERE actor_id=${quote(users.a.id)} AND client_token=${quote(destroyedInput.clientToken)}`);
 check(sql(`SELECT count(*) FROM consultation_ticket_private.events WHERE request_id=${quote(destroyedInput.command.requestId)}`)==='1','p09_browser_destroy_command_effect_count');
 const logout2=await ctx.post('/auth/v1/logout',{}, {Authorization:'Bearer '+users.a.session.token,apikey:ctx.anon});check([200,204].includes(logout2.status),'p09_browser_destroy_real_logout');users.a.session=await newSession('a');
 const restoredContext=await open('a',memberPath,destroyedInput.command.requestId);member=restoredContext.page;
 await settle(member,async()=>!(await reload(member).isDisabled()),'p09_browser_destroy_fresh_parent_not_ready');
 const beforeRestorePosts=posts,beforeRestorePreparations=preparationPosts;
 await member.getByRole('button',{name:new RegExp(preparationId)}).click();
 await settle(member,async()=>(await history(member).innerText()).includes(commandMarker)&&(await member.getByText(/در بازخوانی مستقل تطبیق/).count())===1,'p09_browser_destroy_server_original_not_confirmed');
 check(posts===beforeRestorePosts&&preparationPosts===beforeRestorePreparations&&observedLookups.some(x=>x.clientToken===destroyedInput.clientToken&&x.requestId===destroyedInput.command.requestId),'p09_browser_destroy_replayed_post');
 check(sql(`SELECT request_body FROM consultation_ticket_private.prepared_intents WHERE id=${quote(preparationId)}`)===JSON.stringify(destroyedInput),'p09_browser_destroy_server_body_changed');
 recordPass(s,'unconfirmed-command-destroy-and-server-intent-get-only',{real201BeforeBody:true,fullContextDestroyedBeforeConfirmation:true,newPasswordSdkSession:true,serverOriginalBodyTokenRestored:true,explicitSelection:true,commandEvents:1,extraCommandPosts:0,extraPreparationPosts:0});
 s.stage='unknown_preparation_destroy';
 const preparationMarker='SYNTHETIC_PRIVATE_DESTROY_UNKNOWN_PREPARATION';needles.push(preparationMarker);
 await member.getByRole('button',{name:'آماده‌کردن درخواست تازه',exact:true}).click();await member.getByLabel('موضوع',{exact:true}).fill('Synthetic destroyed preparation');await textField(member).fill(preparationMarker);
 const commandsBeforeUnknownPrepare=posts;closePreparation=true;
 try{await submit(member).click();}catch(error){check(destroyedPreparation&&/closed/i.test(error.message),'p09_browser_preparation_destroy_click');}
 await ctx.wait(()=>destroyedPreparation&&member.isClosed()&&capturedPreparation,'p09_browser_preparation_context_not_destroyed',60);
 check(posts===commandsBeforeUnknownPrepare,'p09_browser_unknown_preparation_sent_command');
 const pendingInput=capturedPreparation,pendingPreparationId=sql(`SELECT id FROM consultation_ticket_private.prepared_intents WHERE actor_id=${quote(users.a.id)} AND client_token=${quote(pendingInput.clientToken)}`);
 users.a.session=await newSession('a');const pendingContext=await open('a',memberPath,pendingInput.command.requestId),pendingPage=pendingContext.page;
 await settle(pendingPage,async()=>!(await reload(pendingPage).isDisabled()),'p09_browser_unknown_preparation_fresh_parent');
 const prepareCountBeforeRecovery=preparationPosts;
 await pendingPage.getByRole('button',{name:new RegExp(pendingPreparationId)}).click();
 await settle(pendingPage,async()=>await textField(pendingPage).inputValue()===preparationMarker&&(await pendingPage.getByText(/نبود اثر همین تلاش/).count())===1,'p09_browser_unknown_preparation_original_body_not_loaded');
 check(posts===commandsBeforeUnknownPrepare&&preparationPosts===prepareCountBeforeRecovery,'p09_browser_unknown_preparation_auto_post');
 check(sql(`SELECT count(*) FROM consultation_ticket_private.events WHERE request_id=${quote(pendingInput.command.requestId)}`)==='0','p09_browser_unknown_preparation_created_command');
 await storageAudit(pendingPage,needles);
 recordPass(s,'unknown-preparation-destroy-no-command',{realPreparation201BeforeBody:true,fullContextDestroyed:true,originalBodyFromServer:true,commandEvents:0,automaticPosts:0,explicitRetryOfferedOnly:true});
 const mainContext=await open('a',memberPath,resourceId);member=mainContext.page;await history(member).waitFor({state:'visible',timeout:60000});await settle(member,async()=>!(await reload(member).isDisabled()),'p09_browser_original_case_reopened');
 s.stage='privacy_layout';let audits=0;
 for(const current of [member,advisor.page]){
  for(const width of [1440,390]){await current.setViewportSize({width,height:900});const geometry=await current.evaluate(()=>({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth}));check(geometry.document<=geometry.viewport,'p09_browser_horizontal_overflow');}
  await storageAudit(current,needles);audits++;
 }
 check(cache.length>0&&cache.every(x=>!x.disk&&!x.worker&&!x.prefetch&&Object.entries(x.headers).some(([key,value])=>key.toLowerCase()==='cache-control'&&String(value).includes('private')&&String(value).includes('no-store'))),'p09_browser_private_http_cache');
 recordPass(s,'desktop-mobile-and-private-storage-cache-url',{widths:[1440,390],actualPages:2,storageAudits:audits,privateHits:0,urlHits:0,cacheResponses:cache.length,cacheAuditComplete:true});
 s.stage='disabled_and_revoked';sql(`UPDATE public.consultation_advisors SET enabled=false WHERE user_id=${quote(users.owner.id)};`);
 await reload(advisor.page).click();await settle(advisor.page,async()=>await history(advisor.page).count()===0,'p09_browser_disabled_private_fallback');
 check(!(await advisor.page.locator('body').innerText()).includes(reply),'p09_browser_disabled_private_text');
 sql(`UPDATE public.consultation_advisors SET enabled=true WHERE user_id=${quote(users.owner.id)};`);
 const ownerAgain=await open('owner',advisorPath,resourceId);await history(ownerAgain.page).waitFor({state:'visible',timeout:60000});await settle(ownerAgain.page,async()=>!(await reload(ownerAgain.page).isDisabled()),'p09_browser_owner_reopen_not_settled');
 await command('a',{kind:'revoke',relationshipId:relation});await reload(ownerAgain.page).click();
 await settle(ownerAgain.page,async()=>await history(ownerAgain.page).count()===0,'p09_browser_revoked_private_fallback');
 check(!(await ownerAgain.page.locator('body').innerText()).includes(reply),'p09_browser_revoked_private_text');
 await reload(member).click();await settle(member,async()=>(await history(member).innerText()).includes(followup)&&await submit(member).count()===0,'p09_browser_member_revoke_history');
 const other=await open('b',memberPath,resourceId);await settle(other.page,async()=>!(await other.page.locator('body').innerText()).includes(marker)&&await other.page.locator('section[aria-label="تأیید هویت درخواست"]').count()===1,'p09_browser_other_actor_private_fallback');
 check(await history(other.page).count()===0&&posts===4,'p09_browser_other_actor_or_revoke_post');
 recordPass(s,'real-revoke-and-private-fallback-denial',{disabledAdvisorCleared:true,revokedAdvisorCleared:true,otherMemberDenied:true,memberHistoryVersions:3,memberWriteAbsent:true});
 const after=fingerprint();check(before===after,'p09_browser_financial_fingerprint_changed');ctx.write('browser-financial-after.json',{fingerprint:after},true);
 automatic=posts-4;check(automatic===0,'p09_browser_automatic_ticket_post');
 pass('browser-real-consumer-checked',{domPages:2,ticketVersions:3,automaticPosts:automatic,financialFingerprintSha256:digest(after),productServiceRight:'NOT_CONNECTED',unknownIntentAfterDestroy:'SEPARATE_DURABILITY_CRITERIA'});
 return {pageClosed:true,contextClosed:true,freshLoginVerified:true,reloadGetOnly:true,automaticTicketPosts:automatic,privateStorageHits:0,privateUrlHits:0,cacheAuditComplete:true};
}
export async function runBrowser(){
 let state;
 try{
  state=await preflight();recordPass(state,'browser-preflight-before-provision',{existingChromeHash:state.sourceSha256,noBrowserDownload:true});
  await runNativeAuthProfile('consultation-ticket',async ctx=>{
   try{
    await ctx.setWriteRelease(true); // Explicit owned server release, independent of fixture SQL rights.
    const flow=await browserCase(state,ctx),removed=await cleanup(state);state.cleaned=true;
    recordPass(state,'owned-browser-cleanup',removed);
    check(state.checks.length===browserChecks.length,'p09_browser_check_count');
    return {browser:{status:'PASS',driverVersion:'1.64.1',sourceExecutable:executable,sourceSha256:state.sourceSha256,executable:state.executable,ownedTemp:state.local,ownerId:state.owner,chromeVersion:state.chromeVersion,chromeSha256:state.chromeSha256,closure:state.closure,checks:state.checks,...flow,cleanup:removed}};
   }catch(error){if(state.pageDiagnostic){try{console.log('P03_TICKET_BROWSER_FAILURE_DETAIL '+JSON.stringify(await Promise.race([state.pageDiagnostic(),new Promise(resolve=>setTimeout(()=>resolve({stage:state.stage,operation:state.operation,dom:'DIAGNOSTIC_DEADLINE'}),3000))])));}catch{console.log('P03_TICKET_BROWSER_FAILURE_DETAIL '+JSON.stringify({stage:state.stage,operation:state.operation,dom:'UNAVAILABLE'}));}}throw error;
   }finally{if(!state.cleaned){await cleanup(state);state.cleaned=true;}}
  },{browserMode:true});
 }catch(error){error.p03Stage=state?.stage??'preflight';throw error;}finally{if(state&&!state.cleaned)await cleanup(state);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runBrowser().catch(error=>{console.error('P03_TICKET_BROWSER_FAILURE '+JSON.stringify({status:'FAIL',stage:stateStage(error),reason:browserFailureCode(error),automaticRetry:false,targetInstall:'NOT_APPLIED'}));process.exitCode=1;});
function stateStage(error){return /^[a-z0-9_]+$/.test(error?.p03Stage??'')?error.p03Stage:'inspect_sanitized_browser_checks';}
