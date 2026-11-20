import assert from "node:assert/strict";
import test from "node:test";
import { jalaliYmdToGregorian } from "../core/jalali";
import { projectMonthlyCohort, type CohortBatch } from "./monthly-cohort";
import type { CodalRow } from "./supabase";
import type { CodalN30Data } from "./types";

const issuer = { id: "issuer-stable-1", symbol: "نمونه یک" };
const other = { id: "issuer-stable-2", symbol: "نمونه دو" };
const current = "1405-07-30";
const prior = "1404-07-30";
function report(
  id: number, period = current, amount = 250, fields: Partial<CodalN30Data> = {}, metadata: Partial<CodalRow> = {},
): CodalRow {
  const source = `https://codal.ir/Reports/Decision.aspx?LetterSerial=Synthetic${id}%3D%3D&rt=0&let=58`;
  return {
    id, symbol: issuer.symbol, report_kind: "ن-۳۰", period_end: jalaliYmdToGregorian(period),
    title: "گزارش فعالیت ماهانهٔ شرکت آزمون", source_url: source + "#pv2",
    captured_at: "2026-11-17T12:37:22.482262+00:00",
    raw: { parser_version: 2, date_publish: "۱۴۰۵/۰۸/۰۶", period_end_jalali: period, announcement_link: source },
    data: { symbol: issuer.symbol, report_kind: "ن-۳۰", period_end: period,
      fiscal_year: Number(period.slice(0, 4)), unit: "میلیون ریال", period_total_amount: amount,
      fy_cumulative_amount: 9_999_999, products: [], ...fields },
    ...metadata,
  };
}
function sealed(...rows: CodalRow[]): CohortBatch {
  const sorted = rows.slice().sort((a, b) => b.id - a.id);
  const pages = sorted.length ? [
    { beforeId: null, rows: sorted },
    { beforeId: sorted.at(-1)!.id, rows: [] },
  ] : [{ beforeId: null, rows: [] }];
  return { maxId: sorted[0]?.id ?? 0, pages };
}
const run = (batch: CohortBatch) => projectMonthlyCohort(batch, [issuer, other], "1405-07", "sales");

test("fixed common periods and one measure, explicit expected-issuer gaps and both official source witnesses", () => {
  const cur = report(29, current, 250), comparison = report(21, prior, 100), newerOutOfCohort = report(30,"1405-08-30",900);
  const result = run(sealed(cur, comparison, newerOutOfCohort));
  assert.equal(result.state, "complete");
  assert.equal(result.currentMonth, "1405-07");
  assert.equal(result.baselineMonth, "1404-07");
  assert.deepEqual(result.coverage, { expectedIssuers:2,confirmedCurrent:1,confirmedBaseline:1,confirmedPairs:1,yoyAvailable:1 });
  const first = result.rows[0];
  assert.equal(first.issuerId,issuer.id);
  assert.equal(first.yoyPercent,150);
  assert.equal(first.current.state,"ready");
  assert.equal(first.baseline.state,"ready");
  if (first.current.state!=="ready" || first.baseline.state!=="ready") throw Error("missing pair");
  assert.equal(first.current.amountMillionIrr,250,"never use cumulative amount");
  assert.equal(first.current.evidence.rowId,29);
  assert.equal(first.baseline.evidence.rowId,21);
  assert.equal(first.current.evidence.serial,"Synthetic29==");
  assert.equal(first.current.evidence.sourceUrl,cur.raw?.announcement_link);
  assert.equal(first.current.evidence.record.parserVersion,2);
  assert.equal(first.current.evidence.record.publishedAt,null,"date-only publication must stay date-only");
  assert.equal(first.current.evidence.record.capturedAtRaw,cur.captured_at);
  assert.equal(result.rows[1].current.state,"missing");
  assert.equal(result.rows[1].baseline.state,"missing");
  assert.equal(result.rows[1].yoyPercent,null);
});

test("strict terminal page crosses the 1000-row boundary, also handles server short-page cap and never reports partial coverage", () => {
  const baseline = report(1,prior,100);
  const wanted = report(1102,current,250);
  const unrelated = Array.from({length:1100},(_,i)=>report(i+2,current,40,{symbol:"دیگر"},{symbol:"دیگر"}));
  const rows = [wanted,...unrelated.reverse(),baseline];
  assert.equal(rows.length,1102);
  const a={ beforeId:null, rows:rows.slice(0,1000) }, b={beforeId:103,rows:rows.slice(1000)}, c={beforeId:1,rows:[]};
  const maxId=1102;
  assert.equal(run({maxId,pages:[a,b,c]}).rows[0].yoyPercent,150);
  const firstShort={beforeId:null,rows:rows.slice(0,500)};
  const second={beforeId:603,rows:rows.slice(500)};
  assert.equal(run({maxId,pages:[firstShort,second,c]}).rows[0].yoyPercent,150);
  for (const pages of [[a],[a,b],[firstShort]]) {
    const partial=run({maxId,pages});
    assert.equal(partial.state,"partial");
    assert.equal(partial.rows[0].current.state,"not-confirmed");
    assert.equal(partial.rows[0].yoyPercent,null);
    assert.equal(partial.coverage.confirmedPairs,null);
  }
  for (const pages of [[a,{...b,beforeId:104},c],[a,{...b,rows:[rows[999],...b.rows]},c], [{beforeId:null,rows}],
    [a,{beforeId:103,rows:[]},b], [a,{...b,rows:[...b.rows,report(1103)]},c],[]]) {
    const invalid=run({maxId,pages});
    assert.equal(invalid.state,"unavailable");
    assert.equal(invalid.coverage.yoyAvailable,null);
  }
});

test("canonical parser versions and amendments, including a later repair with the same stable publisher identity", () => {
  const source = "https://codal.ir/Reports/Decision.aspx?LetterSerial=Compact+Alias%3D%3D&rt=0&let=58";
  const differentSpelling = "https://www.codal.ir/Reports/Decision.aspx?let=58&rt=0&LetterSerial=Compact%2BAlias%3d%3d";
  const early = report(50,current,235,{}, {source_url:source+"#pv2",
    raw:{parser_version:2,announcement_link:source}});
  const amendment = report(40,current,320,{}, {title:"گزارش فعالیت ماهانه (اصلاحیه)",source_url:source+"#pv3",
    raw:{parser_version:3,announcement_link:source}});
  const broken = report(60,current,320,{unit:null},{title:amendment.title,source_url:differentSpelling+"#pv4",
    raw:{parser_version:4,announcement_link:differentSpelling}});
  const repair = report(61,current,310,{}, {title:amendment.title,source_url:differentSpelling+"#pv5",
    raw:{parser_version:5,announcement_link:differentSpelling}});
  const baseline=report(20,prior,100);
  const independentOriginal=report(55,current,200);
  const before=run(sealed(early,amendment,independentOriginal,baseline)).rows[0];
  assert.equal(before.current.state,"ready");
  if (before.current.state==="ready") assert.equal(before.current.evidence.rowId,40);
  const replaced=run(sealed(early,amendment,broken,baseline)).rows[0];
  assert.equal(replaced.current.state,"unverified","bad newer parser row cannot revive old data");
  if(replaced.current.state==="unverified") assert.deepEqual([replaced.current.reason,replaced.current.evidence?.rowId],["unit",60]);
  assert.equal(replaced.yoyPercent,null);
  const after=run(sealed(early,amendment,broken,repair,baseline)).rows[0];
  assert.equal(after.current.state,"ready");
  if(after.current.state==="ready") {
    assert.equal(after.current.evidence.rowId,61);
    assert.equal(after.current.evidence.serial,"Compact+Alias==");
    assert.equal(after.current.evidence.sourceUrl,differentSpelling);
    assert.equal(after.current.evidence.record.parserVersion,5);
  }
  assert.equal(after.yoyPercent,210);
});

test("fail closed for measure, units, wrong scope/issuer, contradictory period, unsafe source and competing same-month dates", () => {
  const baseline = report(2,prior,100);
  const input: [CodalRow, string][] = [
    [report(4,current,1,{monthly_measure:"service_recognized_income"}),"measure"],
    [report(4,current,1,{unit:"هزار ریال"}),"unit"],
    [report(4,current,1,{}, {title:"گزارش فعالیت ماهانه تلفیقی"}),"scope"],
    [report(4,current,1,{}, {title:null}),"scope"],
    [report(4,current,1,{symbol:other.symbol}),"identity"],
    [report(4,current,1,{}, {period_end:"2026-11-23"}),"period"],
    [report(4,current,1,{}, {raw:{period_end_jalali:prior}}),"period"],
    [report(4,current,1,{}, {raw:{period_months:6}}),"period"],
    [report(4,current,1,{}, {source_url:"https://foreign.invalid/Reports/Decision.aspx?LetterSerial=Synthetic4&let=58"}),"identity"],
    [report(4,current,1,{}, {raw:{announcement_link:"https://codal.ir/Reports/Decision.aspx?LetterSerial=WrongSerial&let=58"}}),"identity"],
    [report(4,"1405-07-31",1),"period"],
    [report(4,"1405-07-29",1),"period"],
    [report(4,current,1,{}, {raw:{parser_version:3}}),"identity"],
  ];
  for (const [row,reason] of input) {
    const result=run(sealed(row,baseline)).rows[0];
    assert.equal(result.yoyPercent,null);
    assert.equal(result.current.state,"unverified");
    if (result.current.state==="unverified") assert.equal(result.current.reason,reason);
  }
  const badMonth=run(sealed(report(4,current,250),report(5,"1405-07-29",150),baseline)).rows[0];
  assert.deepEqual(badMonth.current,{state:"unverified",reason:"ambiguous-period",evidence:null});
  assert.throws(()=>projectMonthlyCohort(sealed(),[issuer,{...issuer,id:"another"}],"1405-07","sales"),/issuer identity/);
  assert.throws(()=>projectMonthlyCohort(sealed(),[issuer],"1405-13","sales"),/period/);
});

test("explicit zero and absence remain distinct, and prior zero has no growth ratio", () => {
  const positive = report(5,current,50), basePositive=report(6,prior,40);
  const currentZero=report(7,current,0,{sales_zero_reported:true});
  const baselineZero=report(8,prior,0,{sales_zero_reported:true});
  assert.equal(run(sealed(currentZero,basePositive)).rows[0].yoyPercent,-100);
  const noDenominator=run(sealed(positive,baselineZero));
  assert.equal(noDenominator.rows[0].baseline.state,"ready");
  assert.equal(noDenominator.rows[0].yoyPercent,null);
  assert.equal(noDenominator.coverage.confirmedPairs,1);
  assert.equal(noDenominator.coverage.yoyAvailable,0);
  assert.equal(run(sealed(report(9,current,0),basePositive)).rows[0].current.state,"unverified","legacy undocumented zero");
  assert.equal(run(sealed(positive)).rows[0].baseline.state,"missing");
  const service=projectMonthlyCohort(sealed(
    report(3,current,0,{monthly_measure:"service_recognized_income"}),
    report(2,prior,100,{monthly_measure:"service_recognized_income"}),
  ),[issuer],"1405-07","service_recognized_income");
  assert.equal(service.rows[0].yoyPercent,-100);
});
