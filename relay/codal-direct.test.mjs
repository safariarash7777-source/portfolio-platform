import test from 'node:test';
import assert from 'node:assert/strict';
import { DailyBudget } from './brsapi-client.mjs';
import { createOfficialAnnouncements, officialAnnouncementRows, officialSearchUrl } from './codal-direct.mjs';
const row={TracingNo:1,Symbol:'نمونه',CompanyName:'نمونه',Title:'گزارش نمونه',LetterCode:'ن-۳۰',SentDateTime:'۱۴۰۵/۰۸/۰۶ ۱۲:۳۰:۰۰',PublishDateTime:null,Url:'/Reports/Decision.aspx?LetterSerial=example%3d%3d&rt=0',ExcelUrl:'https://excel.codal.ir/service/Excel/GetAll/example/0',PdfUrl:''};
const body={Total:1,Letters:[row]};

test('current feed keeps the standard reserve after archive stops, without raising the hard ceiling',async()=>{
 const codal=await import('./codal.mjs');
 const budget=new DailyBudget({softBudget:2,hardCeiling:6});
 assert.equal(budget.reserve('bulk'),true);assert.equal(budget.reserve('bulk'),true);
 let sends=0;
 codal.setCodalBudgetPorts({client:{request:async job=>{
  assert.equal('purpose' in job.params,false);
  assert.equal(job.priority,'background');
  if(!budget.reserve(job.budgetClass))throw Error('allocation exhausted');
  sends++;assert.equal(job.producer,'codal-list');return {announcement:[]};
 }}});
 try{
  await assert.rejects(codal.fetchAnnouncementsPage({}),/allocation exhausted/);
  assert.deepEqual(await codal.fetchAnnouncementsPage({purpose:'current'}),[]);
  assert.deepEqual(await codal.fetchAnnouncementsPage({purpose:'current'}),[]);
  await assert.rejects(codal.fetchAnnouncementsPage({purpose:'current'}),/allocation exhausted/);
  await assert.rejects(codal.fetchAnnouncementsPage({purpose:'critical'}),/invalid announcement purpose/);
  assert.equal(sends,2);assert.equal(budget.snapshot().used,4);
  assert.equal(budget.reserve('critical'),true);assert.equal(budget.reserve('critical'),true);
  assert.equal(budget.reserve('critical'),false);
 }finally{codal.setCodalBudgetPorts(null);}
});

test('legacy accounting receives the same explicit current/archive classes before any send',async()=>{
 const codal=await import('./codal.mjs');const calls=[];
 codal.setCodalBudgetPorts({countLegacy:async(producer,cls)=>{calls.push([producer,cls]);throw Error('stop before network');}});
 try{
  await assert.rejects(codal.fetchAnnouncementsPage({purpose:'current'}),/stop before network/);
  await assert.rejects(codal.fetchAnnouncementsPage({}),/stop before network/);
  assert.deepEqual(calls,[['codal-list','standard'],['codal-archive','bulk']]);
 }finally{codal.setCodalBudgetPorts(null);}
});
test('official identity maps into existing contract without guessed dates or values',()=>{
  const [r]=officialAnnouncementRows(body);
  assert.equal(r.link,'https://codal.ir/Reports/Decision.aspx?LetterSerial=example%3d%3d&rt=0');
  assert.equal(r.date_send,'1405/08/06'); assert.equal(r.time_send,'12:30:00');
  assert.equal(r.date_publish,null);assert.equal(r.link_pdf,null); assert.equal(r.date_title,null);
  const q=new URL(officialSearchUrl({l18:'نمونه',category:3,page:2,date_start:'۱۴۰۵/۰۸/۰۱'})).searchParams;
  assert.equal(q.get('Childs'),'false');assert.equal(q.get('Mains'),'true');assert.equal(q.get('FromDate'),'1405/08/01');assert.equal(q.get('PageNumber'),'2');
});
test('malformed report or unsafe source cannot be silently accepted as an empty page',()=>{
  for(const b of [{}, {Total:0,Letters:[row]}, {...body,IsAttacker:true}, {Total:1,Letters:[{...row,SentDateTime:'1405/08/06 99:00:00'}]}, {Total:1,Letters:[{...row,ExcelUrl:'https://other.invalid/a'}]}])assert.throws(()=>officialAnnouncementRows(b));
  assert.deepEqual(officialAnnouncementRows({Total:0,Letters:[]}),[]);
});
test('concurrent and cached readers make one source request; callers cannot mutate cached data',async()=>{
  let calls=0,clock=0;
  const read=createOfficialAnnouncements({now:()=>clock,wait:async ms=>{clock+=ms;},fetchImpl:async()=>{calls++;return Response.json(body);}});
  const [a,b]=await Promise.all([read({}),read({})]);a[0].title='changed';
  assert.equal(b[0].title,row.Title);assert.equal((await read({}))[0].title,row.Title);assert.equal(calls,1);
  clock=300001;await read({});assert.equal(calls,2);
});
test('different pages serialized at least 2100ms apart, failed sends still spaced',async()=>{
  let clock=0;const starts=[];
  const read=createOfficialAnnouncements({now:()=>clock,wait:async ms=>{clock+=ms;},fetchImpl:async()=>{starts.push(clock);if(starts.length===1)throw new Error('network');return Response.json(body);}});
  await assert.rejects(read({page:1}));await read({page:2});assert.deepEqual(starts,[0,2100]);
});
test('429 stops subsequent requests for an hour without fallback or automatic retry',async()=>{
  let clock=0,calls=0;
  const read=createOfficialAnnouncements({now:()=>clock,wait:async ms=>{clock+=ms;},fetchImpl:async()=>{calls++;return new Response('',{status:429});}});
  await assert.rejects(read({}),e=>e.noRetry===true);await assert.rejects(read({page:2}));
  assert.equal(calls,1);clock=3600001;await assert.rejects(read({page:2}));assert.equal(calls,2);
});

test('collector opt-in uses the official source and never spends BRS budget',async()=>{
  const previous=process.env.CODAL_ANNOUNCEMENT_SOURCE, originalFetch=globalThis.fetch;
  let sourceCalls=0,budgetCalls=0;
  process.env.CODAL_ANNOUNCEMENT_SOURCE='official';
  globalThis.fetch=async url=>{
    assert.equal(new URL(url).hostname,'search.codal.ir');sourceCalls++;
    return Response.json(body);
  };
  try {
    const codal=await import('./codal.mjs');
    codal.setCodalBudgetPorts({client:{request:async()=>{budgetCalls++;throw new Error('forbidden provider');}}});
    const rows=await codal.fetchAnnouncementsPage({l18:'نمونه',page:1});
    assert.equal(rows[0].title,row.Title);
    await codal.fetchAnnouncementsPage({l18:'نمونه',page:1});
    assert.equal(sourceCalls,1);assert.equal(budgetCalls,0);
    codal.setCodalBudgetPorts(null);
  } finally {
    globalThis.fetch=originalFetch;
    if(previous===undefined)delete process.env.CODAL_ANNOUNCEMENT_SOURCE;else process.env.CODAL_ANNOUNCEMENT_SOURCE=previous;
  }
});
