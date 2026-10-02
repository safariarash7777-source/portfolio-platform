import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildMeasurement,validateMeasurement,uniqueMeasurements} from './measurement.mjs';
import {projectSupport,handoffTransitionHash} from './support.mjs';
const examples=JSON.parse(readFileSync(new URL('../synthetic-events.json',import.meta.url),'utf8'));
for(const example of examples)test('contract consumes '+example.type,()=>{assert.equal(validateMeasurement(example),true);const{eventId,contractVersion,...input}=example;assert.equal(validateMeasurement(buildMeasurement(input)),true);});
test('private/unknown fields rejected instead of silently stripped',()=>{
 const{eventId,contractVersion,...input}=examples[0];
 for(const extra of [{question:'private'},{amount:1},{telegramId:'id'},{dimensions:{status:'allowed',token:'credential'}},{dimensions:{status:'allowed',amount:1}}])assert.throws(()=>buildMeasurement({...input,...extra}),/measurement_invalid/);
});
test('calendar/timezone, versions and unsupported result fail closed',()=>{
 const{eventId,contractVersion,...input}=examples[8];
 for(const extra of [{occurredAt:'2026-02-30T10:00:00Z'},{occurredAt:'2026-10-02T10:00:00'},{occurredAt:'2026-10-02T25:00:00Z'},{versionKey:null},{sourceContract:'notifications.v1'}])assert.throws(()=>buildMeasurement({...input,...extra}),/measurement_invalid/);
});
test('stable identity, immutable output, replay and conflict quarantine',()=>{
 const{eventId,contractVersion,...input}=examples[0];const one=buildMeasurement(input),two=buildMeasurement(structuredClone(input));
 assert.deepEqual(one,two);assert.ok(Object.isFrozen(one.dimensions));assert.equal(uniqueMeasurements([one,two]).length,1);
 assert.throws(()=>uniqueMeasurements([one,{...one,recordedAt:'2026-10-02T11:00:00Z'}]),/measurement_conflict/);
});
const h='a'.repeat(64),k=v=>'k_'+v.repeat(64),sha='31c44ab635b672b589b7833bcbc78b41d36f1e75';
function fixture(){
 const before={caseRef:h,subjectRef:h,state:'pending_consent',revision:1,reason:'new-judgement',publicationVersionRef:null,consentVersion:null,ownerRef:null};
 const after={...before,state:'received',revision:2,consentVersion:'v1'};
 const receipt={contractVersion:'p08.handoff.receipt.fixture.v0.1',caseRef:h,subjectRef:h,beforeRevision:1,afterRevision:2,state:'received',consentVersion:'v1',publicationVersionRef:null,occurredAt:'2026-10-02T10:00:00Z',sourceRef:k('b'),transitionHash:handoffTransitionHash(before,after),environment:'synthetic'};
 const args={before,after,receipt,releaseSha:sha,recordedAt:'2026-10-02T10:00:01Z'};
 const proof=()=>({allowed:true,caseRef:h,subjectRef:h,revision:2,consentVersion:'v1'});
 const deps={readAuthority:async()=>proof(),verifyReceipt:async r=>({valid:r.transitionHash===receipt.transitionHash,caseKey:k('c'),subjectKey:k('a'),sourceRef:r.sourceRef})};
 return {args,deps,proof};
}
test('consented receipt projects support and tracking without question or promised response',async()=>{
 const f=fixture(),result=await projectSupport(f.args,f.deps);assert.equal(result.status,'ready');assert.equal(validateMeasurement(result.event),true);assert.equal(result.event.dimensions.action,'opened');assert.equal(result.tracking.firstHumanResponseAt,null);assert.equal(result.tracking.sla,null);
 assert.ok(!JSON.stringify(result).includes('new-judgement'));assert.equal(result.tracking.dataKind,'synthetic');
});
test('receipt verification and pre/post authority mandatory',async()=>{
 const f=fixture();assert.equal((await projectSupport(f.args,{...f.deps,verifyReceipt:async()=>({valid:false})})).event,null);
 let reads=0;const result=await projectSupport(f.args,{...f.deps,readAuthority:async()=>++reads===1?f.proof():{allowed:false}});assert.equal(result.code,'authority_changed');assert.equal(result.event,null);
});
test('lineage/tamper/private/policy boundary rejected without callbacks',async()=>{
 for(const mutation of [a=>a.after.caseRef='d'.repeat(64),a=>a.after.revision=99,a=>a.receipt.transitionHash='e'.repeat(64),a=>a.receipt.question='private',a=>a.receipt.environment='production',a=>a.after.consentVersion=null]){
  const f=fixture();mutation(f.args);let calls=0;const result=await projectSupport(f.args,{readAuthority:async()=>{calls++;},verifyReceipt:async()=>{calls++;}});assert.equal(result.event,null);assert.equal(calls,0);
 }
});
test('callback exception does not export error text',async()=>{const f=fixture();const result=await projectSupport(f.args,{...f.deps,readAuthority:async()=>{throw Error('PRIVATE QUESTION');}});assert.equal(result.code,'support_unavailable');assert.ok(!JSON.stringify(result).includes('PRIVATE'));});
test('canonical snapshot cannot be mutated during async grant read',async()=>{const f=fixture();const result=await projectSupport(f.args,{...f.deps,readAuthority:async()=>{f.args.after.caseRef='d'.repeat(64);return f.proof();}});assert.equal(result.status,'ready');});
test('assigned/closed not response/resolution; resolved requires witness of original owner/consent',async()=>{
 const f=fixture();const assigned={...f.args.after,state:'assigned',revision:3,ownerRef:'d'.repeat(64)};
 assert.equal((await projectSupport({...f.args,before:f.args.after,after:assigned},f.deps)).event,null);
 const closed={...assigned,state:'closed',revision:4};assert.equal((await projectSupport({...f.args,before:assigned,after:closed},f.deps)).event,null);
});
test('valid resolved receipt projects resolution, without inventing first response',async()=>{
 const f=fixture(),before={...f.args.after,state:'assigned',revision:3,ownerRef:'d'.repeat(64)},after={...before,state:'resolved',revision:4};
 const receipt={...f.args.receipt,beforeRevision:3,afterRevision:4,state:'resolved',sourceRef:k('e'),transitionHash:handoffTransitionHash(before,after)};
 const args={...f.args,before,after,receipt};
 const result=await projectSupport(args,{...f.deps,readAuthority:async()=>({allowed:true,caseRef:h,subjectRef:h,revision:4,consentVersion:'v1'}),verifyReceipt:async r=>({valid:r.transitionHash===receipt.transitionHash,caseKey:k('c'),subjectKey:k('a'),sourceRef:r.sourceRef})});
 assert.equal(result.event.dimensions.action,'resolved');assert.equal(result.tracking.firstHumanResponseAt,null);
});
test('invalid scalar consent and uncloneable extra payload are safe codes only',async()=>{
 const f=fixture();f.args.after.consentVersion=1;assert.equal((await projectSupport(f.args,f.deps)).code,'invalid_input');
 const g=fixture();g.args.receipt.question=()=> 'PRIVATE';assert.equal((await projectSupport(g.args,g.deps)).code,'invalid_input');
});
