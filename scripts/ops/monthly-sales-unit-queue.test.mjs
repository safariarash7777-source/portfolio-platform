import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runQueue } from "./monthly-sales-unit-queue.mjs";
const items=[2,1,3,4].map(id=>({symbol:"س"+id,reportId:id,periodEnd:"1404-07-30",amendment:false,sourceUrl:"https://codal.ir/Reports/Decision.aspx?LetterSerial="+id+"&rt=0&let=58"}));
const screen={period:"1405-07",previousPeriod:"1404-07",checkedAt:"today",rows:items.map(item=>({symbol:item.symbol,eligible:true,unitReview:[item]}))};
test("offline inventory, bounded progress, failure and interrupted intent resume without replay",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"source-unit-queue-"));
  const attempted=[];
  const reader={current:async()=>screen,checkHold:async()=>{},verify:async item=>{
    attempted.push(item.reportId);
    if(item.reportId===2) throw Error("timeout");
    return {status:"verified_dry_run"};
  }};
  try {
    assert.equal((await runQueue({screen,directory})).pending,4);
    const first=await runQueue({screen,directory,limit:3,reader});
    assert.deepEqual(attempted,[1,2]);assert.equal(first.failed,1);assert.equal(first.verified,1);
    const record=JSON.parse(await readFile(join(directory,"2.result.json"),"utf8"));
    assert.equal(record.reason,"verification_incomplete");
    await writeFile(join(directory,"3.intent.json"),JSON.stringify({item:items.find(x=>x.reportId===3)}));
    const next=await runQueue({screen,directory,limit:3,reader});
    assert.deepEqual(attempted,[1,2,4]);assert.equal(next.uncertain,1);assert.equal(next.verified,2);assert.equal(next.pending,0);
    await assert.rejects(runQueue({screen,directory,limit:4,reader}));
  } finally { await rm(directory,{recursive:true}); }
});
