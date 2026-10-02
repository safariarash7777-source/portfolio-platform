import { test } from "node:test";
import assert from "node:assert/strict";
import { postFinancialSnapshot, financialAuthentication, type FinancialDb } from "./financialHttp";
import { AuthSessionMissingError, AuthApiError, AuthRetryableFetchError, AuthUnknownError } from "@supabase/supabase-js";
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

for(const [label,error,status] of [
  ['missing',new AuthSessionMissingError(),401],
  ['JWT rejected',new AuthApiError('PRIVATE rejected',401,'bad_jwt'),401],
  ['session rejected',new AuthApiError('PRIVATE rejected',403,undefined),401],
  ['expired',new AuthApiError('PRIVATE expired',400,'refresh_token_not_found'),401],
  ['unknown400',new AuthApiError('PRIVATE input',400,'bad_json'),503],
  ['wrong path',new AuthApiError('PRIVATE upstream',404,undefined),503],
  ['quota',new AuthApiError('PRIVATE limited',429,undefined),503],
  ['outage',new AuthRetryableFetchError('PRIVATE upstream',503),503],
  ['nonJSON',new AuthUnknownError('PRIVATE parse',SyntaxError()),503],
] as const)test(`financial Auth ${label} discards stale user and never calls private RPC`,async()=>{
  const auth=financialAuthentication({id:'stale-user'},error);
  assert.equal(auth.user,null);assert.equal(auth.error,status===503);
  let calls=0;
  for(const kind of ['holdings','debts'] as const){
    const response=await postFinancialSnapshot(request(payload),kind,async()=>({authenticate:async()=>auth,rpc:async()=>{calls++;throw Error('must not execute');}}));
    assert.equal(response.status,status);assert.match(response.headers.get('cache-control')??'',/no-store/);assert.doesNotMatch(await response.text(),/PRIVATE|stale-user/);
  }
  assert.equal(calls,0);
});
test('successful native identity retains the existing owner contract',()=>{
  assert.deepEqual(financialAuthentication({id:'same-owner'},null),{user:{id:'same-owner'},error:false});
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
