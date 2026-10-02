// Full metadata adapter for the unchanged PR198 offline planner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildCoveragePlan, metadataCsv } from './coverage-plan-core.mjs';
import { navSourceAt } from '../../relay/nav-quality.mjs';
const mainId = s => typeof s==='string' && s===s.trim() && s.length>0 && s.length<=80;
const stamp = s => typeof s==='string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s));
const count = x => Number.isSafeInteger(x) && x>=0;
const hash = x => createHash('sha256').update(x).digest('hex');
export function sourceFreshness(date,time,observedAt,maxAgeHours) {
 // Reuse 195's existing source-clock validator; no second date/financial parser.
 const at=navSourceAt(date,time);
 if(at==null||!stamp(observedAt)) return {state:'unknown',sourceAt:null,ageHours:null};
 const sourceAt=new Date(at).toISOString();
 const ageHours=(Date.parse(observedAt)-at)/3600000;
 return {state:ageHours<0?'future':ageHours>maxAgeHours?'stale':'within_proposed_age',sourceAt,ageHours};
}
export function adaptMetadata(blocks) {
 const expected=['header','historyCells','historyUniverse','snapshotUniverse','state','families','budgetState'];
 if(!Array.isArray(blocks)||blocks.length!==expected.length||blocks.some((b,i)=>b.kind!==expected[i])) throw new Error('Complete ordered export required');
 const [header,cells,history,snapshot,state,families,budget]=blocks;
 if(header.readOnly!=='on'||!stamp(header.observedAt)) throw new Error('Read-only timestamp required');
 const days=[];
 for(let d=new Date(header.rangeStart+'T00:00:00Z'),end=new Date(header.rangeEnd+'T00:00:00Z');d<=end;d.setUTCDate(d.getUTCDate()+1)) {
  days.push(d.toISOString().slice(0,10));if(days.length>366) throw new Error('Bounded date range required');
 }
 if(!days.length||days[0]!==header.rangeStart||days.at(-1)!==header.rangeEnd) throw new Error('Valid bounded date range required');
 for(const b of [cells,history,snapshot,state]) if(!Array.isArray(b.rows)) throw new Error('Missing metadata rows');
 if(cells.rows.length>200000||history.rows.length>5000||snapshot.rows.length>5000) throw new Error('Bounded metadata rows required');
 for(const r of [...cells.rows,...history.rows]) if(!mainId(r.symbol)||!count(r.row_count)||r.row_count===0) throw new Error('Invalid history metadata');
 if(snapshot.rows.some(r=>!mainId(r.symbol)||!stamp(r.updated_at))) throw new Error('Invalid snapshot identities/timestamps');
 const byKey=new Map(),sourceKeys=new Set();
 for(const r of cells.rows) {
  if(!days.includes(r.day)) throw new Error('History cell outside complete-read scope');
  const sourceKey=JSON.stringify([r.symbol,r.day,r.source]);
  if(sourceKeys.has(sourceKey)) throw new Error('Duplicate exported history group');sourceKeys.add(sourceKey);
  const k=JSON.stringify([r.symbol,r.day]);if(!byKey.has(k))byKey.set(k,[]);byKey.get(k).push(r);
 }
 const byMember=new Map();
 for(const r of snapshot.rows) {const k=JSON.stringify([r.section,r.symbol]);if(byMember.has(k)) throw new Error('Duplicate snapshot identity');byMember.set(k,r);}
 const backfill=state.rows.find(r=>r.key==='candle_backfill_state');
 const blacklist=state.rows.find(r=>r.key==='nav_blacklist');
 if(!backfill||!blacklist||!Array.isArray(blacklist.blacklist)||!backfill.done||typeof backfill.done!=='object'||Array.isArray(backfill.done)) throw new Error('Complete legacy/blacklist metadata required');
 const doneSymbols=Object.keys(backfill.done);
 if(blacklist.blacklist.some(s=>!mainId(s))||doneSymbols.some(s=>!mainId(s))) throw new Error('Invalid persisted identities');
 const current=snapshot.rows.filter(r=>['stocks','funds'].includes(r.section));
 const ids=[...new Set([...current.map(r=>r.symbol),...history.rows.map(r=>r.symbol),...doneSymbols])].sort();
 const sourceRef='liara-ro-export:'+header.observedAt;
 const proof={verified:true,sourceRef,observedAt:header.observedAt};
 const input={observedAt:header.observedAt,dataClass:'OBSERVED_METADATA',days,
  // Complete DB export is not proof of the official historic trading universe.
  universeComplete:false,symbols:ids.map(id=>({id})),calendar:[],
  cells:[...byKey].map(([k,rows])=>({symbol:JSON.parse(k)[0],day:JSON.parse(k)[1],...proof,
   present:true,completeRead:true,
   // Source label/candle marker does not record the actual requested series type.
   seriesType:null,rowRef:rows.map(r=>`${r.source}:${r.first_id}..${r.last_id}`).join('|')})),
  funds:snapshot.rows.filter(r=>r.section==='funds').map(r=>({id:r.symbol,
   membership:{...proof,cs_id:Number(r.industry_id),active:null},
   nav:{...proof,valid:false,sourceAt:null,unit:r.unit,
    positiveVerified:r.nav_positive===true,ratioPlausibleVerified:r.nav_ratio_plausible===true}})),
  blacklist:[...new Set(blacklist.blacklist)].map(symbol=>({symbol,cause:null,lastCheckedAt:null})),
  initialState:{done:backfill.done},maxAttempts:1,dailyRequestCap:null};
 const plan=buildCoveragePlan(input);
 const presence=plan.matrix.map(c=> {
  const rows=byKey.get(JSON.stringify([c.symbol,c.day]))??[];
  return {...c,physicalStatus:rows.length?'stored_rows_series_unverified':'absent_trade_unknown',
   storedRows:rows.reduce((n,r)=>n+r.row_count,0),sources:rows.map(r=>r.source).sort().join('|'),
   firstCapturedAt:rows.map(r=>r.first_captured_at).sort()[0]??null,
   lastCapturedAt:rows.map(r=>r.last_captured_at).sort().at(-1)??null,
   currentMember:current.some(r=>r.symbol===c.symbol),legacyDone:Object.hasOwn(backfill.done,c.symbol)};
 });
 const nav=plan.nav.map(n=> {
  const row=snapshot.rows.find(r=>r.section==='funds'&&r.symbol===n.symbol);
  const freshness=sourceFreshness(row.nav_date,row.nav_time,header.observedAt,24);
  return {...n,sourceFreshness:freshness.state,sourceAt:freshness.sourceAt,sourceAgeHours:freshness.ageHours,navPresent:row.nav_present,navPositive:row.nav_positive,
   ratioPlausible:row.nav_ratio_plausible,storedUnit:row.unit,providerNAVDate:row.nav_date,
   providerNAVTime:row.nav_time,blacklistSnapshotAt:blacklist.updated_at,
   pendingFailCount:blacklist.failCounts?.[n.symbol]??null};
 });
 const perDay=days.map(day=>({day,storedSymbols:presence.filter(c=>c.day===day&&c.storedRows>0).length,
  storedCurrentSymbols:presence.filter(c=>c.day===day&&c.currentMember&&c.storedRows>0).length,
  storedRows:presence.filter(c=>c.day===day).reduce((n,c)=>n+c.storedRows,0)}));
 const snapshotAt=snapshot.rows[0]?.updated_at??null;
 const summary={schemaVersion:'p02-coverage.v1',observedAt:header.observedAt,range:{start:header.rangeStart,end:header.rangeEnd},
  exportComplete:true,officialHistoricalUniverseKnown:false,scopeSymbols:ids.length,currentSymbols:new Set(current.map(r=>r.symbol)).size,
  snapshotRows:snapshot.rows.length,snapshotAt,snapshotAgeSeconds:snapshotAt?(Date.parse(header.observedAt)-Date.parse(snapshotAt))/1000:null,
  familyCounts:Object.fromEntries(['stocks','funds','gold','currency','crypto','options','imeCertificates','commodities'].map(k=>[k,snapshot.rows.filter(r=>r.section===k).length])),
  familyClocks:Object.fromEntries([...new Set(snapshot.rows.map(r=>r.section))].map(k=>[k,{
   withSourceDateAndTime:snapshot.rows.filter(r=>r.section===k&&r.source_date&&r.source_time).length,
   withoutSourceDateOrTime:snapshot.rows.filter(r=>r.section===k&&!(r.source_date&&r.source_time)).length}])),
  perDay,classification:plan.counts,storedCells:presence.filter(c=>c.storedRows>0).length,
  unitCounts:Object.fromEntries([...new Set(snapshot.rows.map(r=>r.unit??'UNKNOWN'))].map(u=>[u,snapshot.rows.filter(r=>(r.unit??'UNKNOWN')===u).length])),
  blacklist:{storedEntries:blacklist.blacklist.length,uniqueEntries:new Set(blacklist.blacklist).size,
   currentFundsBlacklisted:nav.filter(r=>r.status==='preserved_blacklist').length,updatedAt:blacklist.updated_at,
   perSymbolCauseKnown:false,perSymbolLastCheckedKnown:false,preserved:true},
  nav:{currentFunds:nav.length,withStoredNAV:nav.filter(r=>r.navPresent).length,
   positiveAndPlausible:nav.filter(r=>r.navPositive&&r.ratioPlausible).length,verifiedFreshNAV:0,
   storedNAVSourceStale:nav.filter(r=>r.navPresent&&r.sourceFreshness==='stale').length,
   storedNAVSourceUnknown:nav.filter(r=>r.navPresent&&r.sourceFreshness==='unknown').length,
   staleAgeMinHours:nav.some(r=>r.sourceFreshness==='stale')?Math.min(...nav.filter(r=>r.sourceFreshness==='stale').map(r=>r.sourceAgeHours)):null,
   note:'Snapshot age and positive ratio do not prove provider NAV freshness/capability.'},
  legacy:{doneSymbols:doneSymbols.length,updatedAt:backfill.updated_at,reqDate:backfill.reqDate,
   doneWithAnyRowInRange:doneSymbols.filter(s=>cells.rows.some(c=>c.symbol===s)).length,
   doneWithoutAnyRowInRange:doneSymbols.filter(s=>!cells.rows.some(c=>c.symbol===s)).length,
   completionNotRangeProof:true},
  budget:{tablePresent:header.budgetTablePresent,functions:header.budgetFunctions,state:budget,
   priorUsage:null,supplierReset:null,verifiedRemaining:null,completionETA:null},
  planner:{digest:plan.planDigest,requests:plan.tasks.length,liveGate:plan.liveGate},families};
 return {input,plan,presence,nav,summary,snapshot:snapshot.rows,blacklist:input.blacklist};
}
export function run(inputPath,outPath) {
 const content=fs.readFileSync(inputPath,'utf8');
 if(Buffer.byteLength(content)>32*1024*1024) throw new Error('Export too large');
 const data=adaptMetadata(content.trim().split(/\r?\n/).map(JSON.parse));
 fs.mkdirSync(outPath,{recursive:true});
 data.summary.exportSHA256=hash(content);
 fs.writeFileSync(path.join(outPath,'summary.json'),JSON.stringify(data.summary,null,2)+'\n');
 fs.writeFileSync(path.join(outPath,'symbol-date-matrix.csv'),metadataCsv(data.presence,
  ['symbol','day','physicalStatus','storedRows','sources','currentMember','legacyDone','status','reason','existingRowRef','firstCapturedAt','lastCapturedAt']));
 fs.writeFileSync(path.join(outPath,'nav-matrix.csv'),metadataCsv(data.nav,
  ['symbol','status','navPresent','navPositive','ratioPlausible','storedUnit','providerNAVDate','providerNAVTime','sourceFreshness','sourceAt','sourceAgeHours','cause','lastCheckedAt','blacklistSnapshotAt','pendingFailCount']));
 fs.writeFileSync(path.join(outPath,'instrument-matrix.csv'),metadataCsv(data.snapshot,
  ['section','symbol','instrument_type','industry_id','unit','source_date','source_time','updated_at','fetched_at']));
 fs.writeFileSync(path.join(outPath,'preserved-blacklist.csv'),metadataCsv(data.blacklist,['symbol','cause','lastCheckedAt']));
 return data.summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 if(process.argv.length!==4) throw new Error('Use local metadata NDJSON and output directory; no live/simulation mode');
 const s=run(process.argv[2],process.argv[3]);
 console.log(JSON.stringify({scopeSymbols:s.scopeSymbols,counts:s.classification,storedCells:s.storedCells,nav:s.nav,blacklist:s.blacklist,perDay:s.perDay}));
}
