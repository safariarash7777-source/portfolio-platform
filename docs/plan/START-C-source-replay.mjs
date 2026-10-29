/** Offline proof only: no collection, database persistence or live acceptance. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root=resolve(process.argv[2]??'.');
const file=p=>resolve(root,p);
const sha=b=>createHash('sha256').update(b).digest('hex');
const html=readFileSync(file('docs/ops/research-pilot-20261026/foolad/primary/N30.html'));
assert.equal(sha(html),'11c089fae22de79e4986b37677e3ce2af3f594642cff0f546b2bc0feb84c2a62');
const packet=JSON.parse(readFileSync(file('docs/ops/research-pilot-20261026/foolad/stored-source-packet.json'),'utf8'));
const old=packet.packets.flatMap(x=>x.rows).find(x=>x.id===11653);
assert.equal(old.raw.parser_version,2);
assert.equal(old.symbol,'فولاد');
assert.ok(old.source_url.includes('UF9BctCE5jV6HYNuyA8yYA%3d%3d'));
const importAt=p=>import(pathToFileURL(file(p)).href);
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('offline replay forbids network');};
try {
  const {normalizeN30,parseHtmlTables,PARSER_VERSION}=await importAt('relay/codal.mjs');
  assert.equal(PARSER_VERSION,3,'requires the reviewed PR329 interpretation');
  const data=normalizeN30(parseHtmlTables(html.toString('utf8')),{symbol:'فولاد',period_end:'1405-06-31'});
  assert.equal(data.period_total_amount,639418160);
  assert.equal(data.products.length,10);
  const sums=Object.fromEntries(['داخلی','صادراتی','خدمات'].map(m=>[m,data.products.filter(p=>p.market===m).reduce((s,p)=>s+p.sales_amount,0)]));
  assert.deepEqual(sums,{داخلی:432531365,صادراتی:79130673,خدمات:127756122});
  // Virtual interpretation candidate: no claim that PV3 or this ID was persisted.
  const candidate={...old,id:2000000000,captured_at:null,data,source_url:old.source_url.replace(/#pv2$/,'#pv3'),raw:{...old.raw,parser_version:3}};
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://source-replay.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='offline-synthetic-placeholder';
  let reads=0;
  globalThis.fetch=async input=>{
    const u=new URL(String(input));
    assert.equal(u.origin,'https://source-replay.invalid');
    assert.equal(u.pathname,'/rest/v1/codal_reports');
    reads++;
    return Response.json(u.searchParams.get('report_kind')==='eq.ن-۳۰'?[old,candidate]:[]);
  };
  const {readFundamentalsFromSupabase}=await importAt('lib/fundamental/supabase.ts');
  const {buildMonthlySales}=await importAt('lib/core/monthlyReport.ts');
  const result=await readFundamentalsFromSupabase('فولاد');
  assert.equal(result.state,'ready');
  assert.equal(reads,2);
  const monthly=result.data.n30;
  assert.equal(monthly.source.records.length,1);
  assert.equal(monthly.source.records[0].parserVersion,3);
  assert.equal(monthly.source.records[0].capturedAt,null);
  assert.equal(monthly.source.records[0].publishedAt,`${old.raw.date_publish} ${old.raw.time_publish}`.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x06f0)));
  const model=buildMonthlySales(monthly.data);
  assert.equal(model.latestDomesticAmount,432531365);
  assert.equal(model.latestExportAmount,79130673);
  assert.equal(model.priorFY,null);
  assert.equal(model.cumulativePriorSamePoint,null);
  assert.ok(model.rateSeries.every(s=>s.market!=='خدمات'));
  console.log(JSON.stringify({mode:'offline_immutable_source_replay',sourceHtmlSha256:sha(html),originalStoredRow:11653,originalCapturedAt:old.captured_at,virtualPV3Persisted:false,sourcePublishedAt:monthly.source.records[0].publishedAt,sums,total:data.period_total_amount,exportSharePct:model.latestExportSharePct,priorFY:model.priorFY,stubbedReaderCalls:reads,networkCalls:0,codeHashes:Object.fromEntries(['relay/codal.mjs','lib/fundamental/supabase.ts','lib/core/monthlyReport.ts'].map(p=>[p,sha(readFileSync(file(p)))])),limitations:['virtual candidate only; no actual insert or collector cycle','fixture source selection does not establish live admission coverage','no guest capacity or latest financial success proof']} ,null,2));
} finally {globalThis.fetch=originalFetch;}
