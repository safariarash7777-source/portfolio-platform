import { test } from "node:test";
import assert from "node:assert/strict";
import { postFinancialSnapshot, financialAuthentication, type FinancialDb } from "./financialHttp";
import { AuthSessionMissingError,AuthApiError,AuthRetryableFetchError,AuthUnknownError } from "@supabase/supabase-js";
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
