import assert from "node:assert/strict";
import test from "node:test";
import { historicalValue, readDossierHistory } from "./dossier-history";
import type { HoldingPosition } from "./contracts";

const current = { id: "owner-v2", version: 2, date: "2026-09-04T10:00:00Z" };
const prior = { id: "owner-v1", version: 1, date: "2026-08-04T10:00:00Z" };
const position: HoldingPosition = {
  positionKey: "p", symbol: null, manualLabel: "آزمایشی", assetClass: "cash", unit: "تومان",
  qty: null, costBasis: null, asOf: "2026-08-02", ownershipPct: 50,
  valuationMode: "declared", valuationAsOf: "2026-08-02", declaredValue: 100_000,
  valuationStatus: "valid", valuationSource: "ثبت آزمایشی",
};
test("historical overview uses documented declared value and member share, not present prices or profit", () => {
  assert.equal(historicalValue(prior,[position]).amount, 50_000);
  assert.equal(historicalValue(prior,[{...position,declaredValue:0}]).amount,0);
  assert.equal(historicalValue(prior,[{...position,valuationStatus:"estimated"}]).estimated,true);
  for (const rows of [[],[{...position,valuationAsOf:"2026-08-05"}],[position,{...position,valuationMode:"market" as const}],[{...position,valuationSource:""}]])
    assert.equal(historicalValue(prior,rows).amount,null);
});
type Client = Parameters<typeof readDossierHistory>[0];
function client(rows: object[], count: number | null, keys: string[][], error: unknown = null) {
  const query = { select: () => query, eq: (column: string, owner: string) => { assert.equal(column,"member_holding_versions.user_id"); assert.equal(owner,"owner"); return query; }, in: (_key: string, values: string[]) => {keys.push(values); return query;},
    limit: () => query, abortSignal: async () => ({data: rows, count, error}) };
  return { from: () => query } as unknown as Client;
}
test("history fetch is one bounded member-version batch; incomplete or unexpected rows fail closed", async () => {
  const row = { version_id:prior.id,position_key:"x",manual_label:"test",asset_class:"cash",ownership_pct:50,valuation_mode:"declared",declared_value:60000,valuation_source:"test",valuation_as_of:"2026-08-02",valuation_status:"valid" };
  const keys: string[][]=[];
  const complete = await readDossierHistory(client([row],1,keys),"owner",[current,prior],[position]);
  assert.deepEqual(keys,[[prior.id]]);
  assert.deepEqual(complete.points.map(p => p.amount),[30_000,50_000]);
  for (const c of [client([row],2,[]),client([row],null,[]),client([row],1,[],true),client([{...row,version_id:"other"}],1,[])]) {
    const r=await readDossierHistory(c,"owner",[current,prior],[position]);
    assert.equal(r.state,"unavailable"); assert.deepEqual(r.points.map(p=>p.id),[current.id]);
  }
});
test("empty and first version do not query unrelated history",async()=>{
  const c = {from(){throw Error("unexpected query")}} as unknown as Client;
  assert.equal((await readDossierHistory(c,"owner",[],[])).state,"empty");
  assert.equal((await readDossierHistory(c,"owner",[current],[position])).points[0].amount,50_000);
});
