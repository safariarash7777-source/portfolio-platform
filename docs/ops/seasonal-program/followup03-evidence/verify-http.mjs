import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const base='http://127.0.0.1:15902',fixture='http://127.0.0.1:15903',evidence='docs/ops/seasonal-program/followup03-evidence';
const records=[];
const clock=offset=>writeFile(`${evidence}/clock.txt`,String(offset));
const control=query=>fetch(`${fixture}/control?${query}`).then(r=>r.json());
async function market(label){const at=performance.now();const res=await fetch(`${base}/api/market?diag=1`);const body=await res.json();const record={label,status:res.status,ms:+(performance.now()-at).toFixed(2),stocks:body.ir?.stocks.length??0,funds:body.ir?.funds.length??0,crypto:body.crypto.length,partial:body.partial,availability:body.availability,irStamp:body.ir?.fetchedAt??null,globalStamp:body.fetchedAt,diagError:body.irDiag?.error??null};records.push(record);return {record,body};}
await control('db=ready&world=slow&analytics=ready&pageMs=40');await clock(0);
const slow=await market('world_slow_iran_healthy');assert.equal(slow.record.stocks,760);assert.equal(slow.record.funds,333);assert.equal(slow.record.partial,true);assert.ok(slow.record.ms<2500);assert.equal(slow.body.ir.stocks[0].unit,'toman');assert.equal(slow.body.ir.funds[0].nav,null);
await control('world=ready');await clock(600001);const ready=await market('both_healthy');assert.equal(ready.record.crypto,1);assert.equal(ready.record.partial,false);
const stamp=ready.record;
await control('db=error&world=error');await clock(1200002);const stale=await market('both_failed_complete_cache_retained');assert.equal(stale.record.stocks,760);assert.equal(stale.record.crypto,1);assert.equal(stale.record.availability.iran.state,'stale');assert.equal(stale.record.availability.global.state,'stale');assert.equal(stale.record.irStamp,stamp.irStamp);assert.equal(stale.record.globalStamp,stamp.globalStamp);
await control('db=hang&world=ready');await clock(1300003);const hung=await market('db_hang_with_previous_complete_cache');assert.equal(hung.record.stocks,760);assert.ok(hung.record.ms<5500);
await control('db=ready&world=hang');await clock(1900004);
const start=performance.now(),response=await fetch(`${base}/market`,{headers:{"User-Agent":"Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36"}}),reader=response.body.getReader(),decoder=new TextDecoder();let html='',firstTitle=null,doneAt=null;
while(true){const {value,done}=await reader.read();if(done){doneAt=performance.now()-start;break;}html+=decoder.decode(value,{stream:true});if(firstTitle===null&&html.includes('نمای کلان بازار'))firstTitle=performance.now()-start;}
console.log(JSON.stringify({firstTitle,doneAt,status:response.status,errorText:html.includes('منبع جهانی اکنون پاسخ کامل نداد')}));assert.equal(response.status,200);assert.ok(firstTitle<1500);assert.ok(html.includes('منبع جهانی اکنون پاسخ کامل نداد'));
records.push({label:'SSR_progressive_world_hang',status:response.status,firstIranTitleMs:+firstTitle.toFixed(2),fullBodyMs:+doneAt.toFixed(2),sourceErrorRendered:true});
await control('db=ready&world=ready');
const bad=await fetch(`${base}/api/data/analytics?kind=holdings`);assert.equal(bad.status,400);records.push({label:'private_or_unknown_kind_rejected',status:bad.status});
await writeFile(`${evidence}/http-result.json`,JSON.stringify({environment:'synthetic-production-build-local',source:'full row counts from read-only metadata; synthetic contents',records},null,2)+'\n');
console.log(JSON.stringify(records));
