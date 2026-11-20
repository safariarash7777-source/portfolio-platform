import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const resolver = require("node:module") as { _resolveFilename: (specifier: string, ...args: unknown[]) => string };
const original = resolver._resolveFilename;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error("non-injected network denied for the entire test module"); };
after(() => { globalThis.fetch = originalFetch; });
resolver._resolveFilename = function (specifier, ...args) {
  return specifier === "server-only" ? require.resolve("next/dist/compiled/server-only/empty.js") : original.call(this, specifier, ...args);
};
const { readFixedMonthlyCapture } = require("./monthly-capture.server") as typeof import("./monthly-capture.server");
resolver._resolveFilename = original;

const endpoint = "https://62.60.191.24/liara-preview";
const fakeToken = (claims: Record<string, unknown> = {}) => [
  { alg: "HS256", typ: "JWT" },
  { role: "anon", iss: "supabase", exp: 4_102_444_800, ...claims },
  "synthetic-only-invalid-signature",
].map(o => Buffer.from(JSON.stringify(o)).toString("base64url")).join(".");
const env = (key=fakeToken()) => Object.freeze({ FUNDAMENTAL_READ_URL:endpoint, FUNDAMENTAL_READ_ANON_KEY:key });
const exact = {
  folad: "LyQnlYP7OOObOOOIDLto8TGJDkDQ==",
  foladPrior: "5nKO45yY4Zr5NLhxicMKgA==",
  kbc: "ENvoXfX5exv7M34fcbnpNA==",
  shapdis: "IysBiBJD5If1wqv5zbL6ew==",
};
const title = "گزارش فعالیت ماهانه دوره ۱ ماهه";
const url = (serial: string) => `https://codal.ir/Reports/Decision.aspx?LetterSerial=${encodeURIComponent(serial).replace(/%3D/g,"%3d")}&rt=${serial===exact.kbc?5:0}&let=58&ct=0&ft=-1`;
type Projected = {
  id: number; symbol: string; report_kind: string; period_end: string; title: string;
  source_url: string; captured_at: string | null; financial_period: string; financial_symbol: string;
  financial_kind: string; financial_months: number; measure: string | null; amount: number | null;
  unit: string | null; observed_zero: boolean | null; announcement: string; jperiod: string;
  duration: number; parser: number | null; pub_date: string | null; pub_time: string | null;
};
function row(id: number, symbol: string, serial: string, amount: number | null, prior=false): Projected {
  const report = url(serial), jperiod=prior?"1404-07-30":"1405-07-30";
  return { id, symbol, report_kind:"ن-۳۰", period_end:prior?"2025-10-22":"2026-10-22", title, source_url:report+"#pv2",
    captured_at:null, financial_period:jperiod, financial_symbol:symbol, financial_kind:"ن-۳۰",
    financial_months:1, measure:symbol==="کی بی سی"?"service_recognized_income":null, unit:"میلیون ریال", amount,
    observed_zero:null, announcement:report, jperiod, duration:1, parser:2, pub_date:null, pub_time:null };
}
// Values and four source identities are from the file-backed Nov 20 receipt.
// Historic 93 is here only to show replay: its current persisted winner was not
// verified. Shapdis whole amount was redacted/unavailable in that receipt; null
// below represents that evidence limitation, NOT the true current DB scalar.
const fixed: Projected[] = [
  {...row(13834,"شپدیس",exact.shapdis,null),captured_at:"2026-11-17T15:50:26.303786+00:00"},
  {...row(13832,"کی بی سی",exact.kbc,890995),captured_at:"2026-11-17T15:34:27.511269+00:00"},
  {...row(13719,"فولاد",exact.folad,662639489),captured_at:"2026-11-17T12:37:22.482262+00:00"},
  {...row(93,"فولاد",exact.foladPrior,269323842,true),source_url:url(exact.foladPrior),parser:null,title:title+" (اصلاحیه)"},
];
type MockOptions = {cap?: number; mutate?: (url: URL, count: number) => Response | Promise<Response> | undefined; key?: string};
function fakeStore(input: Projected[], {cap=601,mutate,key=fakeToken()}: MockOptions={}) {
  const calls: URL[] = [];
  const reader: typeof fetch = async (target, init) => {
    const u=new URL(String(target)); calls.push(u);
    assert.equal(u.origin+u.pathname,endpoint+"/rest/v1/codal_reports");
    assert.equal(init?.method,"GET");
    assert.equal(init?.redirect,"error");
    assert.equal(init?.credentials,"omit");
    assert.equal(init?.cache,"no-store");
    assert.ok(init?.signal);
    const headers=new Headers(init?.headers);
    assert.equal(headers.get("apikey"),key);
    assert.equal(headers.get("authorization"),"Bearer "+key);
    assert.equal(u.searchParams.get("symbol"),'in.("فولاد","کی بی سی","شپدیس")');
    assert.equal(u.searchParams.get("report_kind"),"eq.ن-۳۰");
    assert.equal(u.searchParams.get("data"),"not.is.null");
    assert.equal(headers.get("prefer"),"count=exact");
    assert.deepEqual([...u.searchParams.keys()].sort(), ["data","limit","report_kind","select","symbol"]);
    assert.equal(calls.length,1);
    const override=mutate?.(u,calls.length);
    if (override) return await override;
    const select=u.searchParams.get("select")!;
    assert.ok(!select.split(",").includes("data")&&!select.split(",").includes("raw"),"no raw blocks");
    assert.ok(select.includes("amount:data->period_total_amount"));
    assert.ok(select.includes("parser:raw->parser_version"));
    assert.equal(u.searchParams.get("limit"),"601");
    const rows=input.slice().reverse().slice(0,cap); // Deliberately not sorted by id.
    const headersOut={"Content-Range": input.length ? `0-${rows.length-1}/${input.length}` : "*/0"};
    return Response.json(rows,{headers:headersOut,status:rows.length<input.length?206:200});
  };
  return { calls, reader };
}

test("replays archived case identities with exact origin, fixed scope, lean aliases and single exact-count request", async () => {
  const {calls,reader}=fakeStore(fixed);
  const result=await readFixedMonthlyCapture({environment:env(),read:reader});
  assert.equal(result.state,"complete"); assert.equal(result.failure,null);
  assert.deepEqual(result.scope.current,"1405-07"); assert.deepEqual(result.scope.baseline,"1404-07");
  assert.equal(result.scope.version,"monthly-capture-v2");
  assert.equal(calls.length,1);
  assert.equal(result.usage.rows,4);
  assert.equal(result.usage.requests,1);
  assert.equal(result.usage.bytes, Buffer.byteLength(JSON.stringify(fixed)));
  assert.deepEqual(result.officialWitnesses.map(p=>p.status),["selected_known_serial","selected_known_serial","selected_known_serial","unverified"]);
  assert.ok(Math.abs((result.normalizedRatiosWithKnownSerials["فولاد"]??0)-146.0381836525264)<1e-10);
  assert.equal(result.normalizedRatiosWithKnownSerials["کی بی سی"],null);
  assert.equal(result.normalizedRatiosWithKnownSerials["شپدیس"],null);
  assert.equal(result.observed.find(x=>x.symbol==="کی بی سی")?.baseline.state,"missing");
  console.log("MONTHLY_CAPTURE_FIXTURE_RECEIPT "+JSON.stringify({scope:result.scope,usage:result.usage,
    sourceStatuses:result.officialWitnesses.map(w=>w.status),ratios:result.normalizedRatiosWithKnownSerials}));
});

test("newest companion revision outside the fixed month closes the old source rather than reviving it",async()=>{
  const amendment={...fixed[2],id:13901,financial_period:"1405-08-30",jperiod:"1405-08-30",period_end:"2026-11-21",
    source_url:url(exact.folad)+"#pv9",parser:9};
  const {reader}=fakeStore([...fixed,amendment]);
  const out=await readFixedMonthlyCapture({environment:env(),read:reader});
  assert.equal(out.state,"complete");
  assert.equal(out.officialWitnesses[0].status,"not_observed_in_read");
  assert.equal(out.normalizedRatiosWithKnownSerials["فولاد"],null);
  assert.equal(out.observed[0].current.state,"missing");
});

test("replacement official serial and unsupported priors cannot be promoted as one of the captured witnesses",async()=>{
  const replacement={...row(15000,"فولاد","OtherKnownFormatSerial==",1),title:title+" (اصلاحیه)"};
  const unknownKbc=row(15001,"کی بی سی","UnverifiedPriorFormat==",400_000,true);
  const {reader}=fakeStore([...fixed,replacement,unknownKbc]);
  const out=await readFixedMonthlyCapture({environment:env(),read:reader});
  assert.equal(out.state,"complete"); assert.equal(out.officialWitnesses[0].status,"selected_other_serial_unchecked");
  assert.equal(out.normalizedRatiosWithKnownSerials["فولاد"],null);
  assert.equal(out.normalizedRatiosWithKnownSerials["کی بی سی"],null);
  const corrected={...fixed[2],id:15002,amount:662639490,source_url:url(exact.folad)+"#pv3",parser:3};
  const changed=await readFixedMonthlyCapture({environment:env(),read:fakeStore([...fixed,corrected]).reader});
  assert.equal(changed.officialWitnesses[0].status,"same_serial_value_unchecked");
  assert.equal(changed.normalizedRatiosWithKnownSerials["فولاد"],null);
  const withoutAmountWitness=await readFixedMonthlyCapture({environment:env(),
    read:fakeStore(fixed.map(r=>r.symbol==="شپدیس"?{...r,amount:42}:r)).reader});
  assert.equal(withoutAmountWitness.officialWitnesses[3].status,"selected_serial_amount_not_captured");
  assert.equal(withoutAmountWitness.normalizedRatiosWithKnownSerials["شپدیس"],null);
});

test("binding rejects partial, non-anon, expired or foreign configuration without falling back",async()=>{
  const invalid=[
    {NEXT_PUBLIC_SUPABASE_URL:endpoint,NEXT_PUBLIC_SUPABASE_ANON_KEY:fakeToken()},
    {FUNDAMENTAL_READ_URL:endpoint},{...env(),FUNDAMENTAL_READ_URL:"https://unapproved.invalid"},
    env(fakeToken({role:"service_role"})),env(fakeToken({exp:1})),
  ];
  for (const e of invalid) {
    const {reader,calls}=fakeStore([]);
    const out=await readFixedMonthlyCapture({environment:e,read:reader});
    assert.equal(out.failure,"binding");assert.equal(out.state,"unavailable");assert.equal(calls.length,0);
  }
});

test("no plausible comparison from HTTP failure, body cap or deadline",async()=>{
  const overlarge="x".repeat(256*1024+20);
  const timeout = new AbortController();
  for (const [mutate,reason,signal] of [
    [()=>new Response("sensitive upstream body",{status:503}),"http",undefined],
    [()=>new Response(overlarge,{headers:{"content-range":"0-3/4","content-type":"application/json"}}),"body_cap",undefined],
    [()=>(timeout.abort(),new Promise<Response>(()=>{})),"deadline",timeout.signal],
  ] as const) {
    const {reader}=fakeStore(fixed,{mutate});
    const out=await readFixedMonthlyCapture({environment:env(),read:reader,signal});
    assert.equal(out.state,"unavailable");assert.equal(out.failure,reason);
    assert.ok(out.officialWitnesses.every(o=>o.status==="not_confirmed"));
    assert.ok(Object.values(out.normalizedRatiosWithKnownSerials).every(v=>v===null));
    assert.equal(JSON.stringify(out).includes("sensitive upstream body"),false);
  }
});

test("partial, missing, mismatched or unknown count/range are never complete",async()=>{
  for(const [range,values,status,reason] of [
    [undefined,fixed,200,"partial"],["0-3/*",fixed,200,"partial"],["0-2/4",fixed,200,"partial"],
    ["0-3/4",fixed.slice(0,3),200,"partial"],["1-4/4",fixed,200,"partial"],
    ["0-3/4",fixed,206,"partial"],["0-3/1001",fixed,206,"row_cap"],["0-600/601",fixed,200,"row_cap"],
    ["*/0",fixed,200,"partial"],
  ] as const){
    const {reader}=fakeStore(fixed,{mutate:()=>Response.json(values,{status,headers:range?{"content-range":range}:undefined})});
    const out=await readFixedMonthlyCapture({environment:env(),read:reader});
    assert.equal(out.state,"unavailable");assert.equal(out.failure,reason);
  }
  for(const badHeaders of [
    {"range-unit":"bytes"},
    {"preference-applied":"count=estimated"},
    {"preference-applied":"count=planned"},
    {"preference-applied":"count=exact,count=planned"},
  ]) {
    const h=new Headers();
    for (const [key,value] of Object.entries(badHeaders)) if (value) h.set(key,value);
    h.set("content-range","0-3/4");
    const {reader}=fakeStore(fixed,{mutate:()=>Response.json(fixed,{headers:h})});
    const out=await readFixedMonthlyCapture({environment:env(),read:reader});
    assert.equal(out.failure,"partial");
  }
  const preferred=await readFixedMonthlyCapture({environment:env(),read:fakeStore(fixed,{
    mutate:()=>Response.json(fixed,{headers:{"content-range":"0-3/4","range-unit":"items","preference-applied":"count=exact"}}),
  }).reader});
  assert.equal(preferred.state,"complete");
  const empty=await readFixedMonthlyCapture({environment:env(),read:fakeStore([]).reader});
  assert.equal(empty.state,"complete");assert.equal(empty.failure,null);assert.equal(empty.usage.rows,0);
});

test("expired binding mid-read or malformed, duplicate or out-of-scope body discards the only read",async()=>{
  const {amount: _omitted, ...missingField} = fixed[1]; void _omitted;
  for (const badData of [[fixed[0],fixed[0]],[{...fixed[1],symbol:"خارج"}],[{...fixed[1],amount:"9000"}],[missingField],[{...fixed[1],unexpected: 123}]]) {
    const {reader}=fakeStore(fixed,{mutate:()=>Response.json(badData,{headers:{"content-range":`0-${badData.length-1}/${badData.length}`}})});
    const out=await readFixedMonthlyCapture({environment:env(),read:reader});
    assert.equal(out.state,"unavailable"); assert.equal(out.failure,"invalid_shape");
  }
  const prev=Date.now;
  try {
    const t=1_795_000_000;
    Date.now=()=>t*1000;
    const token=fakeToken({exp:t+1});
    const {reader,calls}=fakeStore(fixed,{key:token,mutate:()=>{
      Date.now=()=> (t+2)*1000;
      return undefined;
    }});
    const out=await readFixedMonthlyCapture({environment:env(token),read:reader});
    assert.equal(out.failure,"binding");assert.equal(out.state,"unavailable");assert.equal(calls.length,1);
  } finally {Date.now=prev;}
});

test("abort during the response body cancels the reader without exposing a partial pair",async()=>{
  const gate=new AbortController();
  let closed=false;
  const {reader}=fakeStore(fixed,{mutate:()=>new Response(new ReadableStream<Uint8Array>({
    start(c){c.enqueue(new TextEncoder().encode("[")); setImmediate(()=>gate.abort());},
    cancel(){closed=true;},
  }),{headers:{"content-range":"0-3/4","content-type":"application/json; charset=utf-8"}})});
  const result=await readFixedMonthlyCapture({environment:env(),read:reader,signal:gate.signal});
  assert.equal(closed,true);
  assert.equal(result.failure,"deadline");
  assert.equal(result.state,"unavailable");
  assert.ok(result.officialWitnesses.every(x=>x.status==="not_confirmed"));
});


test("valid-shaped JSON with non-JSON or missing content type is not a snapshot", async () => {
  for (const type of ["text/html", "application/jsonp", null]) {
    const headers = new Headers({"content-range":"0-3/4"});
    if (type) headers.set("content-type", type);
    const {reader,calls}=fakeStore(fixed,{mutate:()=>new Response(
      new TextEncoder().encode(JSON.stringify(fixed)), {headers},
    )});
    const result=await readFixedMonthlyCapture({environment:env(),read:reader});
    assert.equal(result.failure,"invalid_shape");
    assert.equal(result.usage.bytes,0);
    assert.equal(calls.length,1);
  }
});
