// Operator-only library, not a route, scheduler or auto-running CLI. Import and
// dryRun are inert. The capsule is a reviewed execution contract, not identity
// authentication: root must establish the external collector/budget exclusion.
import { createHash } from 'node:crypto';
import { readFile, open, realpath, lstat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { ADMISSION_REASONS } from './codal-admission-diagnostics.mjs';

const TARGETS = Object.freeze([
  { feedId:19270, symbol:'فولاد', kind:'ن-۱۰', periodEnd:'1405-06-31', periodMonths:6,
    linkFingerprint:'801696ae4fb5a8d3eceacba75a2ba5cb', sentDate:'1405/07/30', sentTime:'14:37:13' },
  { feedId:22948, symbol:'فملی', kind:'ن-۳۰', periodEnd:'1405-07-30', periodMonths:1,
    linkFingerprint:'9eb6811e370dc272276ccae046471904', sentDate:'1405/08/06', sentTime:'14:57:22' },
]);
export const SOURCE_FILES = Object.freeze(['codal.mjs','codal-targeted-repair.mjs','codal-admission-diagnostics.mjs','brsapi-transport.mjs']);
const sha = value => createHash('sha256').update(value).digest('hex');
const md5 = value => createHash('md5').update(value).digest('hex'); // Public identity receipt only, not authentication.
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const sorted = x => Array.isArray(x) ? x.map(sorted) : object(x) ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])) : x;
export const fingerprintJson = x => sha(JSON.stringify(sorted(JSON.parse(JSON.stringify(x)))));
const digits = x => String(x??'').replace(/[۰-۹٠-٩]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.includes(c)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(c):'٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
const same = (a,b) => fingerprintJson(a) === fingerprintJson(b);
const fail = code => { throw new Error(code); };
const hex = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const keys = (x,list) => object(x) && Object.keys(x).length === list.length && list.every(k=>Object.hasOwn(x,k));
function publicUrl(value, excel = false) {
  if(typeof value !== 'string' || value !== value.trim()) return false;
  try {
    const u=new URL(value);
    return u.protocol==='https:' && !u.port && !u.username && !u.password && !u.hash
      && (excel ? u.hostname==='excel.codal.ir' && /^\/service\/Excel\/GetAll\/[^/]+\/0$/.test(u.pathname)
        : ['codal.ir','www.codal.ir'].includes(u.hostname))
      && ![...u.searchParams.keys()].some(k=>/token|secret|password|api.?key/i.test(k));
  } catch { return false; }
}
function manifestCopy(input) {
  if(!keys(input,['version','parserVersion','candidates']) || input.version!==1 || input.parserVersion!==2
    || !Array.isArray(input.candidates) || input.candidates.length!==2) fail('invalid_manifest');
  for(let i=0;i<2;i++) {
    const c=input.candidates[i], target=TARGETS[i];
    if(!keys(c,[...Object.keys(target),'link','excelUrl','title','publishDate','expectedAbsent'])
      || !Object.entries(target).every(([k,v])=>c[k]===v) || c.expectedAbsent!==true
      || !publicUrl(c.link) || md5(c.link)!==target.linkFingerprint || !publicUrl(c.excelUrl,true)
      || typeof c.title!=='string' || !c.title.trim() || c.title.length>4096
      || typeof c.publishDate!=='string' || !/^1[34]\d{2}\/\d{2}\/\d{2}$/.test(c.publishDate)) fail('invalid_manifest');
  }
  return JSON.parse(JSON.stringify(input));
}
export async function currentSourcePins() {
  return Object.fromEntries(await Promise.all(SOURCE_FILES.map(async name=>[name,sha(await readFile(new URL(name,import.meta.url)))])));
}
function capsuleCopy(input, manifestHash) {
  if(!keys(input,['version','executor','runId','manifestHash','sourcePins','backendFingerprint','operationDirectory',
    'coordinationHash','issuedAt','expiresAt','maxDownloads','maxAppends']) || input.version!==1 || input.executor!=='root'
    || !/^[a-zA-Z0-9_-]{12,80}$/.test(input.runId??'') || input.manifestHash!==manifestHash
    || !keys(input.sourcePins,SOURCE_FILES) || !Object.values(input.sourcePins).every(hex)
    || !hex(input.backendFingerprint) || !hex(input.coordinationHash) || !path.isAbsolute(input.operationDirectory??'')
    || input.maxDownloads!==2 || input.maxAppends!==2 || !Number.isSafeInteger(input.issuedAt)
    || !Number.isSafeInteger(input.expiresAt) || input.expiresAt<=input.issuedAt || input.expiresAt-input.issuedAt>900000) fail('invalid_capsule');
  return JSON.parse(JSON.stringify(input));
}
function active(c) { if(Date.now()<c.issuedAt || Date.now()>=c.expiresAt) fail('expired_capsule'); }
function coordinationValid(r,c) {
  return keys(r,['version','executor','runId','manifestHash','backendFingerprint','sourcePinsHash','operationDirectory','issuedAt','expiresAt',
    'collectorExclusive','reservedDownloads','reservedAppends']) && r.version===1 && r.executor==='root'
    && r.runId===c.runId && r.manifestHash===c.manifestHash && r.backendFingerprint===c.backendFingerprint
    && r.sourcePinsHash===fingerprintJson(c.sourcePins) && r.operationDirectory===c.operationDirectory
    && r.issuedAt===c.issuedAt && r.expiresAt===c.expiresAt
    && r.collectorExclusive===true && r.reservedDownloads===2 && r.reservedAppends===2 && fingerprintJson(r)===c.coordinationHash;
}
function announcement(c,feed) {
  if(!object(feed) || feed.id!==c.feedId || feed.symbol!==c.symbol || feed.link!==c.link || feed.link_excel!==c.excelUrl
    || feed.title!==c.title || feed.report_code!==c.kind || digits(feed.sent_date)!==c.sentDate
    || digits(feed.sent_time)!==c.sentTime || digits(feed.publish_date)!==c.publishDate) fail('feed_identity_changed');
  return Object.freeze({l18:c.symbol,l30:feed.company_name??c.symbol,title:feed.title,code:feed.report_code,
    link:c.link,link_excel:c.excelUrl,date_title:null,date_publish:feed.publish_date,time_publish:null});
}
const targetKey = (c,capsule) => fingerprintJson([capsule.backendFingerprint,c.feedId,c.linkFingerprint,2]);
const intentBase = (c,capsule) => ({version:1,manifestHash:capsule.manifestHash,backendFingerprint:capsule.backendFingerprint,
  sourcePinsHash:fingerprintJson(capsule.sourcePins),feedId:c.feedId,linkFingerprint:c.linkFingerprint,parserVersion:2});
function intentValid(r,expected,write=false) {
  return keys(r,[...Object.keys(expected),...(write?['dataHash']:[])]) && Object.entries(expected).every(([k,v])=>r[k]===v)
    && (!write || hex(r.dataHash));
}
function parsedIdentity(data,c) {
  return object(data) && data.symbol===c.symbol && data.report_kind===c.kind && data.period_end===c.periodEnd
    && data.period_months===c.periodMonths && (c.kind==='ن-۱۰' ? object(data.standalone) && data.unit==='میلیون ریال'
      : Array.isArray(data.products) && data.products.length>0);
}
function confirmed(rows,c,write,producer) {
  if(!Array.isArray(rows) || rows.length!==1 || !write) return false;
  const r=rows[0],raw=r?.raw,data=r?.data;
  if(!Number.isSafeInteger(r?.id) || r.id<=0 || r.symbol!==c.symbol || r.report_kind!==c.kind
    || r.title!==c.title || r.source_url!==c.link+'#pv2' || r.period_end!==producer.jalaliYmdToGregorian(...c.periodEnd.split('-'))
    || !parsedIdentity(data,c) || fingerprintJson(data)!==write.dataHash || raw?.parser_version!==2
    || raw.announcement_link!==c.link || raw.link_excel!==c.excelUrl || raw.period_end_jalali!==c.periodEnd
    || raw.period_months!==c.periodMonths || raw.code!==c.kind || digits(raw.date_publish)!==c.publishDate
    || raw.time_publish!==null) return false;
  if(c.kind==='ن-۳۰' && data.quantity_source) {
    const receipt=raw.quantity_capture,source=data.quantity_source;
    if(!object(receipt) || receipt.version!==1 || receipt.symbol!==c.symbol || receipt.report_kind!==c.kind
      || receipt.source_url!==r.source_url || receipt.announcement_link!==c.link || receipt.link_excel!==c.excelUrl
      || receipt.response_url!==new URL(c.excelUrl).href || receipt.parser_version!==2
      || receipt.period_end_jalali!==c.periodEnd || !hex(receipt.html_sha256)
      || receipt.html_sha256!==source.htmlSha256 || source.sourceId!==c.excelUrl || source.symbol!==c.symbol
      || source.periodEnd!==c.periodEnd || !same(receipt.source,source)) return false;
  }
  return true;
}

// Only root's explicit execute call enters this branch. Supplying ports is for
// offline integration tests; it is dependency injection, not an authorization bypass.
export async function runTargetedRepair(request={}, suppliedPorts) {
  let manifest,capsule,ports,release;
  const receipt={version:1,mode:request.mode??'dryRun',state:'invalid_manifest',downloads:0,appends:0,results:[]};
  try { manifest=manifestCopy(request.manifest); } catch { return receipt; }
  receipt.manifestHash=fingerprintJson(manifest);
  if(receipt.mode==='dryRun') return {...receipt,state:'planned',targets:manifest.candidates.map(c=>c.feedId)};
  if(receipt.mode!=='execute') return {...receipt,state:'invalid_mode'};
  try {
    capsule=capsuleCopy(request.capsule,receipt.manifestHash);active(capsule);
    if(!same(await currentSourcePins(),capsule.sourcePins)) fail('source_pin_mismatch');
    ports=suppliedPorts??await livePorts(capsule);
    if(ports.backendFingerprint!==capsule.backendFingerprint || ports.producer.PARSER_VERSION!==2) fail('backend_or_parser_mismatch');
    if(!coordinationValid(await ports.coordination(),capsule)) fail('coordination_rejected');
    release=await ports.acquire();
    const pending=[];
    for(const c of manifest.candidates) {
      active(capsule);
      const a=announcement(c,await ports.readFeed(c));
      const meta=ports.producer.metaFromAnnouncement(a,c.kind);
      if(ports.producer.classifyAnnouncement(a)!==c.kind || meta.symbol!==c.symbol
        || meta.period_end!==c.periodEnd || meta.period_months!==c.periodMonths) fail('announcement_period_mismatch');
      const key=targetKey(c,capsule),base=intentBase(c,capsule);
      const claim=await ports.readJournal(key,'claim'),write=await ports.readJournal(key,'write');
      if((claim!==null&&!intentValid(claim,base)) || (write!==null&&(!claim||!intentValid(write,base,true)))) fail('journal_identity_mismatch');
      const rows=await ports.readReports(c);
      if(!Array.isArray(rows)) fail('preflight_unknown');
      pending.push({c,a,key,base,claim,write,rows});
    }
    // A previous intent always selects reconciliation, even if no row is found.
    // A new run ID or renewed capsule never silently replays an uncertain write.
    if(pending.some(p=>p.claim)) {
      for(const p of pending) receipt.results.push({feedId:p.c.feedId,state:p.claim
        ? confirmed(p.rows,p.c,p.write,ports.producer)?'stored_confirmed':'unresolved_no_replay' : 'not_attempted'});
      return Object.assign(receipt,{state:'reconciliation_only'});
    }
    if(pending.some(p=>p.rows.length!==0)) return Object.assign(receipt,{state:'expected_absence_changed'});
    // Durable claims precede any collection, shared by all root executions using
    // the pinned operation directory. Partial/failed claims also prevent replay.
    for(const p of pending) await ports.writeJournal(p.key,'claim',p.base);
    for(const p of pending) {
      active(capsule);
      let data,rejected=null,stage='download';
      receipt.downloads++;
      try { data=await ports.producer.downloadAndParse(p.a,p.c.kind,()=>{stage='admission';},event=>{
        if(event?.kind===p.c.kind && ADMISSION_REASONS[p.c.kind].includes(event.reason)) rejected=event.reason;
      },{maxAttempts:1}); } catch { receipt.results.push({feedId:p.c.feedId,state:stage+'_failed'});continue; }
      if(!data || !parsedIdentity(data,p.c)) { receipt.results.push({feedId:p.c.feedId,state:'admission_rejected',reason:rejected});continue; }
      active(capsule);
      // Recheck the authoritative row just before intent/write, without clearing
      // or updating any collector state. An unexpected row stops this target.
      if((await ports.readReports(p.c)).length!==0) {receipt.results.push({feedId:p.c.feedId,state:'prewrite_presence_changed'});continue;}
      p.write={...p.base,dataHash:fingerprintJson(data)};
      await ports.writeJournal(p.key,'write',p.write);
      active(capsule);receipt.appends++;
      try { await ports.producer.insertParsedReport(p.a,p.c.kind,data); } catch { /* Read back once; never replay POST. */ }
      let result={feedId:p.c.feedId,state:'write_unknown_no_replay'};
      try { if(confirmed(await ports.readReports(p.c),p.c,p.write,ports.producer)) result={feedId:p.c.feedId,state:'stored_confirmed'}; } catch { /* Intent remains authoritative for recovery. */ }
      await ports.writeJournal(p.key,'outcome',result);
      receipt.results.push(result);
      if(result.state!=='stored_confirmed') return Object.assign(receipt,{state:'stopped_after_unknown_write'});
    }
    receipt.state=receipt.results.every(r=>r.state==='stored_confirmed')?'stored_confirmed':'incomplete';
  } catch(e) {
    const safe=new Set(['invalid_capsule','expired_capsule','source_pin_mismatch','backend_or_parser_mismatch','coordination_rejected',
      'feed_identity_changed','announcement_period_mismatch','journal_identity_mismatch','preflight_unknown']);
    receipt.state=safe.has(e?.message)?e.message:'execution_stopped';
  } finally { if(release) {try {await release();} catch {receipt.state='lock_release_unknown';}} }
  return receipt;
}

async function livePorts(capsule) {
  // The existing relay runs on Linux; directory fsync is required for durable
  // no-replay intents. Unsupported local execution stops before loading secrets.
  if(process.platform!=='linux') fail('unsupported_operator_platform');
  const directory=path.resolve(capsule.operationDirectory);
  if(!((await lstat(directory)).isDirectory()) || path.resolve(await realpath(directory))!==directory) fail('operation_directory_rejected');
  const producer=await import('./codal.mjs');
  const {SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:key}=producer.codalEnv;
  const url=new URL(base);
  if(!['https:','http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || sha(base)!==capsule.backendFingerprint || typeof key!=='string' || !key) fail('backend_or_parser_mismatch');
  const query=async(table,params)=>{
    const response=await fetch(base+'/rest/v1/'+table+'?'+new URLSearchParams(params),{method:'GET',redirect:'error',cache:'no-store',
      headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
    if(!response.ok) fail('read_failed');
    return response.json();
  };
  const journalPath=(key,stage)=>{
    if(!hex(key)||!['claim','write','outcome'].includes(stage)) fail('journal_path_rejected');
    return path.join(directory,key+'.'+stage+'.json');
  };
  const readSafe=async file=>{
    const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384) fail('journal_file_rejected');
    return JSON.parse(await readFile(file,'utf8'));
  };
  return {
    producer,backendFingerprint:sha(base),
    coordination:()=>readSafe(path.join(directory,'coordination.json')),
    acquire:async()=>{
      const file=path.join(directory,'repair.lock'),handle=await open(file,'wx',0o600);
      try {await handle.writeFile(capsule.runId);await handle.sync();} catch(e) {await handle.close();throw e;}
      return async()=>{await handle.close();await unlink(file);};
    },
    readFeed:async c=>{
      const rows=await query('codal_feed',{id:'eq.'+c.feedId,select:'id,symbol,company_name,title,report_code,sent_date,sent_time,publish_date,link,link_excel',limit:'2'});
      if(!Array.isArray(rows)||rows.length!==1) fail('feed_identity_changed');return rows[0];
    },
    readReports:async c=>{
      // Quoted PostgREST operands and escaped LIKE metacharacters preserve the
      // public URL literally. No fallback to a broad symbol/history query.
      const literal=c.link.replace(/[\\%_*]/g,ch=>'\\'+ch);
      const rows=await query('codal_reports',{symbol:'eq.'+c.symbol,
        or:'(source_url.eq.'+JSON.stringify(c.link)+',source_url.like.'+JSON.stringify(literal+'#pv%')+')',
        select:'id,symbol,title,report_kind,period_end,source_url,data,raw',limit:'3'});
      if(!Array.isArray(rows)||rows.some(r=>r?.symbol!==c.symbol || typeof r.source_url!=='string'
        || r.source_url.split('#')[0]!==c.link)) fail('preflight_unknown');return rows;
    },
    readJournal:async(key,stage)=>{try{return await readSafe(journalPath(key,stage));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
    writeJournal:async(key,stage,value)=>{
      const handle=await open(journalPath(key,stage),'wx',0o600);
      try {await handle.writeFile(JSON.stringify(value)+'\n','utf8');await handle.sync();}finally{await handle.close();}
      const parent=await open(directory,'r');try{await parent.sync();}finally{await parent.close();}
    },
  };
}
