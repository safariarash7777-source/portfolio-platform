import {test} from "node:test";
import assert from "node:assert/strict";
import {valuePositions,snapshotValueChange} from "./valuation";
import {buildHoldingsView} from "./view";
import type {HoldingPosition} from "./contracts";
const now=new Date("2026-09-30T12:00:00Z");
const p:HoldingPosition={positionKey:"p1",symbol:"فملی",manualLabel:null,assetClass:"equity_ir",qty:2,unit:"هزار سهم",costBasis:null,asOf:"2026-09-30"};
const rows=[{symbol:"فملی",close:1000,last_price:null,trade_date:"2026-09-30",source:"BrsApi"}];
test("valuation without a target uses the same unit-aware engine as comparison",()=>{
  const v=valuePositions([p],rows,now);assert.equal(v.totalValue,200000);
  const view=buildHoldingsView({holdings:{id:"h",version:1,positions:[p]},storedTarget:{id:"t",version:1,referenceVersionId:null,allocations:[{asset:"سهام ایران",pct:100}]},priceRows:rows,now,maxPriceAgeDays:3,maxPriceFutureDays:0});
  assert.equal(view.totalValue,v.totalValue);
});
test("one unpriced manual item makes total and weights unknown, keeping the subtotal",()=>{
  const manual={...p,positionKey:"m",symbol:null,manualLabel:"ملک",unit:"متر"};
  const v=valuePositions([p,manual],rows,now);assert.equal(v.totalValue,null);assert.equal(v.subtotal,200000);assert.ok(v.positions.every(x=>x.weightPct===null));
});
test("invalid quantities, absent source, stale prices and wrong units cannot produce wealth",()=>{
  for (const pos of [{...p,qty:NaN},{...p,qty:Infinity},{...p,unit:"گرم"}]) assert.equal(valuePositions([pos],rows,now).totalValue,null);
  for (const row of [{...rows[0],source:"unknown"},{...rows[0],trade_date:"2026-01-01"},{...rows[0],trade_date:"2100-01-01"}]) assert.equal(valuePositions([p],[row],now).totalValue,null);
});
test("legacy snapshots and one or no endpoint do not invent a return",()=>{
  for(const snapshots of [[],[{as_of:"2026-09-01",value:0}],[{as_of:"2026-09-01",value:0},{as_of:"2026-09-30",value:100}]]) assert.equal(snapshotValueChange(snapshots),null);
  const change=snapshotValueChange([{as_of:"2026-09-01",value:0,source:"verified",fullCoverage:true,valuationValid:true},{as_of:"2026-09-30",value:100,source:"verified",fullCoverage:true,valuationValid:true}]);
  assert.equal(change?.change,100);assert.ok(!("returnPct" in change!));assert.ok(!("profit" in change!));
});
