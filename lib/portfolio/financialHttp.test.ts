import { test } from "node:test";
import assert from "node:assert/strict";
import { postFinancialSnapshot, financialAuthentication, type FinancialDb } from "./financialHttp";
import { postInvestmentScope } from "./scopeHttp";
import { scopeReviewFromStored } from "./scopeContract";
import { selectInvestmentScope } from "./investmentScope";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { parseHoldingsCsv, previewHoldingsImport, IMPORT_FIELDS, canonicalPayload, positionWriteInput } from "./importPreview";
import { positionFromStored } from "./balanceSheet";
import { getFinancialSnapshot, lookupFinancialReceipt, type FinancialReadDb } from "./financialReadHttp";
const request = (body: unknown) => new Request("http://localhost/api/portfolio/debts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const payload = { base_version: 0, client_token: "synthetic", debts: [{ debt_key: "d", title: "وام نمونه", kind: "loan", balance: "۱۰۰۰", currency: "IRR", balance_as_of: "2026-09-30" }], user_id: "spoofed-owner" };
const db = (code?: string): FinancialDb => ({ async authenticate() { return { user: { id: "actual-owner" }, error: false }; }, async rpc() { return { data: [{ version_id: "v", version: 1, reused: false }], error: code ? { code } : null }; } });
test("server normalizes unit exactly once, ignores forged identity and emits private no-store", async () => {
  const source = db(); source.rpc = async (name, args) => { assert.equal(name, "record_member_debts"); assert.equal((args.p_debts as Record<string, unknown>[])[0].balance_toman, 100); assert.equal(Object.hasOwn(args, "user_id"), false); return { data: [{ version: 1, reused: false }], error: null }; };
  const result = await postFinancialSnapshot(request(payload), "debts", async () => source); assert.equal(result.status, 201); assert.equal(result.headers.get("cache-control"), "private, no-store");
});
test("missing session and failed authentication stay distinct and never call RPC", async () => {
  assert.equal(financialAuthentication(null, new AuthSessionMissingError()).error, false);
  assert.equal(financialAuthentication(null, new Error("auth unreachable")).error, true);
  for (const [error, status] of [[false, 401], [true, 503]] as const) {
    const result = await postFinancialSnapshot(request(payload), "debts", async () => ({ async authenticate() { return { user: null, error }; }, async rpc() { throw new Error("must not execute"); } })); assert.equal(result.status, status);
  }
});
test("malformed payload, dates, blank amounts and contingent liabilities return 400", async () => {
  for (const input of [null, [], { ...payload, base_version: null }, { ...payload, debts: [{ ...payload.debts[0], kind: "guarantee" }] }, { ...payload, debts: [{ ...payload.debts[0], balance: "" }] }, { ...payload, debts: [{ ...payload.debts[0], balance_as_of: "2026-02-31" }] }]) {
    const result = await postFinancialSnapshot(request(input), "debts", async () => db()); assert.equal(result.status, 400);
  }
});
test("database permission/conflict/input/unavailable map to safe public HTTP status", async () => {
  for (const [code, status] of [["42501",403],["PT409",409],["40001",409],["23514",400],["22007",400],["PGRST202",503]]) {
    const result = await postFinancialSnapshot(request(payload), "debts", async () => db(String(code))); assert.equal(result.status,status); assert.doesNotMatch(await result.text(),/PGRST|SELECT|23514|42501/);
  }
});
test("replay returns 200 and connection failure returns 503", async () => {
  const source = db(); source.rpc = async () => ({ data: { version: 1, reused: true }, error: null });
  assert.equal((await postFinancialSnapshot(request(payload), "debts", async () => source)).status,200);
  assert.equal((await postFinancialSnapshot(request(payload), "debts", async () => { throw new Error("private connection detail"); })).status,503);
});

const importRow = { position_key: "house", manual_label: "خانه", symbol: "", asset_class: "gold", qty: "", unit: "کل قلم", as_of: "2026-10-02", ownership_pct: "50", valuation_mode: "declared", declared_value: "2000000000", currency: "IRR", valuation_source: "اظهار عضو", valuation_as_of: "2026-10-02", valuation_status: "valid", cost_basis: "", cost_basis_currency: "", title: "" };
const importMapping = Object.fromEntries(IMPORT_FIELDS.map(k => [k, k]));
test("CSV handles quoted Persian text, escaped quotes, CRLF and rejects malformed/duplicate headers", () => {
  assert.equal(parseHoldingsCsv('id,label\r\n1,"خانه، \"\"الف\"\""').rows[0].label, 'خانه، "الف"');
  assert.equal(parseHoldingsCsv('id,label\n1,"دو\nخط"').rows[0].label, 'دو\nخط');
  for (const csv of ['id,id\n1,2', 'id,label\n1', 'id,label\n1,"باز', 'id,label\n1,"الف"x']) assert.throws(() => parseHoldingsCsv(csv));
});
test("import normalizes rial once and preserves ownership, unknown price and unchanged current positions", () => {
  const retained = positionFromStored({ ...importRow, position_key: "existing", qty: null, declared_value: 10, ownership_pct: 100, cost_basis: null });
  const result = previewHoldingsImport({ headers: [...IMPORT_FIELDS], rows: [importRow] }, importMapping, [retained], false);
  assert.equal(result.valid, true); assert.equal(result.positions?.length, 2); assert.equal(result.retainedCount, 1);
  assert.equal(result.entries[0].normalized?.declared_value, 200000000); assert.equal(result.entries[0].normalized?.ownership_pct, 50);
  const unknown = previewHoldingsImport({ headers: [...IMPORT_FIELDS], rows: [{ ...importRow, valuation_mode: "unpriced", qty: "12.5" }] }, importMapping, [], false);
  assert.equal(unknown.entries[0].normalized?.declared_value, null); assert.equal(unknown.entries[0].normalized?.valuation_status, "missing");
  assert.equal(positionFromStored(unknown.entries[0].normalized!).costBasis, null);
});
test("import blocks unknown ownership/units, repeated keys and implicit overwrite without dropping source rows", () => {
  const current = [positionFromStored({ ...importRow, declared_value: 10, qty: null, cost_basis: null })];
  for (const row of [{ ...importRow, ownership_pct: "" }, { ...importRow, currency: "" }, { ...importRow, declared_value: "11" }]) {
    const result = previewHoldingsImport({ headers: [...IMPORT_FIELDS], rows: [row] }, importMapping, [], false); assert.equal(result.valid, false); assert.equal(result.positions, null); assert.equal(result.entries.length, 1);
  }
  assert.equal(previewHoldingsImport({ headers: [...IMPORT_FIELDS], rows: [importRow, importRow] }, importMapping, [], false).valid, false);
  assert.equal(previewHoldingsImport({ headers: [...IMPORT_FIELDS], rows: [importRow] }, importMapping, current, false).valid, false);
  assert.equal(previewHoldingsImport({ headers: [...IMPORT_FIELDS], rows: [importRow] }, importMapping, current, true).positions?.length, 1);
});
test("cost basis currency is explicit and complete normalized payload is order stable", () => {
  const result = previewHoldingsImport({ headers: [...IMPORT_FIELDS], rows: [{ ...importRow, cost_basis: "1000", cost_basis_currency: "IRR" }] }, importMapping, [], false);
  assert.equal(result.entries[0].normalized?.cost_basis, 100);
  const noUnit = previewHoldingsImport({ headers: [...IMPORT_FIELDS], rows: [{ ...importRow, cost_basis: "1000" }] }, importMapping, [], false); assert.equal(noUnit.valid, false);
  const a = { ...importRow, position_key: "a" }, b = { ...importRow, position_key: "b" };
  assert.equal(canonicalPayload([a,b]), canonicalPayload([b,a]));
});
test("Persian import enums are explicit aliases; precision-losing quantity cannot create a phantom position", () => {
  const row = { ...importRow, asset_class: "طلا", valuation_mode: "بدون قیمت", qty: "۱۲.۵۰۰", ownership_pct: "۵۰", currency: "ریال" };
  const p = previewHoldingsImport({ headers: [...IMPORT_FIELDS], rows: [row] }, importMapping, [], false);
  assert.equal(p.valid, true); assert.equal(p.entries[0].normalized?.qty, 12.5);
  for (const qty of ["9007199254740990.1", "0.12345678901234567"]) {
    assert.equal(previewHoldingsImport({ headers: [...IMPORT_FIELDS], rows: [{ ...row, qty }] }, importMapping, [], false).valid, false);
  }
});
const readVersion = { id: "00000000-0000-4000-8000-000000000001", version: 1, user_id: "actual-owner", content_hash: "a".repeat(32), note: null };
const readDb = (): FinancialReadDb => ({
  async authenticate() { return { user: { id: "actual-owner" }, error: false }; },
  async version(owner) { assert.equal(owner, "actual-owner"); return readVersion; },
  async positions() { return []; }, async debts() { return []; },
});
test("canonical read distinguishes no version, recorded empty, foreign version, auth outage and partial failure", async () => {
  const source = readDb(); const ready = await getFinancialSnapshot(undefined, async () => source);
  assert.equal((await ready.json()).state, "ready"); assert.equal(ready.headers.get("cache-control"), "private, no-store");
  source.version = async () => null;
  assert.equal((await (await getFinancialSnapshot(undefined, async () => source)).json()).state, "empty");
  assert.equal((await getFinancialSnapshot(readVersion.id, async () => source)).status, 404);
  source.version = async () => ({ ...readVersion, user_id: "foreign" }); assert.equal((await getFinancialSnapshot(undefined, async () => source)).status, 403);
  source.authenticate = async () => ({ user: null, error: true }); assert.equal((await getFinancialSnapshot(undefined, async () => source)).status, 503);
  const failed = readDb(); failed.debts = async () => { throw new Error("private failure"); }; assert.equal((await getFinancialSnapshot(undefined, async () => failed)).status, 503);
});
test("receipt absence/unbound hash stays unknown; exact token hash accepts canonical write only; mismatch conflicts", async () => {
  const lookup = (body: unknown) => new Request("http://localhost/api/portfolio/holdings/receipt", { method: "POST", body: JSON.stringify(body) });
  const source = readDb();
  assert.equal((await (await lookupFinancialReceipt(lookup({ client_token: "token" }), async () => source)).json()).status, "unknown");
  const accepted = await (await lookupFinancialReceipt(lookup({ client_token: "token", expectedCanonicalContentHash: "a".repeat(32) }), async () => source)).json();
  assert.equal(accepted.status, "accepted"); assert.equal(accepted.migrationComplete, false); assert.equal(accepted.migrationMappings, null);
  assert.equal(accepted.ownerId, "actual-owner"); assert.equal(accepted.contractVersion, "p04-receipt-read.v0.1");
  assert.equal((await lookupFinancialReceipt(lookup({ client_token: "token", expectedCanonicalContentHash: "b".repeat(32) }), async () => source)).status, 409);
  source.version = async () => null; assert.equal((await (await lookupFinancialReceipt(lookup({ client_token: "token", positions: [] }), async () => source)).json()).status, "unknown");
});
test("receipt validates original normalized holdings and note without conflating SQL MD5 with preview digest", async () => {
  const source = readDb(); source.positions = async () => [{ ...importRow, qty: null, declared_value: 200000000, ownership_pct: 50, cost_basis: null }];
  const req = (positions: unknown[], note?: string) => new Request("http://localhost/receipt", { method: "POST", body: JSON.stringify({ client_token: "token", positions, note, user_id: "spoofed" }) });
  assert.equal((await lookupFinancialReceipt(req([importRow]), async () => source)).status, 200);
  assert.equal((await lookupFinancialReceipt(req([{ ...importRow, ownership_pct: "100" }]), async () => source)).status, 409);
  assert.equal((await lookupFinancialReceipt(req([importRow], "changed"), async () => source)).status, 409);
});

// RECOVERY-01: durable scope HTTP and version binding.
{
const id="00000000-0000-4000-8000-000000000001", reviewId="00000000-0000-4000-8000-000000000002";
const assignments=[{positionKey:"gold",use:"allocatable"}];
const body={holding_version_id:id,rules_version:"member-selected.v0.1",base_scope_version:0,client_token:"scope-request",assignments};
const request=(value:unknown)=>new Request("http://localhost/api/portfolio/holdings/scope",{method:"POST",body:JSON.stringify(value)});
const result={id:reviewId,scopeVersion:1,holdingVersionId:id,holdingVersion:2,rulesVersion:"member-selected.v0.1",memberConfirmedAt:"2026-10-03T09:00:00Z",assignments,reused:false};
function db(code?:string):FinancialDb {return {async authenticate(){return {user:{id:"native-owner"},error:false};},async rpc(name,args){assert.equal(name,"record_member_investment_scope");assert.equal(args.p_holding_version_id,id);assert.equal(Object.hasOwn(args,"p_member_confirmed_at"),false);assert.equal(Object.hasOwn(args,"p_user_id"),false);return {data:result,error:code?{code}:null};}};}
test("scope save derives native owner and server timestamp, private response, exact replay200",async()=>{
 const first=await postInvestmentScope(request(body),async()=>db());assert.equal(first.status,201);assert.equal(first.headers.get("cache-control"),"private, no-store");assert.equal((await first.json()).memberConfirmedAt,result.memberConfirmedAt);
 const reused=db();reused.rpc=async()=>({data:{...result,reused:true},error:null});assert.equal((await postInvestmentScope(request(body),async()=>reused)).status,200);
});
test("client timestamp/owner, unknown rules, malformed/duplicate/unknown choices and base cannot become confirmation",async()=>{
 for(const value of [null,[],{...body,memberConfirmedAt:"2020-01-01T00:00:00Z"},{...body,user_id:"foreign"},{...body,rules_version:"guessed"},{...body,base_scope_version:null},{...body,assignments:[]},{...body,assignments:[...assignments,...assignments]},{...body,assignments:[{positionKey:"gold",use:"unknown"}]}]){
  assert.equal((await postInvestmentScope(request(value),async()=>db())).status,400);
 }
});
test("scope session, read outage, stale financial/scope and foreign owner fail closed",async()=>{
 for(const [error,status] of [[false,401],[true,503]] as const){const source=db();source.authenticate=async()=>({user:null,error});source.rpc=async()=>{throw new Error("must not write");};assert.equal((await postInvestmentScope(request(body),async()=>source)).status,status);}
 for(const [code,status] of [["42501",403],["PT409",409],["40001",409],["22023",400],["PGRST202",503]])assert.equal((await postInvestmentScope(request(body),async()=>db(String(code)))).status,status);
 const malformed=db();malformed.rpc=async()=>({data:{...result,assignments:[{positionKey:"foreign",use:"allocatable"}]},error:null});assert.equal((await postInvestmentScope(request(body),async()=>malformed)).status,503);
});
test("durable review is tied to exact financial UUID/version; next snapshot requires new confirmation",()=>{
 const stored=scopeReviewFromStored({id:reviewId,holding_version_id:id,scope_version:1,rules_version:body.rules_version,member_confirmed_at:result.memberConfirmedAt,assignments},{id,version:2});
 const holdings={id,version:2,positions:[{positionKey:"gold",symbol:null,manualLabel:"طلا",assetClass:"gold",qty:1,unit:"گرم",costBasis:null,asOf:"2026-10-03"}]};
 assert.equal(selectInvestmentScope(holdings,stored,new Date("2026-10-03T10:00:00Z")).status,"ready");
 assert.equal(selectInvestmentScope({...holdings,id:reviewId,version:3},stored,new Date("2026-10-03T10:00:00Z")).status,"blocked");
 assert.throws(()=>scopeReviewFromStored({id:reviewId,holding_version_id:id,scope_version:1,rules_version:body.rules_version,member_confirmed_at:"2026-10-03T09:00:00",assignments},{id,version:2}));
});

}
