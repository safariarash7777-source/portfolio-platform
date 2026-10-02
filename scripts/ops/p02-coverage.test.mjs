import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { adaptMetadata, run, sourceFreshness } from './p02-coverage.mjs';
const at='2026-10-02T13:00:00Z';
function fixture() {return [
 {kind:'header',observedAt:at,readOnly:'on',rangeStart:'2026-09-30',rangeEnd:'2026-10-02',budgetTablePresent:false,budgetFunctions:[]},
 {kind:'historyCells',rows:[{symbol:'فملی',day:'2026-09-30',source:'brsapi_candle',row_count:1,first_id:1,last_id:1,all_candle_marker:true,first_captured_at:at,last_captured_at:at}]},
 {kind:'historyUniverse',rows:[{symbol:'فملی',source:'brsapi_candle',row_count:1}]},
 {kind:'snapshotUniverse',rows:[{symbol:'فملی',section:'stocks',unit:'toman',updated_at:at},
  {symbol:'صندوق',section:'funds',unit:'toman',industry_id:'68',updated_at:at,nav_present:true,nav_positive:true,nav_ratio_plausible:true,nav_date:'1405-07-08',nav_time:'16:00:00'}]},
 {kind:'state',rows:[{key:'nav_blacklist',updated_at:at,blacklist:['صندوق'],failCounts:{}},
  {key:'candle_backfill_state',updated_at:at,done:{فملی:1,قدیمی:100},failed:{},reqDate:'2026-09-30'}]},
 {kind:'families'}, {kind:'budgetState',status:'table_absent',rows:null}];}
test('stored row/done/source labels cannot invent type2, trade, gap or quota capacity',()=>{
 const data=fixture(),before=structuredClone(data),a=adaptMetadata(data);
 assert.equal(a.presence.length,9);assert.equal(a.summary.storedCells,1);
 assert.equal(a.plan.tasks.length,0);assert.equal(a.plan.counts.covered,0);assert.equal(a.plan.counts.gap,0);
 assert.equal(a.plan.liveGate.enabled,false);assert.equal(a.summary.budget.verifiedRemaining,null);
 assert.equal(a.summary.legacy.doneWithoutAnyRowInRange,1);assert.equal(a.plan.universeComplete,false);
 assert.deepEqual(a.plan.legacyDone,before[4].rows[1].done);assert.deepEqual(data,before);
});
test('stale NAV with fresh snapshot and positive ratio remains stale; blacklist retained with unknown cause',()=>{
 const a=adaptMetadata(fixture());
 assert.equal(a.summary.snapshotAgeSeconds,0);assert.equal(a.summary.nav.positiveAndPlausible,1);
 assert.equal(a.summary.nav.storedNAVSourceStale,1);assert.equal(a.summary.nav.verifiedFreshNAV,0);
 assert.equal(a.nav[0].status,'preserved_blacklist');assert.equal(a.nav[0].cause,null);
 assert.equal(a.nav[0].lastCheckedAt,null);assert.equal(a.nav[0].sourceFreshness,'stale');
 assert.deepEqual(a.plan.preservedBlacklistSymbols,['صندوق']);
});
test('source-clock validator rejects invalid Jalali date, missing time and future time',()=>{
 assert.equal(sourceFreshness('1405-07-31','16:00:00',at,24).state,'unknown');
 assert.equal(sourceFreshness('1405-07-08',null,at,24).state,'unknown');
 assert.equal(sourceFreshness('1405-07-11','16:00:00',at,24).state,'future');
 assert.equal(sourceFreshness('1405-07-10','16:00:00',at,24).state,'within_proposed_age');
});
test('truncated, duplicate or out-of-scope metadata rejects before claiming coverage',()=>{
 assert.throws(()=>adaptMetadata(fixture().slice(0,6)),/Complete/);
 const duplicate=fixture();duplicate[1].rows.push({...duplicate[1].rows[0]});assert.throws(()=>adaptMetadata(duplicate),/Duplicate/);
 const outside=fixture();outside[1].rows[0].day='2026-09-29';assert.throws(()=>adaptMetadata(outside),/outside/);
 const missing=fixture();missing[4].rows.pop();assert.throws(()=>adaptMetadata(missing),/Complete legacy/);
 const date=fixture();date[0].rangeStart='2026-02-30';assert.throws(()=>adaptMetadata(date),/date range/);
});
test('actual local file pipeline denies network and escapes CSV formulas without clearing legacy state',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'p02-coverage-'));
 const originalFetch=globalThis.fetch,originalConnect=net.Socket.prototype.connect;
 let attempts=0;const deny=()=>{attempts++;throw new Error('network forbidden');};
 globalThis.fetch=deny;net.Socket.prototype.connect=deny;
 try {
  const data=fixture();data[4].rows[1].done['=malicious']=1;
  const input=path.join(tmp,'input.ndjson');fs.writeFileSync(input,data.map(x=>JSON.stringify(x)).join('\n'));
  const s=run(input,path.join(tmp,'out'));assert.equal(s.planner.requests,0);assert.equal(attempts,0);
  const matrix=fs.readFileSync(path.join(tmp,'out','symbol-date-matrix.csv'),'utf8');assert.match(matrix,/"'=malicious"/);
  assert.equal(s.legacy.doneSymbols,3);
 } finally {globalThis.fetch=originalFetch;net.Socket.prototype.connect=originalConnect;
  const resolved=fs.realpathSync(tmp);if(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('p02-coverage-'))fs.rmSync(resolved,{recursive:true});}
});
