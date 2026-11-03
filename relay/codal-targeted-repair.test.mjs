// Public feed identities only. All financial bodies, backend, journal and
// transport responses below are synthetic; no provider or database is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { runTargetedRepair,currentSourcePins,fingerprintJson } from './codal-targeted-repair.mjs';
import { notifyAdmissionRejection,ADMISSION_REASONS } from './codal-admission-diagnostics.mjs';
import { foladQuantityFixture,loadOfflineCodal } from './fixtures/codal-offline.mjs';

const manifest = () => ({version:1,parserVersion:2,candidates:[
  {feedId:19270,symbol:'فولاد',kind:'ن-۱۰',periodEnd:'1405-06-31',periodMonths:6,
    linkFingerprint:'801696ae4fb5a8d3eceacba75a2ba5cb',sentDate:'1405/07/30',sentTime:'14:37:13',
    link:'https://codal.ir/Reports/Decision.aspx?LetterSerial=qV4MKXMUUbQQQaQQQ9cOOObOOO8qmo3wRg%3d%3d&rt=0&let=6&ct=0&ft=-1',
    excelUrl:'https://excel.codal.ir/service/Excel/GetAll/qV4MKXMUUbQQQaQQQ9cOOObOOO8qmo3wRg%3d%3d/0',
    title:'اطلاعات و صورت‌های مالی میاندوره‌ای  دوره ۶ ماهه منتهی به  ۱۴۰۵/۰۶/۳۱ (حسابرسی نشده)',publishDate:'1405/07/30',expectedAbsent:true},
  {feedId:22948,symbol:'فملی',kind:'ن-۳۰',periodEnd:'1405-07-30',periodMonths:1,
    linkFingerprint:'9eb6811e370dc272276ccae046471904',sentDate:'1405/08/06',sentTime:'14:57:22',
    link:'https://codal.ir/Reports/Decision.aspx?LetterSerial=JBfVmcnpL78zPxQXZY2VzQ%3d%3d&rt=0&let=58&ct=0&ft=-1',
    excelUrl:'https://excel.codal.ir/service/Excel/GetAll/JBfVmcnpL78zPxQXZY2VzQ%3d%3d/0',
    title:'گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به  ۱۴۰۵/۰۷/۳۰',publishDate:'1405/08/06',expectedAbsent:true},
]});

function actualProducer(fetchFixture=async()=>{throw Error('Unexpected synthetic request');}) {
  let source=readFileSync(new URL('./codal.mjs',import.meta.url),'utf8');
  for(const line of ['import { brsFetch as fetch } from "./brsapi-transport.mjs";',
    'import { notifyAdmissionRejection } from "./codal-admission-diagnostics.mjs";',
    'import { createHash } from "node:crypto";']) {assert.ok(source.includes(line));source=source.replace(line,'');}
  source=source.replace(/^export /gm,'');
  const load=vm.runInThisContext('(function(fetch,notifyAdmissionRejection,createHash,process){'+source+
    '\nreturn {PARSER_VERSION,downloadAndParse,insertParsedReport,metaFromAnnouncement:metaFrom,classifyAnnouncement:classify,jalaliYmdToGregorian:jalaliToGregorian};})');
  return load(fetchFixture,notifyAdmissionRejection,createHash,{env:{SUPABASE_URL:'https://repair-store.invalid',SUPABASE_SERVICE_ROLE_KEY:'dummy-repair-test-only'}});
}
async function fixture() {
  const m=manifest(),backendFingerprint='b'.repeat(64),sourcePins=await currentSourcePins(),now=Date.now();
  const coordination={version:1,executor:'root',runId:'offline-test-run-001',manifestHash:fingerprintJson(m),backendFingerprint,
    sourcePinsHash:fingerprintJson(sourcePins),operationDirectory:process.cwd(),issuedAt:now-1000,expiresAt:now+600000,
    collectorExclusive:true,reservedDownloads:2,reservedAppends:2};
  const capsule={version:1,executor:'root',runId:coordination.runId,manifestHash:coordination.manifestHash,sourcePins,backendFingerprint,
    operationDirectory:process.cwd(),coordinationHash:fingerprintJson(coordination),
    issuedAt:coordination.issuedAt,expiresAt:coordination.expiresAt,maxDownloads:2,maxAppends:2};
  const journal=new Map(),rows=new Map(),events=[],objects=new Map();
  const feeds=new Map(m.candidates.map(c=>[c.feedId,{id:c.feedId,symbol:c.symbol,title:c.title,company_name:'Synthetic company',
    report_code:c.kind,sent_date:c.sentDate,sent_time:c.sentTime,publish_date:c.publishDate,link:c.link,link_excel:c.excelUrl}]));
  const original=actualProducer();
  const makeData=c=>({symbol:c.symbol,report_kind:c.kind,period_end:c.periodEnd,period_months:c.periodMonths,unit:'میلیون ریال',
    ...(c.kind==='ن-۱۰'?{standalone:{revenue:100}}:{products:[{product_name:'Synthetic product',sales_qty:0}],quantity_source:null})});
  const makeRow=(c,data)=>({id:c.feedId+100000,symbol:c.symbol,title:c.title,report_kind:c.kind,period_end:original.jalaliYmdToGregorian(...c.periodEnd.split('-')),
    source_url:c.link+'#pv2',data:structuredClone(data),raw:{parser_version:2,announcement_link:c.link,link_excel:c.excelUrl,
      period_end_jalali:c.periodEnd,period_months:c.periodMonths,code:c.kind,date_publish:c.publishDate,time_publish:null}});
  const producer={...original,
    downloadAndParse:async(a,kind,onDownloaded,_onRejected,options)=>{
      const c=m.candidates.find(c=>c.link===a.link);assert.equal(kind,c.kind);
      assert.deepEqual(Object.keys(options),['maxAttempts']);assert.equal(options.maxAttempts,1);
      assert.equal(a.date_title,null);assert.equal(a.time_publish,null);assert.equal(a.date_publish,c.publishDate);
      events.push('download:'+c.feedId);onDownloaded();const data=makeData(c);objects.set(c.feedId,data);return data;
    },
    insertParsedReport:async(a,kind,data,options)=>{
      assert.deepEqual(Object.keys(options),['rejectRedirects']);assert.equal(options.rejectRedirects,true);
      const c=m.candidates.find(c=>c.link===a.link);assert.equal(kind,c.kind);assert.equal(data,objects.get(c.feedId));
      events.push('append:'+c.feedId);rows.set(c.feedId,[makeRow(c,data)]);return 1;
    },
  };
  const ports={producer,backendFingerprint,
    coordination:async()=>{events.push('coordination');return structuredClone(coordination);},
    acquire:async()=>{events.push('lock');return async()=>{events.push('unlock');};},
    readFeed:async c=>{events.push('feed:'+c.feedId);return structuredClone(feeds.get(c.feedId));},
    readReports:async c=>{events.push('read:'+c.feedId);return structuredClone(rows.get(c.feedId)??[]);},
    readJournal:async(key,stage)=>structuredClone(journal.get(key+':'+stage)??null),
    writeJournal:async(key,stage,value)=>{const id=key+':'+stage;assert.equal(journal.has(id),false,'CreateNew, never overwrite');
      journal.set(id,structuredClone(value));events.push(stage+':'+(value.feedId??''));},
  };
  return {m,capsule,coordination,ports,journal,rows,feeds,events,objects,makeData,makeRow,
    run:()=>runTargetedRepair({mode:'execute',manifest:m,capsule},ports)};
}

test('targeted dryRun is the default and touches no execution ports, collection or journal',async()=>{
  const ports=new Proxy({},{get(){throw Error('dryRun touched execution dependency');}});
  const r=await runTargetedRepair({manifest:manifest()},ports);
  assert.equal(r.state,'planned');assert.equal(r.mode,'dryRun');assert.deepEqual(r.targets,[19270,22948]);
  assert.equal(r.downloads,0);assert.equal(r.appends,0);
});

test('exact two-target manifest rejects other symbols, periods, kinds, URLs, versions, duplicates and caller fields',async()=>{
  const mutations=[m=>m.candidates.reverse(),m=>m.candidates.pop(),m=>m.candidates.push(m.candidates[0]),
    m=>m.parserVersion++,m=>m.candidates[0].feedId++,m=>m.candidates[0].symbol='فملی',m=>m.candidates[1].kind='ن-۱۰',
    m=>m.candidates[0].periodMonths=12,m=>m.candidates[0].periodEnd='1405-03-31',m=>m.candidates[0].link+='&changed=1',
    m=>m.candidates[0].linkFingerprint='a'.repeat(32),m=>m.candidates[0].expectedAbsent=false,
    m=>m.candidates[0].excelUrl='https://untrusted.invalid/file',m=>m.candidates[0].date_title='1405/06/31',
    m=>m.force=true,m=>m.candidates[0].sentTime='00:00:00',m=>m.candidates[0].excelUrl+='?token=hidden'];
  for(const mutate of mutations){const m=manifest();mutate(m);const r=await runTargetedRepair({manifest:m});assert.equal(r.state,'invalid_manifest');}
});

test('execute requires a pinned root capsule, current source, exact backend, parser and coordination reservation',async()=>{
  const mutations=[f=>f.capsule.executor='worker',f=>f.capsule.manifestHash='a'.repeat(64),f=>f.capsule.maxDownloads=3,
    f=>f.capsule.maxAppends=3,f=>f.capsule.sourcePins['codal.mjs']='a'.repeat(64),
    f=>{f.capsule.issuedAt=Date.now()-20000;f.capsule.expiresAt=Date.now()-1;},f=>f.ports.backendFingerprint='c'.repeat(64),
    f=>f.ports.producer.PARSER_VERSION=3,f=>f.coordination.collectorExclusive=false,f=>f.coordination.reservedDownloads=1];
  for(const mutate of mutations){const f=await fixture();mutate(f);const r=await f.run();assert.notEqual(r.state,'stored_confirmed');
    assert.equal(r.downloads,0);assert.equal(r.appends,0);assert.equal(f.journal.size,0);assert.ok(!f.events.some(e=>e.startsWith('feed:')));}
  const f=await fixture();assert.equal((await runTargetedRepair({mode:'execute',manifest:f.m},f.ports)).state,'invalid_capsule');
});

test('all readonly preflight identities and absence checks precede claims and collection',async()=>{
  const mutations=[f=>f.feeds.get(19270).title+=' changed',f=>f.feeds.get(22948).link_excel+='changed',
    f=>f.feeds.get(19270).sent_date='1405/07/29',f=>f.feeds.get(22948).report_code='ن-۱۰',
    f=>f.feeds.get(22948).symbol='فولاد',f=>f.rows.set(22948,[{id:1,data:null}]),
    f=>{f.ports.readReports=async()=>{throw Error('synthetic-read-failure');};}];
  for(const mutate of mutations){const f=await fixture();mutate(f);const r=await f.run();assert.equal(r.downloads,0);assert.equal(r.appends,0);
    assert.equal(f.journal.size,0);assert.equal(f.events.at(-1),'unlock');}
});

test('two successful candidates preserve object identity, publication unknowns, durable ordering and exact readback',async()=>{
  const f=await fixture(),r=await f.run();assert.equal(r.state,'stored_confirmed');assert.equal(r.downloads,2);assert.equal(r.appends,2);
  assert.deepEqual(r.results,[{feedId:19270,state:'stored_confirmed'},{feedId:22948,state:'stored_confirmed'}]);
  assert.ok(f.events.indexOf('claim:22948')<f.events.indexOf('download:19270'));
  for(const id of [19270,22948])assert.ok(f.events.indexOf('write:'+id)<f.events.indexOf('append:'+id));
  assert.equal(f.journal.size,6);assert.equal(f.events.at(-1),'unlock');
  const before=[...f.events],again=await f.run();assert.equal(again.state,'reconciliation_only');assert.equal(again.downloads,0);assert.equal(again.appends,0);
  assert.deepEqual(again.results,r.results);assert.equal(f.journal.size,6);
  assert.equal(f.events.slice(before.length).some(e=>/^(download|append):/.test(e)),false);
});

test('an unknown POST is read back once and never replayed, including renewed execution',async()=>{
  for(const persisted of [false,true]) {
    const f=await fixture(),original=f.ports.producer.insertParsedReport;
    f.ports.producer.insertParsedReport=async(...args)=>{if(persisted)await original(...args);throw Error('lost-response-with-sensitive-details');};
    const r=await f.run();assert.equal(r.appends,persisted?2:1);assert.equal(r.state,persisted?'stored_confirmed':'stopped_after_unknown_write');
    const before=f.events.length,again=await f.run();assert.equal(again.state,'reconciliation_only');assert.equal(again.appends,0);assert.equal(again.downloads,0);
    assert.ok(!f.events.slice(before).some(e=>/^(download|append):/.test(e)));assert.doesNotMatch(JSON.stringify(r),/sensitive|lost-response/);
  }
});

test('claim or write-intent failures stop before side effects and partial intents are never retried',async()=>{
  for(const stage of ['claim','write']) {
    const f=await fixture(),write=f.ports.writeJournal;
    f.ports.writeJournal=async(key,name,value)=>{await write(key,name,value);if(name===stage)throw Error('durability acknowledgement lost');};
    const r=await f.run();assert.equal(r.appends,0);assert.equal(r.downloads,stage==='claim'?0:1);
    f.ports.writeJournal=write;const again=await f.run();assert.equal(again.state,'reconciliation_only');assert.equal(again.downloads,0);assert.equal(again.appends,0);
  }
});

test('admission/download rejection never appends and does not leak unapproved diagnostic values',async()=>{
  const f=await fixture();f.ports.producer.downloadAndParse=async(_a,kind,onDownloaded,onRejected)=>{
    onDownloaded();onRejected({kind,reason:'secret_value_from_external_source'});return null;
  };
  const r=await f.run();assert.equal(r.state,'incomplete');assert.equal(r.downloads,2);assert.equal(r.appends,0);
  assert.ok(r.results.every(x=>x.state==='admission_rejected'&&x.reason===null));assert.doesNotMatch(JSON.stringify(r),/secret_value/);
  const g=await fixture();g.ports.producer.downloadAndParse=async()=>{throw Error('raw-error-never-output');};
  const failed=await g.run();assert.equal(failed.appends,0);assert.ok(failed.results.every(x=>x.state==='download_failed'));
});

test('wrong parsed identity and concurrent authoritative appearance cannot pass prewrite checks',async()=>{
  for(const changed of ['symbol','report_kind','period_end','period_months']) {
    const f=await fixture(),parse=f.ports.producer.downloadAndParse;
    f.ports.producer.downloadAndParse=async(...args)=>{const data=await parse(...args);data[changed]='wrong';return data;};
    assert.equal((await f.run()).appends,0);
  }
  const f=await fixture(),parse=f.ports.producer.downloadAndParse;
  f.ports.producer.downloadAndParse=async(...args)=>{const data=await parse(...args);f.rows.set(19270,[{id:1}]);return data;};
  const r=await f.run();assert.equal(r.results[0].state,'prewrite_presence_changed');assert.equal(r.appends,1);
});

test('readback rejects wrong rows, data, period, version and substituted publication time',async()=>{
  const mutations=[r=>r.id=0,r=>r.symbol='wrong',r=>r.source_url+='#other',r=>r.period_end='2025-01-01',
    r=>r.data.standalone.revenue++,r=>r.raw.parser_version=3,r=>r.raw.time_publish='14:37:13',r=>r.raw.date_publish=null,
    r=>r.raw.announcement_link+='other',r=>r.raw.link_excel+='other',r=>r.raw.period_months=12,r=>r.title+='other'];
  for(const mutate of mutations){const f=await fixture(),insert=f.ports.producer.insertParsedReport;
    f.ports.producer.insertParsedReport=async(...args)=>{const result=await insert(...args);mutate(f.rows.get(19270)[0]);return result;};
    const r=await f.run();assert.equal(r.state,'stopped_after_unknown_write');assert.equal(r.appends,1);assert.equal(r.results[0].state,'write_unknown_no_replay');}
});

test('journal identity corruption, lost readback and lock failures cannot authorize collection replay',async()=>{
  const f=await fixture();await f.run();const first=[...f.journal.keys()].find(k=>k.endsWith(':claim'));f.journal.get(first).feedId=999;
  const r=await f.run();assert.equal(r.state,'journal_identity_mismatch');assert.equal(r.downloads,0);
  const g=await fixture();g.ports.acquire=async()=>{throw Error('occupied');};assert.equal((await g.run()).downloads,0);
  const h=await fixture(),read=h.ports.readReports;h.ports.readReports=async c=>{
    if(h.events.some(e=>e.startsWith('append:')))throw Error('readback-unavailable');return read(c);};
  const result=await h.run();assert.equal(result.state,'stopped_after_unknown_write');assert.equal(result.appends,1);
});

test('one-attempt producer option prevents retry and redirects while legacy retry remains covered by existing tests',async()=>{
  const a={l18:'فولاد',link:'https://codal.ir/Reports/offline-test',link_excel:'https://excel.codal.ir/service/Excel/GetAll/offline/0',title:'دوره ۱ ماهه 1405/06/31'};
  for(const kind of ['ن-۱۰','ن-۳۰']) {
    let calls=0;const {parser}=loadOfflineCodal({fetchFixture:async(_url,init)=>{calls++;assert.equal(init.redirect,'error');throw Error('synthetic-failure');}});
    await assert.rejects(parser.downloadAndParse(a,kind,undefined,undefined,{maxAttempts:1}));assert.equal(calls,1);
    for(const maxAttempts of [0,2,4,Infinity,'1'])await assert.rejects(parser.downloadAndParse(a,kind,undefined,undefined,{maxAttempts}));
    assert.equal(calls,1);
  }
  const archived=foladQuantityFixture();let calls=0;
  const {parser}=loadOfflineCodal({fetchFixture:async(url,init)=>{calls++;assert.equal(init.redirect,'error');
    const r=new Response(archived.bytes);Object.defineProperty(r,'url',{value:url});return r;}});
  const data=await parser.downloadAndParse({...a,link_excel:archived.origin.sourceId},'ن-۳۰',undefined,undefined,{maxAttempts:1});
  assert.ok(data.quantity_source);assert.equal(calls,1);
});

test('actual N30 producer and insert retain byte receipt through targeted orchestration and final readback',async()=>{
  for(const dropReceipt of [false,true]) {
  const f=await fixture(),c=f.m.candidates[1],header=Array(26).fill(''),row=Array(26).fill('');
  header[0]='نام محصول';header[1]='واحد';header[13]='مقدار تولید';header[14]='مقدار فروش';header[15]='نرخ فروش';
  row[0]='Synthetic product';row[1]='هزار تن';row[13]='2';row[14]='1';row[15]='1000000';row[16]='1';
  const table=[['دوره یک ماهه منتهی به 1405/07/30 (میلیون ریال)'],header,['فروش داخلی:'],row];
  const html='<table>'+table.map(r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</table>';
  let requests=0,post=0;
  const actual=actualProducer(async(url,init)=>{
    if(url===c.excelUrl){requests++;assert.equal(init.redirect,'error');const r=new Response(html);Object.defineProperty(r,'url',{value:url});return r;}
    assert.equal(url,'https://repair-store.invalid/rest/v1/codal_reports?on_conflict=source_url&select=source_url');
    assert.equal(init.method,'POST');assert.equal(init.redirect,'error');post++;const [stored]=JSON.parse(init.body);if(dropReceipt)delete stored.raw.quantity_capture;
    f.rows.set(c.feedId,[{...stored,id:12345}]);return Response.json([{source_url:stored.source_url}]);
  });
  f.ports.producer={...actual,downloadAndParse:async(a,kind,...rest)=>kind==='ن-۱۰'?null:actual.downloadAndParse(a,kind,...rest)};
  const r=await f.run();assert.equal(r.state,dropReceipt?'stopped_after_unknown_write':'incomplete');
  assert.equal(r.results[1].state,dropReceipt?'write_unknown_no_replay':'stored_confirmed');
  assert.equal(requests,1);assert.equal(post,1);assert.equal(r.appends,1);
  const stored=f.rows.get(c.feedId)[0];if(!dropReceipt){assert.equal(stored.raw.quantity_capture.symbol,'فملی');
  assert.equal(stored.raw.quantity_capture.period_end_jalali,'1405-07-30');}assert.equal(stored.raw.time_publish,null);
  assert.equal(stored.data.products[0].sales_qty,1);assert.equal(stored.data.products[0].qty_unit,'هزار تن');
  }
});

// Exercise the actual livePorts implementation with virtual Linux filesystem,
// fixed fake HTTP and a private producer. Never replace the host fetch or env.
async function adapterFixture() {
  const f=await fixture(),base='https://repair-store.invalid',files=new Map(),io=[],clock={now:Date.now()};
  class PrivateDate extends Date {static now(){return clock.now;}}
  const backend=createHash('sha256').update(base).digest('hex');
  f.capsule.backendFingerprint=backend;f.coordination.backendFingerprint=backend;
  f.capsule.coordinationHash=fingerprintJson(f.coordination);
  const directory=path.resolve(f.capsule.operationDirectory);
  files.set(path.join(directory,'coordination.json'),JSON.stringify(f.coordination));
  const error=code=>Object.assign(new Error(code),{code});
  const fs={
    readFile:async(file)=>file instanceof URL?readFileSync(file):files.has(file)?files.get(file):Promise.reject(error('ENOENT')),
    realpath:async file=>file,
    lstat:async file=>{
      if(file!==directory&&!files.has(file))throw error('ENOENT');
      return {isDirectory:()=>file===directory,isFile:()=>file!==directory,isSymbolicLink:()=>false,size:(files.get(file)??'').length};
    },
    open:async(file,mode)=>{
      io.push({operation:'open',file,mode});
      if(mode==='wx'){if(files.has(file))throw error('EEXIST');files.set(file,'');}
      else assert.equal(file,directory);
      return {writeFile:async text=>{io.push({operation:'write',file});files.set(file,text);},
        sync:async()=>{io.push({operation:'sync',file});},close:async()=>{io.push({operation:'close',file});}};
    },
    unlink:async file=>{assert.equal(file,path.join(directory,'repair.lock'));io.push({operation:'unlink',file});files.delete(file);},
  };
  const network=async(input,init)=>{
    const u=new URL(input);assert.equal(u.origin,base);assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
    assert.ok(init.signal instanceof AbortSignal);assert.equal(init.headers.apikey,'dummy-operator-test');
    io.push({operation:'GET',table:u.pathname});
    if(u.pathname==='/rest/v1/codal_feed') {assert.equal(u.searchParams.get('limit'),'2');
      return Response.json([f.feeds.get(Number(u.searchParams.get('id').slice(3)))]);}
    assert.equal(u.pathname,'/rest/v1/codal_reports');assert.equal(u.searchParams.get('limit'),'3');
    const c=f.m.candidates.find(c=>'eq.'+c.symbol===u.searchParams.get('symbol'));assert.ok(c);
    const literal=c.link.replace(/[\\%_*]/g,ch=>'\\'+ch);
    assert.equal(u.searchParams.get('or'),'(source_url.eq.'+JSON.stringify(c.link)+',source_url.like.'+JSON.stringify(literal+'#pv%')+')');
    return Response.json(f.rows.get(c.feedId)??[]);
  };
  const producer={...f.ports.producer,codalEnv:{SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:'dummy-operator-test'}};
  const insert=producer.insertParsedReport;
  producer.insertParsedReport=async(...args)=>{io.push({operation:'POST'});return insert(...args);};
  let source=readFileSync(new URL('./codal-targeted-repair.mjs',import.meta.url),'utf8');
  for(const line of ["import { createHash } from 'node:crypto';","import { readFile, open, realpath, lstat, unlink } from 'node:fs/promises';",
    "import path from 'node:path';","import { ADMISSION_REASONS } from './codal-admission-diagnostics.mjs';"]){assert.ok(source.includes(line));source=source.replace(line,'');}
  source=source.replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('./codal-targeted-repair.mjs',import.meta.url).href));
  assert.ok(source.includes("await import('./codal.mjs')"));source=source.replace("await import('./codal.mjs')",'await loadProducer()');
  const subject=vm.runInNewContext('(function(){'+source+'\nreturn {runTargetedRepair};})()',{
    ...fs,path,createHash,ADMISSION_REASONS,process:{platform:'linux'},loadProducer:async()=>producer,fetch:network,
    Date:PrivateDate,URL,URLSearchParams,AbortSignal,console:{log(){throw Error('raw logging');},error(){throw Error('raw logging');}},
  });
  return {...f,files,io,directory,clock,operatorProducer:producer,
    run:()=>subject.runTargetedRepair({mode:'execute',manifest:f.m,capsule:f.capsule})};
}

test('actual operator adapter scopes GETs, persists and fsyncs intents before POST, reconciles without replay',async()=>{
  const f=await adapterFixture(),r=await f.run();assert.equal(r.state,'stored_confirmed');assert.equal(r.appends,2);
  const firstPost=f.io.findIndex(e=>e.operation==='POST');
  assert.ok(firstPost>0);assert.ok(f.io.slice(0,firstPost).some(e=>e.operation==='sync'&&e.file===f.directory));
  assert.equal(f.io.filter(e=>e.operation==='POST').length,2);
  assert.equal(f.files.size,7,'coordination plus six immutable journal files; lock released');
  const before=f.io.length,again=await f.run();assert.equal(again.state,'reconciliation_only');assert.equal(again.downloads,0);
  assert.equal(f.io.slice(before).some(e=>e.operation==='POST'),false);
  const changed=await adapterFixture();changed.files.set(path.join(changed.directory,'repair.lock'),'another owner');
  assert.equal((await changed.run()).state,'execution_stopped');assert.ok(changed.files.has(path.join(changed.directory,'repair.lock')));
  assert.equal(changed.io.some(e=>e.operation==='GET'||e.operation==='POST'),false);
});

test('caller capsule mutation and outcome persistence failure cannot enable a write replay',async()=>{
  const f=await fixture(),parse=f.ports.producer.downloadAndParse;
  f.ports.producer.downloadAndParse=async(...args)=>{const data=await parse(...args);f.capsule.expiresAt=1;return data;};
  // Caller mutation cannot change the captured execution capsule.
  assert.equal((await f.run()).state,'stored_confirmed');
  const g=await fixture(),write=g.ports.writeJournal;
  g.ports.writeJournal=async(key,stage,value)=>{if(stage==='outcome')throw Error('disk unavailable');return write(key,stage,value);};
  assert.equal((await g.run()).state,'execution_stopped');const next=await g.run();
  assert.equal(next.state,'reconciliation_only');assert.equal(next.appends,0);assert.equal(next.results[0].state,'stored_confirmed');
});

test('actual operator rechecks capsule expiration after collection and stops before append',async()=>{
  const f=await adapterFixture(),parse=f.operatorProducer.downloadAndParse;
  f.operatorProducer.downloadAndParse=async(...args)=>{const data=await parse(...args);f.clock.now=f.capsule.expiresAt;return data;};
  const r=await f.run();assert.equal(r.state,'expired_capsule');assert.equal(r.downloads,1);assert.equal(r.appends,0);
  assert.equal(f.io.some(e=>e.operation==='POST'),false);assert.equal([...f.files.keys()].filter(k=>k.endsWith('.claim.json')).length,2);
});

test('actual producer rejects 307/308 POST responses and fetch redirect errors without a second write or success claim',async()=>{
  // Real Response redirect statuses through the actual producer; transport is
  // synthetic under B2. The redirect option also covers native Fetch rejecting
  // before returning a Response. No local server or real network is opened.
  for(const status of [307,308])for(const nativeReject of [false,true]) {
    const f=await fixture(),c=f.m.candidates[0];let requests=0,forwarded=0;
    const actual=actualProducer(async(url,init)=>{
      requests++;assert.equal(init.method,'POST');
      assert.equal(url,'https://repair-store.invalid/rest/v1/codal_reports?on_conflict=source_url&select=source_url');
      assert.equal(init.headers.apikey,'dummy-repair-test-only');
      if(init.redirect!=='error'){forwarded++;throw Error('synthetic redirected second write');}
      if(nativeReject)throw new TypeError('fetch failed');
      return new Response(null,{status,headers:{Location:'https://redirect-target.invalid/second-write'}});
    });
    f.ports.producer.insertParsedReport=actual.insertParsedReport;
    const result=await f.run();assert.equal(result.state,'stopped_after_unknown_write');
    assert.deepEqual(result.results,[{feedId:c.feedId,state:'write_unknown_no_replay'}]);
    assert.equal(result.downloads,1);assert.equal(result.appends,1);assert.equal(requests,1);assert.equal(forwarded,0);
    assert.equal(f.events.filter(e=>e==='read:'+c.feedId).length,3,'preflight, prewrite, authoritative readback once');
    assert.equal(f.rows.size,0);const again=await f.run();assert.equal(again.state,'reconciliation_only');
    assert.equal(again.appends,0);assert.equal(again.downloads,0);assert.equal(requests,1);
    assert.equal(again.results[0].state,'unresolved_no_replay');
  }
});

test('targeted duplicate confirmation rejects 307/308 without forwarding credentials or confirming storage',async()=>{
  for(const status of [307,308]) {
    const f=await fixture();let posts=0,gets=0;
    const actual=actualProducer(async(url,init)=>{
      assert.equal(new URL(url).origin,'https://repair-store.invalid');assert.equal(init.redirect,'error');
      if(init.method==='POST'){posts++;return Response.json([]);}
      gets++;return new Response(null,{status,headers:{Location:'https://redirect-target.invalid/read'}});
    });
    f.ports.producer.insertParsedReport=actual.insertParsedReport;
    const result=await f.run();assert.equal(result.state,'stopped_after_unknown_write');
    assert.equal(result.results[0].state,'write_unknown_no_replay');assert.equal(posts,1);assert.equal(gets,1);
    const again=await f.run();assert.equal(again.state,'reconciliation_only');assert.equal(posts,1);assert.equal(gets,1);
  }
});

test('legacy insert and duplicate confirmation keep default redirect behavior and invalid bounds do no I/O',async()=>{
  const f=await fixture(),c=f.m.candidates[0],a={l18:c.symbol,l30:c.symbol,title:c.title,code:c.kind,
    link:c.link,link_excel:c.excelUrl,date_title:null,date_publish:c.publishDate,time_publish:null};
  for(const options of [undefined,{rejectRedirects:false}]) {
    let posts=0,gets=0;
    const actual=actualProducer(async(_url,init)=>{
      assert.equal(Object.hasOwn(init,'redirect'),false);
      if(init.method==='POST'){posts++;return Response.json([]);}
      gets++;return Response.json([{source_url:c.link+'#pv2',symbol:c.symbol,data:f.makeData(c)}]);
    });
    assert.equal(await actual.insertParsedReport(a,c.kind,f.makeData(c),options),0);assert.equal(posts,1);assert.equal(gets,1);
  }
  let calls=0;const actual=actualProducer(async()=>{calls++;throw Error('unexpected transport');});
  for(const rejectRedirects of ['error',1,null])await assert.rejects(actual.insertParsedReport(a,c.kind,f.makeData(c),{rejectRedirects}));
  assert.equal(calls,0);
});
