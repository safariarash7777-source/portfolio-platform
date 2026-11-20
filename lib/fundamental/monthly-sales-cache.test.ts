import test from "node:test";
import assert from "node:assert/strict";
import { createMonthlyCache, applySalesThreshold, MonthlySourceFailure } from "./monthly-sales-cache";
import { MONTHLY_SCREEN_FRESH_MS, MONTHLY_SCREEN_RETAIN_MS } from "./monthly-sales-clocks";
import type { MonthlySalesScreen, ScreenRow } from "./monthly-sales-screen";

test("only complete successful values survive a transient refresh, retaining the original clock and binding",async()=>{
  let now=10000, calls=0;
  const value={checkedAt:new Date(now).toISOString(),rows:[1]};
  const read=createMonthlyCache<typeof value>(()=>now);
  const first=()=>{calls++;return Promise.resolve(value);};
  await Promise.all([read("binding-a/month",first),read("binding-a/month",first)]);
  assert.equal(calls,1);
  now+=MONTHLY_SCREEN_FRESH_MS+1;
  const fail=async()=>{throw new MonthlySourceFailure(true);};
  const old=await read("binding-a/month",fail);
  assert.equal(old.readState,"retained");assert.equal(old.snapshot.checkedAt,value.checkedAt);
  await assert.rejects(read("binding-b/month",fail));
  now+=MONTHLY_SCREEN_RETAIN_MS;
  await assert.rejects(read("binding-a/month",fail));
});
test("authorization or malformed-source failure cannot populate first-read cache or reuse previous response",async()=>{
  let now=500;const read=createMonthlyCache(()=>now);
  const fail=async()=>{throw new MonthlySourceFailure(false);};
  await assert.rejects(read("a",fail));
  assert.equal((await read("a",async()=>({checkedAt:new Date(now).toISOString()}))).readState,"fresh");
  now+=MONTHLY_SCREEN_FRESH_MS+1;
  await assert.rejects(read("a",fail));
  await assert.rejects(read("a",async()=>{throw new MonthlySourceFailure(true);}));
});
test("changing the threshold reprojects outcomes consistently without modifying the cached screen or clock",()=>{
  const rows=[50,20,null].map((growth,i)=>({symbol:String(i),eligible:true,industry:null,reason:null,current:null,previous:null,growth,passed:growth===null?null:true} satisfies ScreenRow));
  const base:MonthlySalesScreen={period:"1405-07",previousPeriod:"1404-07",checkedAt:"old",minGrowth:0,rows,coverage:{universe:3,eligible:3,calculable:2,passed:2,excluded:{},universeSource:"",rosterUpdatedAt:null}};
  const projected=applySalesThreshold(base,50);
  assert.deepEqual(projected.rows.map(r=>r.passed),[true,false,null]);
  assert.equal(projected.coverage.passed,1);assert.equal(projected.checkedAt,"old");assert.equal(base.coverage.passed,2);
  assert.equal(base.rows[1].passed,true);
});
