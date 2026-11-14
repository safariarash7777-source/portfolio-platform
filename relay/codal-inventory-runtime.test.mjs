import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL='https://storage.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='offline';
const {refreshCoverage,archiveStatus}=await import('./codal-archive.mjs');
const originalFetch=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=originalFetch;});
test('automatic archive inventory includes more than 300 issuers and retains last complete evidence on failure',async()=>{
 const stocks=Array.from({length:350},(_,i)=>({id:`نماد${i}س`,value:0}));
 globalThis.fetch=async input=>{
  const u=new URL(input);assert.equal(u.hostname,'storage.invalid');
  if(u.pathname.endsWith('/ir_market_snapshots'))return Response.json([{payload:{stocks}}]);
  assert.equal(u.pathname,'/rest/v1/codal_reports');
  return Response.json(u.searchParams.has('id')?[]:[{id:3,symbol:stocks[349].id,report_kind:'ن-۱۰'}]);
 };
 await refreshCoverage();
 assert.equal(archiveStatus.coverage.universeSize,350);
 assert.equal(archiveStatus.coverage.withoutReports,349);
 assert.equal(archiveStatus.coverage.universeFinancial,1);
 assert.equal(archiveStatus.coverage.error,null);
 const last=structuredClone(archiveStatus.coverage);
 globalThis.fetch=async()=>new Response(null,{status:503});
 await refreshCoverage();
 assert.equal(archiveStatus.coverage.lastChecked,last.lastChecked);
 assert.equal(archiveStatus.coverage.universeSize,350);
 assert.equal(archiveStatus.coverage.error,'inventory_read_failed');
});
test('missing market snapshot is unknown, not a successful zero-company census',async()=>{
 const last=archiveStatus.coverage.lastChecked;
 globalThis.fetch=async()=>Response.json([]);
 await refreshCoverage();
 assert.equal(archiveStatus.coverage.lastChecked,last);
 assert.equal(archiveStatus.coverage.error,'inventory_read_failed');
});
