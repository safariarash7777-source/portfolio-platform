import test from "node:test";
import assert from "node:assert/strict";
import { readStoredReportCounts, companyUniverse, readStoredReportInventory, summarizeReportInventory } from "./codal-coverage.mjs";

const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const ports = read => ({ baseUrl: "https://storage.invalid", headers: {}, fetch: read });

test("counts beyond a server cap and continues after short pages", async () => {
  const rows = Array.from({ length: 1010 }, (_, n) => ({ id: 1010 - n, symbol: n < 1000 ? "الف" : "ب" }));
  const queries = [];
  const result = await readStoredReportCounts(["الف", "ب"], ports(async input => {
    const q = new URL(input).searchParams;
    queries.push(q);
    const before = Number(q.get("id")?.slice(3) ?? Infinity);
    return response(rows.filter(r => r.id < before).slice(0, 500));
  }));
  assert.deepEqual([...result], [["الف", 1000], ["ب", 10]]);
  assert.equal(queries.length, 4);
  assert.equal(queries[1].get("id"), "lt.511");
  assert.equal(queries[0].get("order"), "id.desc");
});

test("later page failure never returns partial coverage", async () => {
  let calls = 0;
  await assert.rejects(readStoredReportCounts(["الف"], ports(async () =>
    ++calls === 1 ? response([{ id: 2, symbol: "الف" }]) : response({}, 503))), /HTTP 503/);
});

test("rejects repeated, unordered, unsafe or unrelated identities", async () => {
  for (const rows of [
    [{ id: 2, symbol: "الف" }, { id: 2, symbol: "الف" }],
    [{ id: 1, symbol: "الف" }, { id: 2, symbol: "الف" }],
    [{ id: Number.MAX_SAFE_INTEGER + 1, symbol: "الف" }],
    [{ id: 2, symbol: "ب" }],
  ]) await assert.rejects(readStoredReportCounts(["الف"], ports(async () => response(rows))), /identity\/order/);
});

test("preserves bigint string cursors and escapes symbol filters", async () => {
  const symbol = 'الف"\\ب';
  let calls = 0;
  const result = await readStoredReportCounts([symbol], ports(async input => {
    const q = new URL(input).searchParams;
    assert.equal(q.get("symbol"), 'in.("الف\\"\\\\ب")');
    if (++calls === 1) return response([{ id: "9007199254740993", symbol }]);
    assert.equal(q.get("id"), "lt.9007199254740993");
    return response([]);
  }));
  assert.equal(result.get(symbol), 1);
});

test("bounded read fails closed if a complete result is not reached", async () => {
  let id = 101;
  await assert.rejects(readStoredReportCounts(["الف"], ports(async () =>
    response([{ id: id--, symbol: "الف" }]))), /page limit/);
});

test("empty universe makes no requests", async () => {
  assert.equal((await readStoredReportCounts([], ports(() => assert.fail("unexpected read")))).size, 0);
});

test("company universe includes illiquid issuers beyond old top 200 with stable deduplicated order", () => {
  const stocks = Array.from({length: 250}, (_, n) => ({id: `شرکت${String.fromCharCode(0x621+n)}` + "س", value: n}));
  stocks.push({id: "متوقف",value:0}, {id:"متوقف",value:99}, {id:"حقح"}, {id:"بلوک٤"}, {id:"بلوک۴"}, {id:"بلوک4"});
  const result=companyUniverse(stocks);
  assert.equal(result.length,251);
  assert.ok(result.includes("متوقف"));
  assert.deepEqual(result,companyUniverse(stocks.reverse().map(s=>({...s,value:0}))));
});

test("inventory reads short capped pages completely and distinguishes missing issuers",async()=>{
 const rows=[{id:'9007199254740994',symbol:'الف',report_kind:'ن-۱۰'},{id:'9007199254740993',symbol:'ب',report_kind:'ن-۳۰'},{id:2,symbol:'ب',report_kind:'ن-۱۰'}];
 const inventory=await readStoredReportInventory(ports(async input=>{
  const q=new URL(input).searchParams;assert.equal(q.get('data'),'not.is.null');
  const before=q.get('id')?.slice(3);
  return response(rows.filter(r=>!before || BigInt(r.id)<BigInt(before)).slice(0,1));
 }));
 assert.deepEqual(summarizeReportInventory(['الف','ب','پ','پ'],inventory),{basis:'stored-presence-not-freshness',universeSize:3,storedRows:3,n30Symbols:1,n10Symbols:2,universeMonthly:1,universeFinancial:2,withoutReports:1});
});
test("inventory rejects partial errors, unsafe or repeated rows rather than publishing partial counts",async()=>{
 let count=0;
 await assert.rejects(readStoredReportInventory(ports(async()=>++count===1?response([{id:5,symbol:'الف',report_kind:'ن-۱۰'}]):response({},503))),/HTTP 503/);
 for(const id of [1,Number.MAX_SAFE_INTEGER+1])await assert.rejects(readStoredReportInventory(ports(async()=>response([{id,symbol:'الف',report_kind:'ن-۱۰'},{id,symbol:'الف',report_kind:'ن-۱۰'}]))),/identity/);
});
