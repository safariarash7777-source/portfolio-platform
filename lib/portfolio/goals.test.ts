import assert from "node:assert/strict";
import { test } from "node:test";
import { goalProgress, validateGoalsPayload, type GoalsPayload } from "./goalsApiContract";
const payload = (): GoalsPayload => ({contractVersion:1,goals:[{goalKey:"reserve",title:"ذخیره",targetAmountToman:1000,targetOn:"2027-01-01",declaredSavedToman:null,source:null,note:null}]});
test("unknown savings stay unknown; sourced zero is genuine zero; no forecast",()=>{
 const goal=payload().goals[0];assert.deepEqual(goalProgress(goal),{remainingToman:null,progressPercent:null});
 goal.declaredSavedToman=0;assert.equal(goalProgress(goal).progressPercent,null);
 goal.source={label:"اظهار عضو",observedOn:"2026-10-23"};assert.deepEqual(goalProgress(goal),{remainingToman:1000,progressPercent:0});
 goal.declaredSavedToman=250;assert.deepEqual(goalProgress(goal),{remainingToman:750,progressPercent:25});
 goal.declaredSavedToman=1500;assert.deepEqual(goalProgress(goal),{remainingToman:0,progressPercent:100});
 goal.targetAmountToman=Number.MAX_SAFE_INTEGER;goal.declaredSavedToman=Number.MAX_SAFE_INTEGER;assert.deepEqual(goalProgress(goal),{remainingToman:0,progressPercent:100});
});
test("strict goals payload rejects unsafe input, missing provenance, extra keys and duplicates",()=>{
 const cases: ((p:GoalsPayload)=>void)[]=[p=>{p.goals[0].targetOn="2026-02-30";},p=>{p.goals[0].targetAmountToman=0;},p=>{p.goals[0].targetAmountToman=Number.MAX_SAFE_INTEGER+1;},p=>{p.goals[0].declaredSavedToman=0;},p=>{p.goals[0].declaredSavedToman=-1;},p=>{p.goals[0].declaredSavedToman=0.5;},p=>{p.goals.push({...p.goals[0]});},p=>{Object.assign(p.goals[0],{userId:"forged"});},p=>{p.goals[0].title="x".repeat(161);},p=>{p.goals[0].source={label:"unknown",observedOn:"2026-10-23"};},p=>{p.goals=Array.from({length:51},(_,i)=>({...p.goals[0],goalKey:String(i)}));}];
 for(const mutate of cases){const p=payload();mutate(p);assert.throws(()=>validateGoalsPayload(p));}
 const p=payload(),original=structuredClone(p);assert.deepEqual(validateGoalsPayload(p),p);assert.deepEqual(p,original);
 assert.deepEqual(validateGoalsPayload({contractVersion:1,goals:[]}),{contractVersion:1,goals:[]});
});
