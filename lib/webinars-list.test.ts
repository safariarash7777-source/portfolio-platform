import {test} from "node:test";
import assert from "node:assert/strict";
import {fetchWebinars} from "./webinars-list";
const fake=(body:string,status=200)=>async()=>new Response(body,{status});
test("HTTP error with JSON does not claim an empty webinar list",async()=>{
  const state=await fetchWebinars(fake('{"error":"private DB text"}',500));assert.equal(state.status,"error");assert.ok(!JSON.stringify(state).includes("private"));
});
test("successful empty list is a real empty state",async()=>assert.equal((await fetchWebinars(fake('{"webinars":[]}'))).status,"empty"));
test("invalid JSON, invalid records and network failure remain errors",async()=>{
  for(const fetcher of [fake("bad"),fake('{"webinars":[{}]}'),async()=>{throw new Error("private network");}]) assert.equal((await fetchWebinars(fetcher)).status,"error");
});
test("retry after service recovery shows data including unknown count",async()=>{
  const row={id:"w",title:"وبینار",starts_at:"2026-09-30T10:00:00Z",platform:"link",status:"published",registration_open:true,price_toman:0,max_capacity:10,registered_count:null};
  assert.equal((await fetchWebinars(fake("{}",500))).status,"error");
  const next=await fetchWebinars(fake(JSON.stringify({webinars:[row]})));assert.equal(next.status,"ready");assert.equal(next.data?.[0].registered_count,null);
});
