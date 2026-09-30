import {test} from "node:test";
import assert from "node:assert/strict";
import {consultationCommand,consultationFailure} from "./contracts";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("identity and actor fields are never forwarded from input",()=>{
  const c=consultationCommand({action:"grant",advisorId:id,clientLabel:"نمونهٔ آزمایشی",user_id:"victim",actor_id:"victim"});assert.deepEqual(c.args,{p_advisor:id,p_label:"نمونهٔ آزمایشی"});
});
test("Persian base versions and dates normalize before validation",()=>{
  const c=consultationCommand({action:"task",relationshipId:id,actionKey:id,baseVersion:"۱",status:"open",title:"اقدام",sessionId:id,responsibleId:id,dueOn:"۲۰۲۶-۰۹-۳۰"});assert.equal(c.args.p_base,1);
  assert.throws(()=>consultationCommand({action:"task",relationshipId:id,actionKey:id,baseVersion:1,status:"open",title:"اقدام",sessionId:id,responsibleId:id,dueOn:"2026-02-31"}));
});
test("private service errors are translated to stable Persian responses",()=>{
  for(const code of ["42501","40001","PGRST202"]) assert.ok(!JSON.stringify(consultationFailure({code})).includes("SELECT"));
  assert.equal(consultationFailure({code:"40001"}).status,409);
});
