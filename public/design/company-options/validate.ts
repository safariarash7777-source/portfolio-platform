// Input/coverage validation for an isolated design dataset; not a production model test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMonthlySales } from "../../../lib/core/monthlyReport";
import { deriveN30 } from "../../../lib/fundamental/calc";
import { withKnownMonthlyQuantities } from "../../../lib/core/monthly-quantity";
import { DATASET_ID, HISTORY, MONTHLY, PERIODS, QUARTER_PRICES, SOURCE, STATES, fundamentalsFor, hasMonthlyGap, monthlyFor, productReports, quarterlyFor } from "./chart-data";
import { parsePrototypeSelection, prototypeComparisonHref, type PrototypeSelection } from "./query-state";
const snapshot=JSON.stringify({MONTHLY,PERIODS,HISTORY});
let checks=0;
function check(name:string,run:()=>void){run();checks++;console.log(`PASS ${name}`);}
check("monthly coverage and shared series",()=>{const m=buildMonthlySales(monthlyFor("ready",1405));assert.equal(m?.reportCount,12);assert.equal(m?.priorFY,1404);assert.equal(m?.rateSeries.length,3);assert.equal(m?.currentMonths[5].amount,116350);assert.equal(m?.currentMonths[5].cumulative,564400);});
check("integrated rate and quantity gaps preserve reported months; fundamental adapter retains real N30",()=>{const reports=monthlyFor("month-gap",1405);const m=buildMonthlySales(reports);assert.equal(m?.currentMonths[3].amount,null);assert.equal(m?.currentMonths[3].cumulative,null);assert.equal(m?.currentMonths[4].cumulative,448050);assert(m?.rateSeries.every(series=>series.points.find(point=>point.monthKey==="1405-04")?.rate===null));assert(hasMonthlyGap(reports.filter(r=>r.fiscal_year===1405)));assert.equal(fundamentalsFor("month-gap",reports).n30?.data.length,5);assert(!hasMonthlyGap(monthlyFor("ready",1405).filter(r=>r.fiscal_year===1405)));});
check("quantity keeps missing calendar slots and declared units for every existing product/market scope",()=>{
  for(const product of ["all","ورق گرم","ورق سرد"])for(const market of ["all","داخلی","صادراتی"]){
    const reports=productReports(monthlyFor("month-gap",1405).filter(r=>r.fiscal_year===1405),product,market);
    const m=buildMonthlySales(reports);assert(m);
    if(!reports.some(r=>r.products.length)){assert.deepEqual(m.prodVsSales,[]);continue;}
    assert(reports.every(r=>r.products.every(p=>p.qty_unit==="تن")));
    assert.deepEqual(m.prodVsSales.map(p=>p.monthKey),["1405-01","1405-02","1405-03","1405-04","1405-05","1405-06"]);
    assert.deepEqual(m.prodVsSales[3],{monthKey:"1405-04",monthLabel:"تیر",production:null,sales:null,unavailableReason:"missing-report"});
    assert.equal(m.prodVsSales[2].unavailableReason,null);assert.equal(m.prodVsSales[4].unavailableReason,null);
    assert.equal(m.reportCount,5);
  }
});
check("fundamental N30 keeps calendar gaps, reported counts and original annual source",()=>{
  for(const fy of [1404,1405]){
    const f=fundamentalsFor("month-gap",monthlyFor("month-gap",fy));assert(f.n30);assert(f.n10);
    const m=deriveN30(f.n30.data.map(withKnownMonthlyQuantities));
    assert.equal(m.months.length,fy===1405?5:6);assert.equal(m.topProductMonths.length,6);assert.equal(m.prodVsSales.length,6);
    if(fy===1405){assert.deepEqual(m.topProductMonths[3],{month:"1405-04",rate:null,salesQty:null,productionQty:null});assert.deepEqual(m.prodVsSales[3],{month:"1405-04",production:null,sales:null});}
    assert.equal(f.n30.source.publishedAt,null);assert.equal(f.n30.source.source_url,null);assert.equal(f.n10.data.period_months,12);
  }
});
check("prior year absent is not a zero comparator",()=>{const m=buildMonthlySales(monthlyFor("no-prior",1405));assert.equal(m?.priorFY,null);assert.equal(m?.priorMonths,null);assert.equal(m?.cumulativePriorSamePoint,null);});
check("quarter revenue is independent; TTM uses four quarters",()=>{const q=quarterlyFor("ready");assert.equal(q.quarters.find(p=>p.label==="Q2 1405")?.revenue,305000);assert.equal(q.ttm.find(p=>p.label==="Q4 1404")?.netProfitTtm,211000);assert.equal(q.peSeries.find(p=>p.label==="Q4 1404")?.pe,QUARTER_PRICES["1404-12-29"]/2110);});
check("broken cumulative chain breaks margin and P/E slots",()=>{const q=quarterlyFor("quarter-gap");for(const label of ["Q2 1404","Q3 1404"]){assert.equal(q.quarters.find(p=>p.label===label)?.netMargin,null);assert.equal(q.peSeries.find(p=>p.label===label)?.pe,null);}assert.equal(q.currentPe,null);assert.equal(q.peSeries.length,q.quarters.length);});
check("product scope never recalculates company totals",()=>{const reports=monthlyFor("ready",1405), product=productReports(reports,"ورق سرد","داخلی");assert(product.every((r,i)=>r.products.length===1&&r.period_total_amount===reports[i].period_total_amount&&r.fy_cumulative_amount===reports[i].fy_cumulative_amount));assert(productReports(reports,"ورق سرد","صادراتی").every(r=>r.products.length===0));});
check("zero and missing flow stay distinct; history has no price gap",()=>{assert.equal(HISTORY[2].netFlow,0);assert.equal(HISTORY[4].netFlow,null);assert(HISTORY.every(p=>p.close!==null));});
check("empty/error never enter chart props as invented values",()=>{for(const state of ["empty","error"] as const){assert.deepEqual(monthlyFor(state,1405),[]);assert.deepEqual(quarterlyFor(state).quarters,[]);assert.equal(quarterlyFor(state).currentPe,null);assert.equal(fundamentalsFor(state,[]).n10,null);}});
check("educational provenance stays unavailable; inputs immutable",()=>{for(const key of ["officialReportId","officialUrl","publishedAt","collectedAt","revision"] as const)assert.equal(SOURCE[key],null);for(const state of STATES){monthlyFor(state,1405);quarterlyFor(state);}assert.equal(JSON.stringify({MONTHLY,PERIODS,HISTORY}),snapshot);assert(Object.isFrozen(MONTHLY[0].products[0]));});
check("both routes load one generated entry and stylesheet",()=>{for(const page of ["decision.html","dossier.html"]){const html=readFileSync(new URL(page,import.meta.url),"utf8");assert(html.includes('./prototype.js'));assert(html.includes('./charts.css'));assert(html.includes('lang="fa" dir="rtl"'));}});
check("both comparison directions preserve non-default selection and effective chart inputs",()=>{
  const selections:PrototypeSelection[]=[
    {state:"quarter-gap",tab:"fundamental",fy:1404,product:"ورق سرد",market:"داخلی",range:4,priceRange:6,query:"گزارش ۱۴۰۴ & صورت مالی",kind:"monthly"},
    {state:"no-prior",tab:"reports",fy:1405,product:"ورق گرم",market:"صادراتی",range:12,priceRange:12,query:"ن-۳۰",kind:"quarterly"},
  ];
  const effective=(s:PrototypeSelection)=>({monthly:productReports(monthlyFor(s.state,s.fy).filter(r=>r.fiscal_year===s.fy),s.product,s.market),quarters:quarterlyFor(s.state).quarters.slice(-s.range),prices:HISTORY.slice(-s.priceRange)});
  for(const initial of selections)for(const view of ["decision","dossier"] as const){
    const target=new URL(prototypeComparisonHref(view,initial),"https://design.invalid/design/company-options/decision.html");
    assert.equal(target.pathname,`/design/company-options/${view}.html`);
    const restored=parsePrototypeSelection(target.search,target.hash);
    assert.deepEqual(restored,initial);
    assert.deepEqual(effective(restored),effective(initial));
    const back=new URL(prototypeComparisonHref(view==="decision"?"dossier":"decision",restored),target);
    assert.deepEqual(parsePrototypeSelection(back.search,back.hash),initial);
  }
});
check("invalid query choices fall back without numeric coercion or arbitrary scopes",()=>{
  const invalid=new URLSearchParams({state:"invalid",fy:"1404.0",product:"unknown",market:"unknown",range:"Infinity",priceRange:"0",kind:"unknown"});
  assert.deepEqual(parsePrototypeSelection(invalid.toString(),"#invalid"),parsePrototypeSelection("",""));
  for(const fy of ["NaN","1406","-1404","1404x"])assert.equal(parsePrototypeSelection(`fy=${fy}`,"#overview").fy,1405);
});
check("encoded Persian search stays bounded and identical across comparison links",()=>{
  const p=new URLSearchParams({query:"الف 🟡 & # ? ".repeat(30)}),s=parsePrototypeSelection(p.toString(),"#reports");
  assert.equal(Array.from(s.query).length,80);
  const href=new URL(prototypeComparisonHref("dossier",s),"https://design.invalid/design/company-options/decision.html");
  assert.deepEqual(parsePrototypeSelection(href.search,href.hash),s);
});
console.log(JSON.stringify({dataset:DATASET_ID,checks,uiAcceptance:"NOT_RUN",browserAudit:"PENDING_CURRENT_VERSION"}));
