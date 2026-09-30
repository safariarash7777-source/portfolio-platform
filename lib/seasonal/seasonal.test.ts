import test from "node:test";
import assert from "node:assert/strict";
import {accessEnd,standing} from "./time";
import {parseImport,CSV_HEADER,safeCsvCell} from "./import";
import {validNeeds} from "./contracts";
import {postSeasonal} from "./http";
test("three Gregorian months differ from 90 days and clamp month end in Tehran",()=>{
 assert.equal(accessEnd("2026-10-01T09:00:00+03:30","gregorian-calendar-months",3),"2027-01-01T05:30:00.000Z");
 assert.equal(accessEnd("2026-10-01T09:00:00+03:30","fixed-days",90),"2026-12-30T05:30:00.000Z");
 assert.equal(accessEnd("2027-01-31T09:00:00+03:30","gregorian-calendar-months",3),"2027-04-30T05:30:00.000Z");
 assert.throws(()=>accessEnd("2026-10-01T09:00:00","fixed-days",90));
});
test("start inclusive, end exclusive, revoked overrides dates",()=>{
 const a="2026-10-01T05:30:00Z",b="2027-01-01T05:30:00Z";
 assert.equal(standing(a,b,null,"2026-10-01T05:29:59.999Z"),"scheduled");
 assert.equal(standing(a,b,null,a),"active");assert.equal(standing(a,b,null,b),"expired");assert.equal(standing(a,b,a,a),"revoked");
});
test("CSV quoted field, duplicate identity, zone and mapping validation; formula-safe export",()=>{
 const line='partner,id-A,A,accepted,2026-10-20T09:00:00+03:30,1,email,a@example.invalid';
 const r=parseImport(CSV_HEADER+"\n"+line,"A");assert.equal(r.errors.length,0);assert.equal(r.rows[0].occurredAt,"2026-10-20T05:30:00.000Z");
 assert.equal(parseImport(CSV_HEADER+"\n"+line+"\n"+line,"A").errors.length,1);
 assert.equal(parseImport(CSV_HEADER+"\n"+line,"B").errors.length,1);
 assert.equal(parseImport(CSV_HEADER+"\n"+line.replace("+03:30",""),"A").errors.length,1);
 assert.match(safeCsvCell("=HYPERLINK(x)"),/^"'/);
});
test("needs assessment limits and financial fields are rejected",()=>{
 const a={experience:"new",interests:["صندوق"],goal:"آموزش",question:"پرسش"};assert.equal(validNeeds(a),true);assert.equal(validNeeds({...a,riskTolerance:"high"}),false);assert.equal(validNeeds({...a,question:"x".repeat(1001)}),false);
});
test("HTTP uses session identity, returns unknown as 503, unauthenticated as 401",async()=>{
 const req=(b:unknown)=>new Request("http://localhost/claim",{method:"POST",body:JSON.stringify(b)});
 let calls=0;
 const connect=async()=>({async authenticate(){return {user:{id:"A"},error:false};},async rpc(){calls++;return {data:null,error:{code:"42P01"}};}});
 assert.equal((await postSeasonal(req({registrationRef:1,userId:"B"}),connect,"claim")).status,422);assert.equal(calls,0);
 assert.equal((await postSeasonal(req({registrationRef:1}),connect,"claim")).status,503);
 assert.equal((await postSeasonal(req({registrationRef:1}),async()=>({...(await connect()),async authenticate(){return {user:null,error:false};}}),"claim")).status,401);
});
