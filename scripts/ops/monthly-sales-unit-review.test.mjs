import assert from "node:assert/strict";
import test from "node:test";
import { candidates, verifyCandidate } from "./monthly-sales-unit-review.mjs";
const item={symbol:"الف",reportId:93,periodEnd:"1404-07-30",sourceUrl:"https://codal.ir/Reports/Decision.aspx?LetterSerial=A&let=58&rt=0",amendment:true};
const screen={checkedAt:"2026-11-20T00:00:00Z",period:"1405-07",previousPeriod:"1404-07",rows:[{symbol:"الف",eligible:true,unitReview:[item]}]};
test("listing is offline and refuses duplicate or unrelated identities",()=>{
  assert.deepEqual(candidates(screen),[item]);
  for(const bad of [[item,item],[{...item,periodEnd:"1403-01-01"}],[{...item,symbol:"ب"}]]) {
    assert.throws(()=>candidates({...screen,rows:[{...screen.rows[0],unitReview:bad}]}));
  }
});
test("changed source metadata or already-labelled amount rejects before a publisher read", async()=>{
  const row={id:93,symbol:"الف",report_kind:"ن-۳۰",period_end:"2025-10-22",title:"گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۴/۰۷/۳۰ (اصلاحیه)",
    source_url:item.sourceUrl,raw:{parser_version:1},data:{symbol:"الف",period_end:item.periodEnd,period_total_amount:50,unit:null}};
  for(const bad of [{...row,id:1},{...row,data:{...row.data,unit:"ریال"}},{...row,period_end:"2025-09-22"},{...row,title:"اولیه"},{...row,raw:{parser_version:3}}]) {
    await assert.rejects(verifyCandidate(item,bad));
  }
});
