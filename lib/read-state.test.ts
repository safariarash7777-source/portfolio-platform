import {test} from "node:test";
import assert from "node:assert/strict";
import {readState,safeRead} from "./read-state";
test("failed reads are never empty even if they carry partial data",()=>{
  assert.deepEqual(readState({data:[],error:{message:"private DB error"}},"HOLDINGS"),{status:"error",data:null,code:"HOLDINGS"});
  assert.equal(readState({data:[],error:null},"OK").status,"empty");
  assert.equal(readState({data:[1],error:null},"OK").status,"ready");
});
test("one rejected read does not hide another section",async()=>{
  const [bad,good]=await Promise.all([safeRead(Promise.reject(new Error("private"))),safeRead(Promise.resolve({data:[2],error:null}))]);
  assert.equal(readState(bad,"BAD").status,"error");assert.deepEqual(good.data,[2]);
});
