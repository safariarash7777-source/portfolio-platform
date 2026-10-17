import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataQualityReport, buildCoordinatorReport, type AgentRun } from './operational-agents';
const now = Date.parse('2026-10-06T08:30:00Z');
const keys = ['gold','currency','funds','stocks','crypto','options','indices'];
function payload() {
  return { gold: [], currency: [], stocks: [{id:'private-id',faName:'private-name',price:987654321,unit:'toman',sourceDate:'1405-07-14',sourceTime:'12:00:00'}], funds: [], crypto: [], options: [], indices: null, fetchedAt: now,
    snapshotQuality: {version:1,state:'complete',attemptedAt:now,families:Object.fromEntries(keys.map(k=>[k,{state:k==='stocks'?'received':'empty',receivedAt:now,retained:false}]))}, commodityFetchedAt:now,commodityState:'received',commodities:[] };
}
function report(snapshot:unknown = payload()) { return buildDataQualityReport({snapshot,snapshotUpdatedAt:new Date(now).toISOString(),codalStateAt:new Date(now).toISOString()},now); }
function check(run:AgentRun,key:string) { return run.report.checks.find(c=>c.key===key)!; }
test('receipt and source are separate; old source does not claim failed ingestion',()=>{
  const p=payload();p.stocks[0].sourceTime='10:00:00';
  const r=report(p);
  assert.equal(check(r,'stocks_receipt').state,'ok');
  assert.equal(check(r,'stocks_source').state,'stale');
  assert.equal(check(r,'snapshot_source').state,'ok');
  assert.equal(r.status,'stale');
  assert.match(check(r,'stocks_source').detail,/به‌تنهایی/);
});
test('future quote and receipt clocks fail beyond canonical clock tolerance',()=>{
  const p=payload();p.stocks[0].sourceTime='12:03:00';p.snapshotQuality.families.stocks.receivedAt=now+120001;
  const r=report(p);
  assert.equal(check(r,'stocks_receipt').state,'failed');
  assert.equal(check(r,'stocks_source').state,'failed');
  assert.equal(r.status,'failed');
});
test('missing data and heartbeat stay unknown; current heartbeat is not completeness proof',()=>{
  const empty=buildDataQualityReport({snapshot:null,snapshotUpdatedAt:null,codalStateAt:null},now);
  assert.equal(empty.status,'unknown');
  assert.equal(check(empty,'codal_heartbeat').state,'unknown');
  assert.equal(check(report(),'codal_heartbeat').state,'ok');
  assert.match(check(report(),'codal_heartbeat').detail,/اثبات نمی‌کند/);
  const future=buildDataQualityReport({snapshot:null,snapshotUpdatedAt:null,codalStateAt:new Date(now+120001).toISOString()},now);
  assert.equal(check(future,'codal_heartbeat').state,'failed');
});
test('retained data remains stale with current clocks and independent healthy families',()=>{
  const p=payload();p.snapshotQuality.families.stocks.retained=true;
  const r=report(p);
  assert.equal(check(r,'stocks_source').state,'stale');
  assert.match(check(r,'stocks_source').detail,/نسخه قبلی/);
  assert.equal(check(r,'gold_source').state,'ok');
});
test('Codal collector heartbeat uses its three-hour cadence, not quote cadence',()=>{
  const input={snapshot:payload(),snapshotUpdatedAt:new Date(now).toISOString(),codalStateAt:new Date(now-2*3600000).toISOString()};
  assert.equal(check(buildDataQualityReport(input,now),'codal_heartbeat').state,'ok');
  input.codalStateAt=new Date(now-3*3600000).toISOString();
  assert.equal(check(buildDataQualityReport(input,now),'codal_heartbeat').state,'stale');
});
test('commodity source and receipt are independent; missing quote clock cannot borrow receipt',()=>{
  const p=payload();p.commodityState='stale';
  const r=report(p);
  assert.equal(check(r,'commodity_receipt').state,'ok');
  assert.equal(check(r,'commodity_source').state,'stale');
  assert.equal(check(r,'commodity_quotes').state,'unknown');
  p.commodityFetchedAt=now+120001;
  assert.equal(check(report(p),'commodity_receipt').state,'failed');
});
test('commodity quotes retain their own old or future clocks despite fresh receipt',()=>{
  const p={...payload(),commodities:[{id:'private-commodity',price:987654321,timeUnix:(now-3600000)/1000}]};
  const old=report(p);
  assert.equal(check(old,'commodity_receipt').state,'ok');
  assert.equal(check(old,'commodity_source').state,'ok');
  assert.equal(check(old,'commodity_quotes').state,'stale');
  p.commodities[0].timeUnix=(now+180000)/1000;
  assert.equal(check(report(p),'commodity_quotes').state,'failed');
});
test('no incoming raw values, identifiers or error prose leak; output is bounded',()=>{
  const p={...payload(),secret:'PRIVATE_SECRET',error:'private-error-url'};
  const r=report(p), text=JSON.stringify(r);
  for(const value of ['987654321','private-name','private-id','PRIVATE_SECRET','private-error-url']) assert.equal(text.includes(value),false);
  assert.ok(r.report.checks.length<=100);assert.ok(r.report.actions.length<=30);assert.ok(Buffer.byteLength(text)<65536);
});
test('coordinator retains child failures, ignores child prose and fails closed on absent evidence',()=>{
  const data=report(),technical:AgentRun={role:'site_monitor',status:'ok',report:{summary:'private',actions:['private'],checks:[{key:'http',label:'private',state:'failed',detail:'private'}]}};
  const out=buildCoordinatorReport(data,technical);
  assert.equal(out.status,'failed');assert.equal(JSON.stringify(out).includes('private'),false);
  technical.report.checks=[];
  assert.equal(check(buildCoordinatorReport(data,technical),'site_monitor').state,'unknown');
  assert.equal(check(buildCoordinatorReport(undefined as unknown as AgentRun,technical),'data_quality').state,'unknown');
});
test('invalid monitor clock returns a bounded explicit failure',()=>{
  assert.equal(buildDataQualityReport({snapshot:null,snapshotUpdatedAt:null,codalStateAt:null},NaN).status,'failed');
});
test('small clock skew agrees with canonical receipt tolerance',()=>{
  const p=payload();p.snapshotQuality.families.stocks.receivedAt=now+1000;p.stocks[0].sourceTime='12:01:00';
  const r=report(p);
  assert.equal(check(r,'stocks_receipt').state,'ok');
  assert.equal(check(r,'stocks_source').state,'ok');
});
