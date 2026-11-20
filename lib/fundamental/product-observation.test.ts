import assert from "node:assert/strict";
import test from "node:test";
import prior from "./folad-reviewed-prior.json";
import { reviewedProductRows } from "./reviewed-product-rows";
import { changes, companyComparisonSeed, observation, type ReportRecord } from "./product-observation";
import { FOOLAD_HOT_DOMESTIC_KEY, FOOLAD_HOT_DOMESTIC_RATES } from "./foolad-rate-evidence";
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

test("deep links require an exact known product, observed month and a supported comparison mode", () => {
  const reviewed = reviewedProductRows(report, record)!;
  const f = { symbol: prior.symbol, n10: null, n30: { data: [report], source: { title: "", source_url: prior.source, verified: false } },
    reviewedProductReports: [reviewed] };
  const key = JSON.stringify([product.product, product.market]);
  const q = { product: key, month: "1404-07", compare: "year" } as const;
  assert.deepEqual(companyComparisonSeed(f, q), q);
  assert.deepEqual(companyComparisonSeed(f, {...q, compare: "previous"}), {...q, compare:"previous"});
  for (const bad of [{...q,product:[key,key]}, {...q,month:["1404-07"]}, {...q,compare:["year"]},
    {...q,product:"<img src=x>"}, {...q,product:JSON.stringify([product.product,"صادراتی"])},
    {...q,month:"1404-08"}, {...q,month:"1404-7"}, {...q,month:"۱۴۰۴-۰۷"}, {...q,compare:"quarter"}, {product:key}]) {
    assert.equal(companyComparisonSeed(f,bad), null);
  }
  assert.equal(companyComparisonSeed({...f,n30:null},q),null);
});

test("reported P5 rate has its own exact source binding; implied rate uses reported amount and quantity", () => {
  const reviewed = reviewedProductRows(report, record)!;
  const exact = observation(reviewed.report, FOOLAD_HOT_DOMESTIC_KEY, record)!;
  assert.equal(exact.reportedRate?.rate,379583778626);
  assert.equal(exact.reportedRate?.sha256,prior.sha256);
  assert.equal(exact.rate,99450950e6/262);
  assert.notEqual(exact.rate,exact.reportedRate?.rate);
  assert.equal(observation(reviewed.report, FOOLAD_HOT_DOMESTIC_KEY, {...record,id:7})?.reportedRate,null);
  assert.equal(observation({...reviewed.report,symbol:"other"}, FOOLAD_HOT_DOMESTIC_KEY, record)?.reportedRate,null);
  assert.equal(observation({...reviewed.report,products:reviewed.report.products.map(row=>({...row,sales_amount:999}))}, FOOLAD_HOT_DOMESTIC_KEY, record)?.reportedRate,null);
});

test("current workbook restores an omitted quantity but never overrides disagreement or ambiguous rows", () => {
  const [cell] = FOOLAD_HOT_DOMESTIC_RATES;
  const current = {...report, period_end:cell.period, unit:"میلیون ریال", products:[
    {...row,market_basis:"section_header" as const,sales_amount:cell.amount,sales_qty:null,sales_rate:null},
  ]};
  const provenance = {...record,id:cell.id,sourceUrl:cell.source,financialPeriodEnd:cell.period};
  const shown=observation(current,FOOLAD_HOT_DOMESTIC_KEY,provenance)!;
  assert.equal(shown.qty,267);
  assert.equal(shown.unit,"هزار تن");
  assert.equal(shown.reportedRate?.rate,966612044944);
  assert.equal(shown.rate,258085416e6/267);
  for (const bad of [{sales_qty:268},{qty_unit:"تن"},{market_basis:"unknown" as const}]) {
    assert.equal(observation({...current,products:[{...current.products[0],...bad}]},FOOLAD_HOT_DOMESTIC_KEY,provenance)?.reportedRate??null,null);
  }
  assert.equal(observation({...current,products:[...current.products,...current.products]},FOOLAD_HOT_DOMESTIC_KEY,provenance),null);
});
