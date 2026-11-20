import { test } from "node:test";
import assert from "node:assert/strict";
import { jalaliYmdToGregorian } from "../core/jalali";
import { monthlySalesScreen, salesHistory, type SalesFiling } from "./monthly-sales-screen";

const stocks=[{id:"الف",industryId:27},{id:"ب",industryId:57},{id:"ج",industryId:13}];
function filing(period:string,id:number,amount:number):SalesFiling {
 const dt=period+"-30";
 return {id,symbol:"الف",title:"گزارش دوره ۱ ماهه منتهی به "+dt,source_url:"https://codal.ir/Reports/Decision.aspx?LetterSerial="+id+"&let=58&rt=0",storedPeriod:jalaliYmdToGregorian(dt)!,reportPeriod:dt,reportSymbol:"الف",unit:"میلیون ریال",amount,measure:null,months:"1",parser:"2",publicationDate:"1405/08/05",publicationTime:"11:00:00",captured_at:"2026-11-01T01:00:00Z"};
}
const now=filing("1405-07",1,150), prior=filing("1404-07",2,100);
function run(rows:SalesFiling[], notices:{symbol:string;title:string;link:string}[] = []) {
 return monthlySalesScreen("1405-07",50,stocks,rows,notices,"now",null);
}
test("compares selected single-month sales and enumerates eligible issuers missing all filings",()=>{
 const out=run([prior,now,{...now,id:8}]); const row=out.rows.find(x=>x.symbol==="الف")!;
 assert.equal(row.growth,50);assert.equal(row.passed,true);assert.equal(row.current?.reportId,8);
 assert.deepEqual([out.coverage.universe,out.coverage.eligible,out.coverage.calculable,out.coverage.passed],[3,2,1,1]);
 assert.equal(out.rows.find(x=>x.symbol==="ب")!.eligible,false);
});
test("published amendment wins, pending amendment blocks stale original, identical revision conflict stays ambiguous",()=>{
 const revision={...now,id:4,source_url:now.source_url.replace("Serial=1","Serial=4"),title:now.title+" (اصلاحیه)",amount:90};
 const row=run([now,prior,revision]).rows.find(x=>x.symbol==="الف")!;
 assert.equal(row.growth,-10);assert.equal(row.current?.amendment,true);assert.equal(row.passed,false);
 assert.equal(run([now,prior],[{title:revision.title,symbol:"الف",link:revision.source_url}]).coverage.calculable,0);
 assert.equal(run([now,prior,{...now,id:5,amount:20}]).coverage.calculable,0);
});
test("zero denominator, wrong unit, period, missing month amount, and bank income are never calculated",()=>{
 for(const invalid of [{...prior,amount:0},{...prior,unit:"ریال"},{...prior,months:"6"},{...prior,storedPeriod:"2024-01-01"},{...prior,amount:null},{...prior,measure:"issued_premium"}]) {
  assert.equal(run([now,invalid]).coverage.calculable,0);
 }
 assert.equal(run([{...prior,amount:10},{...now,amount:0}]).rows.find(x=>x.symbol==="الف")!.growth,-100);
});
test("history shares revision selection and does not fill missing months",()=>{
 const {points}=salesHistory("1405-07","الف",[now,prior],[]);assert.deepEqual(points.map(p=>p.period),["1405-07"]);
});

test("only the selected unpriced-unit filing is eligible for review; missing or ambiguous origins stay closed",()=>{
 const old={...prior,unit:null};
 const review=run([now,old]).rows.find(x=>x.symbol==="الف")!.unitReview;
 assert.equal(review?.[0]?.reportId,old.id);
 assert.equal(Object.hasOwn(review![0],"amount"),false);
 const n={symbol:"الف",title:old.title+" (اصلاحیه)",link:old.source_url.replace("Serial=2","Serial=9")};
 assert.equal(run([now,old],[n]).rows.find(x=>x.symbol==="الف")!.unitReview,undefined);
 assert.equal(run([now,{...old,unit:"ریال"}]).rows.find(x=>x.symbol==="الف")!.unitReview,undefined);
 assert.equal(run([now,{...old,storedPeriod:"2020-01-01"}]).rows.find(x=>x.symbol==="الف")!.unitReview,undefined);
});
test("outside-board filings and notices count once, separately from the roster",()=>{
 const external={...now,symbol:"سایر",reportSymbol:"سایر"};
 const out=run([now,prior,external],[{symbol:"سایر",title:now.title,link:now.source_url}]);
 assert.equal(out.coverage.outsideRoster,1); assert.equal(out.coverage.universe,3);
});
test("outside population applies source and same-month rules independently, including a notice-only issuer",()=>{
 const issuer=(r:SalesFiling,symbol:string)=>({...r,symbol,reportSymbol:symbol});
 const rows=[now,prior,issuer(now,"سایر"),issuer(prior,"سایر"),issuer(prior,"فقط‌قدیم")];
 const notices=[{symbol:"تازه",title:now.title,link:now.source_url},{symbol:"سایر",title:now.title,link:now.source_url}];
 const outside=monthlySalesScreen("1405-07",50,stocks,rows,notices,"now",null,"reported-outside");
 assert.equal(outside.universeKind,"reported-outside");
 assert.deepEqual([outside.coverage.universe,outside.coverage.eligible,outside.coverage.calculable,outside.coverage.passed],[2,2,1,1]);
 assert.deepEqual(outside.rows.map(r=>[r.symbol,r.growth]),[["سایر",50],["تازه",null]]);
 assert.equal(outside.rows[0].current?.sourceUrl,now.source_url);
 assert.equal(outside.rows.every(r=>r.industry===null),true);
 const board=run(rows,notices);
 assert.equal(board.coverage.outsideRoster,2); assert.equal(board.coverage.universe,3);
 assert.equal(board.rows.some(r=>outside.rows.some(x=>x.symbol===r.symbol)),false);
});
