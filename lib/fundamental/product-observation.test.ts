import assert from "node:assert/strict";
import test from "node:test";
import prior from "./folad-reviewed-prior.json";
import { reviewedProductRows } from "./reviewed-product-rows";
import { changes, observation, type ReportRecord } from "./product-observation";
import type { CodalN30Data, N30ProductRow } from "./types";

const product = prior.rows.find(row=>row.product==="محصولات گرم" && row.market==="داخلی")!;
const row:N30ProductRow = { product_name:product.product,market:"داخلی",sales_amount:product.amount,
  sales_qty:product.quantity,sales_rate:null,production_qty:null };
const report:CodalN30Data = { symbol:prior.symbol,report_kind:"ن-۳۰",period_end:prior.period,
  fiscal_year:1404,period_total_amount:prior.total,fy_cumulative_amount:null,products:[row] };
const record = {id:prior.record,sourceUrl:prior.source,financialPeriodEnd:prior.period} as ReportRecord;
test("workbook observation requires the selected revision, total and unambiguous source row",()=>{
  const reviewed=reviewedProductRows(report,record);
  assert.ok(reviewed);
  const point=observation(reviewed.report,JSON.stringify([product.product,product.market]),record);
  assert.equal(point?.qty,262);
  assert.equal(point?.unit,"هزار تن");
  assert.equal(point?.amount,99450950);
  for (const wrong of [{id:7},{sourceUrl:null},{financialPeriodEnd:"1404-08-30"}]) {
    assert.equal(reviewedProductRows(report,{...record,...wrong}),null);
  }
  assert.equal(reviewedProductRows({...report,products:[row,{...row}]},record),null);
  assert.equal(reviewedProductRows({...report,products:[{...row,market:"صادراتی",market_basis:"section_header"}]},record),null);
  assert.equal(reviewedProductRows({...report,period_total_amount:0},record),null);
});
test("symmetric price and volume effects sum to the observed sales difference, with unknowns preserved",()=>{
  const point=(amount:number,qty:number)=>({amount,qty,rate:amount*1e6/qty,unit:"هزار تن"});
  const prior=point(99450950,262),current=point(258085416,267);
  const change=changes(current,prior)!;
  assert.equal(Math.round(change.quantityEffect!),3365490);
  assert.equal(Math.round(change.rateEffect!),155268976);
  assert.equal(Math.round(change.rateEffect!+change.quantityEffect!),change.delta);
  assert.equal(changes({...current,unit:"تن"},prior)?.quantityEffect,null);
  assert.equal(changes(null,prior),null);
});
