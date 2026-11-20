import { test } from "node:test";
import assert from "node:assert/strict";
import { readThreshold, screen, validFilters, type Row } from "./rules";
const rows: Row[] = [
  {id:"الف", name:"نمونهٔ صنعتی", industry:"صنعت", price:10,change:3,volume:1_000_000,pe:null},
  {id:"ب", name:"نمونهٔ خدماتی", industry:"خدمات",price:10,change:-1,volume:1_500_000,pe:8},
  {id:"پ", name:"نمونهٔ دیگر", industry:"خدمات",price:10,change:0,volume:0,pe:14},
];
test("thresholds recognize Persian and Arabic digits, zero and decimals",()=>{
  assert.equal(readThreshold("۱٬۲۳۴٫۵"),1234.5);
  assert.equal(readThreshold("−٠٫١"),-0.1);
  assert.equal(readThreshold("۰"),0);
  assert.equal(readThreshold(""),null);
  assert.equal(readThreshold("2e3"),null);
});
test("all conditions apply, and missing data and zero are counted separately",()=>{
  const filters=[{field:"volume",operator:"gte",value:"۰"},{field:"pe",operator:"lte",value:"۱۰"}] as const;
  const result=screen(rows,"","",[...filters]);
  assert.equal(result.eligible,3);
  assert.equal(result.missing,1);
  assert.equal(result.excluded,1);
  assert.deepEqual(result.matched.map(r=>r.id),["ب"]);
  assert.equal(screen(rows,"خدماتي","خدمات",[]).matched.length,1);
  assert.equal(screen(rows,"","خدمات",[]).matched.length,2);
});
test("saved rows narrowly validate malformed data",()=>{
  assert.equal(validFilters([{field:"__proto__",operator:"gte",value:"0"}]),false);
  assert.equal(validFilters([{field:"volume",operator:"any",value:"0"}]),false);
  assert.equal(validFilters([{field:"change",operator:"lte",value:"۰"}]),true);
});
