import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, appendFileSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { FixtureBudgetLedger, type BudgetPolicy } from './fixture-ledger';
import { transitionHandoff, p11SupportDimensions, handoffMetric, type Handoff } from './handoff-fixture';
import { forwardJudgementFixture, answerAndReferFixture, type HandoffReceipt, type ReceiptDependencies } from './receipt-handoff';
import { CanonicalFixtureEnvironment, FIXTURE_COHORT } from './evaluation-harness';
import { evaluateDraftValidity } from '../../docs/ops/p08-assistant/fixtures/p07-validity-source';
import { projectSupport, handoffTransitionHash } from '../../docs/ops/p08-assistant/fixtures/p11/runtime/support.mjs';
const subject='a'.repeat(64), other='b'.repeat(64);
const policy: BudgetPolicy={version:'fixture-v1',window:'synthetic-window',startsAt:0,endsAt:1000,totalTokens:100,subjectTokens:60,concurrency:2,subjectConcurrency:1};
const dir=()=>mkdtempSync(join(tmpdir(),'p08-budget-fixture-'));
const ledger=(d=dir(),p:BudgetPolicy|null=policy)=>new FixtureBudgetLedger(d,p,()=>100);
const fresh=async(d=dir(),p:BudgetPolicy=policy)=>{const l=ledger(d,p);await l.initialize();return l;};
test('reservations survive reopen, cannot reset consumption or cancel uncertain dispatch',async()=>{
  const d=dir(),key=randomUUID(); await fresh(d); await ledger(d).reserve(key,subject,60); assert.equal(await ledger(d).claimDispatch(key),true);
  await assert.rejects(ledger(d).cancelBeforeDispatch(key),/uncertain/);
  await assert.rejects(ledger(d).reserve(randomUUID(),subject,1),/budget/);
  assert.equal(await ledger(d).claimDispatch(key),false);
  await ledger(d).settle(key,30); await ledger(d).reserve(randomUUID(),subject,30);
});
test('reserve idempotency never duplicates spend or grants duplicate dispatch',async()=>{
  const l=await fresh(),key=randomUUID(); await l.reserve(key,subject,10); await l.reserve(key,subject,10);
  await assert.rejects(l.reserve(key,other,10),/idempotency/); await assert.rejects(l.reserve(key,subject,20),/idempotency/);
  assert.equal(await l.claimDispatch(key),true); assert.equal(await l.claimDispatch(key),false);
  await l.settle(key,9); await l.settle(key,9); await assert.rejects(l.settle(key,8),/conflict/);
});
test('only undispatched cancellation returns reservation to pool',async()=>{
  const l=await fresh(),key=randomUUID(); await l.reserve(key,subject,60); await l.cancelBeforeDispatch(key); await l.cancelBeforeDispatch(key);
  await l.reserve(randomUUID(),subject,60);
});
test('global and subject concurrency held independently',async()=>{
  const l=await fresh(); await l.reserve(randomUUID(),subject,10);
  await assert.rejects(l.reserve(randomUUID(),subject,10),/concurrency/);
  await l.reserve(randomUUID(),other,10); await assert.rejects(l.reserve(randomUUID(),'c'.repeat(64),10),/concurrency/);
});
test('unknown policy/cap, changed policy and window expiry fail closed',async()=>{
  await assert.rejects(ledger(dir(),null).reserve(randomUUID(),subject,1),/policy/);
  await assert.rejects(ledger(dir(),{...policy,totalTokens:null}).reserve(randomUUID(),subject,1),/policy/);
  const d=dir(); await fresh(d); await ledger(d).reserve(randomUUID(),subject,1);
  await assert.rejects(ledger(d,{...policy,totalTokens:200}).reserve(randomUUID(),other,1),/policy-changed/);
  await assert.rejects(new FixtureBudgetLedger(d,policy,()=>1000).reserve(randomUUID(),other,1),/outside-window/);
});
test('unknown usage cannot release reservation; overrun is recorded then blocks new work',async()=>{
  const l=await fresh(),key=randomUUID(); await l.reserve(key,subject,10); await l.claimDispatch(key);
  await assert.rejects(l.settle(key,Number.NaN),/usage/); await l.settle(key,11);
  await assert.rejects(l.reserve(randomUUID(),other,1),/reconciliation/);
});
test('late settlement records actual in original expired window while new dispatch stays closed',async()=>{
  const d=dir(),key=randomUUID();await fresh(d);await ledger(d).reserve(key,subject,10);await ledger(d).claimDispatch(key);
  const expired=new FixtureBudgetLedger(d,policy,()=>1000);assert.equal((await expired.settle(key,8)).actualTokens,8);
  await assert.rejects(expired.reserve(randomUUID(),other,1),/outside-window/);
});
test('independent P11 overrun probe: already reserved second request cannot dispatch after first overrun',async()=>{
  const l=await fresh(dir(),{...policy,subjectConcurrency:2}),first=randomUUID(),second=randomUUID();
  await l.reserve(first,subject,30);await l.reserve(second,subject,30);await l.claimDispatch(first);await l.settle(first,40);
  await assert.rejects(l.claimDispatch(second),/reconciliation-required/);
});
test('partial crash journal is refused rather than silently reset',async()=>{
  const d=dir(); await fresh(d); await ledger(d).reserve(randomUUID(),subject,10); appendFileSync(join(d,'budget.jsonl'),'{broken');
  await assert.rejects(ledger(d).reserve(randomUUID(),other,10),/corrupt/);
});
test('two OS processes contend on persistent global concurrency; exactly one is admitted',async()=>{
  const d=dir(); await fresh(d,{...policy,concurrency:1}); const run=(s:string)=>new Promise<string>((resolve,reject)=>{
    const child=spawn(process.execPath,[join(process.cwd(),'node_modules/tsx/dist/cli.mjs'),join(process.cwd(),'lib/assistant/fixture-ledger-worker.ts'),d,randomUUID(),s,JSON.stringify({...policy,concurrency:1})]);
    let out='';child.stdout.on('data',v=>out+=String(v));child.on('error',reject);child.on('close',()=>resolve(out));
  });
  assert.deepEqual((await Promise.all([run(subject),run(other)])).sort(),['denied','reserved']);
});
test('journal stores only token accounting and opaque refs, no text/cost guesses',async()=>{
  const d=dir();await fresh(d);await ledger(d).reserve(randomUUID(),subject,10); const raw=readFileSync(join(d,'budget.jsonl'),'utf8');
  for(const key of ['question','answer','phone','amount','cost','providerKey']) assert.ok(!raw.includes(key));
});
test('missing initialized ledger does not reset budget, and orphan crash lock is not stolen',async()=>{
  const d=dir();await fresh(d);await ledger(d).reserve(randomUUID(),subject,60);unlinkSync(join(d,'budget.jsonl'));
  await assert.rejects(ledger(d).reserve(randomUUID(),other,10),/missing/);
  const crash=dir();await fresh(crash);writeFileSync(join(crash,'budget.lock'),'crashed owner');
  await assert.rejects(ledger(crash).reserve(randomUUID(),subject,1),/lock-unavailable/);
});
const initial=():Handoff=>({caseRef:'c'.repeat(64),subjectRef:subject,state:'pending_consent',revision:0,reason:'new-judgement',publicationVersionRef:null,consentVersion:null,ownerRef:null});
const member={role:'member',subjectRef:subject} as const, operator={role:'operator',hasCaseGrant:true} as const;
test('consent→received→assigned→resolved, with revision and case authority',()=>{
  const a=initial(),b=transitionHandoff(a,0,{kind:'consent',consentVersion:'policy-v1'},member);
  assert.equal(p11SupportDimensions(a,b,false),null); assert.deepEqual(p11SupportDimensions(a,b,true),{action:'opened',category:'assistant'});
  const c=transitionHandoff(b,1,{kind:'assign',ownerRef:other},operator); assert.equal(p11SupportDimensions(b,c,true),null);
  const d=transitionHandoff(c,2,{kind:'resolve'},operator);assert.deepEqual(p11SupportDimensions(c,d,true),{action:'resolved',category:'assistant'});
  assert.equal(a.state,'pending_consent'); assert.equal(b.state,'received');
});
test('no consent/grant, other member, stale revision and unassigned resolution are denied',()=>{
  assert.throws(()=>transitionHandoff(initial(),0,{kind:'assign',ownerRef:other},operator),/consent/);
  assert.throws(()=>transitionHandoff(initial(),0,{kind:'consent',consentVersion:'v1'},{role:'member',subjectRef:other}),/denied/);
  assert.throws(()=>transitionHandoff(initial(),0,{kind:'close'},{role:'operator',hasCaseGrant:false}),/denied/);
  assert.throws(()=>transitionHandoff(initial(),1,{kind:'close'},member),/version/);
  const b=transitionHandoff(initial(),0,{kind:'consent',consentVersion:'v1'},member);assert.throws(()=>transitionHandoff(b,1,{kind:'resolve'},operator),/denied/);
});
test('consent revocation closes locally without fabricating resolution or human response',()=>{
  const b=transitionHandoff(initial(),0,{kind:'consent',consentVersion:'v1'},member);
  const c=transitionHandoff(b,1,{kind:'revoke-consent'},member);assert.equal(c.consentVersion,null);assert.equal(p11SupportDimensions(b,c,true),null);
  assert.deepEqual(Object.keys(handoffMetric(c)).sort(),['caseRef','contract','reason','revision','state']);
});
test('independent P11 lineage probe rejects different case/member and revision jumps',()=>{
  const a=initial(),b=transitionHandoff(a,0,{kind:'consent',consentVersion:'v1'},member);
  for(const invalid of [{...b,caseRef:other},{...b,subjectRef:other},{...b,revision:99},{...b,caseRef:'invalid'}, {...b,ownerRef:other}, {...b,reason:'conflict' as const}]) {
    assert.equal(p11SupportDimensions(a,invalid,true),null);
  }
});
function receiptFixture(){
  let current=initial();let allowed=true;let consent:string|null='fixture-consent-v1';let commits=0;let witness=true;let reads=0;
  const stored=new Map<string,HandoffReceipt>();
  const deps:ReceiptDependencies={now:()=> '2026-10-02T10:00:00Z',releaseSha:'31c44ab635b672b589b7833bcbc78b41d36f1e75',
    readAuthority:async()=>{reads++;return {allowed,row:structuredClone(current),consentVersion:consent};},
    commit:async(before,after,occurredAt)=>{
      if(!allowed||before.revision!==current.revision||consent!==after.consentVersion)throw Error('owner-compare-and-set-denied');
      const receipt:HandoffReceipt={contractVersion:'p08.handoff.receipt.fixture.v0.1',caseRef:after.caseRef,subjectRef:after.subjectRef,beforeRevision:before.revision,afterRevision:after.revision,
        state:after.state,consentVersion:after.consentVersion,publicationVersionRef:after.publicationVersionRef,occurredAt,sourceRef:'k_'+'d'.repeat(64),transitionHash:handoffTransitionHash(before,after),environment:'synthetic'};
      commits++;current=structuredClone(after);stored.set(receipt.sourceRef,structuredClone(receipt));return receipt;
    },
    verifyReceipt:async receipt=>({valid:witness&&JSON.stringify(stored.get(receipt.sourceRef))===JSON.stringify(receipt),subjectKey:'k_'+subject,caseKey:'k_'+'c'.repeat(64),sourceRef:receipt.sourceRef}),
    project:projectSupport,
  };
  return {deps,get commits(){return commits;},get reads(){return reads;},get row(){return current;},revoke(){allowed=false;},noConsent(){consent=null;},badWitness(){witness=false;}};
}
test('judgement handoff consumes existing P11 projectSupport receipt, without promised human response',async()=>{
  const f=receiptFixture(),r=await forwardJudgementFixture(subject,f.deps);
  assert.equal(r.status,'received');assert.equal(f.commits,1);assert.ok(f.reads>=4);assert.equal(r.firstHumanResponseAt,null);assert.equal(r.sla,null);
  const again=await forwardJudgementFixture(subject,f.deps);assert.equal(again.status,'unavailable');assert.equal(f.commits,1);
});
test('no consent or wrong actor cannot commit a judgement referral',async()=>{
  const a=receiptFixture();a.noConsent();assert.equal((await forwardJudgementFixture(subject,a.deps)).status,'pending_consent');assert.equal(a.commits,0);
  const b=receiptFixture();assert.equal((await forwardJudgementFixture(other,b.deps)).status,'unavailable');assert.equal(b.commits,0);
});
test('P11 invalid receipt and post-response revocation suppress received confirmation',async()=>{
  const a=receiptFixture();a.badWitness();assert.equal((await forwardJudgementFixture(subject,a.deps)).status,'unavailable');
  const b=receiptFixture();const verify=b.deps.verifyReceipt;b.deps.verifyReceipt=async receipt=>{const proof=await verify(receipt);b.revoke();return proof;};
  assert.equal((await forwardJudgementFixture(subject,b.deps)).status,'unavailable');
});
test('receipt tampering/private field and stale revision fail through P11 canonical validator',async()=>{
  for(const change of ['case','revision','private','hash'] as const){
    const f=receiptFixture(),commit=f.deps.commit;f.deps.commit=async(...args)=>{
      const r=await commit(...args);
      if(change==='case')r.caseRef=other;if(change==='revision')r.afterRevision=99;if(change==='hash')r.transitionHash='e'.repeat(64);
      if(change==='private')(r as unknown as Record<string,unknown>).question='123456 private';return r;
    };const result=await forwardJudgementFixture(subject,f.deps);assert.equal(result.status,'unavailable');assert.equal(result.receiptRef,null);
  }
});
test('new-judgement response routes to verified P11 receipt with zero provider work',async()=>{
  const env=new CanonicalFixtureEnvironment(evaluateDraftValidity);env.plans.q={intent:'current-view',disposition:'new-judgement',references:[]};
  const f=receiptFixture();
  const r=await answerAndReferFixture({questionKey:'q',history:['123456 private amount']},{subjectRef:subject,cohortId:FIXTURE_COHORT},env.dependencies(),f.deps);
  assert.equal(r.response.outcome,'noanswer');assert.equal(r.response.needsHuman,true);assert.equal(r.referral?.status,'received');assert.equal(env.providerCalls,0);
  assert.ok(!JSON.stringify(r).includes('123456'));assert.equal(r.referral?.firstHumanResponseAt,null);
});
test('P11 fixture imports exactly the committed owner blobs and schemas',()=>{
  const provenance=JSON.parse(readFileSync(join(process.cwd(),'docs/ops/p08-assistant/fixtures/PROVENANCE.json'),'utf8'));
  assert.equal(provenance.p11Commit,'8eab5d5471d1ed8aa89921e58dc8f476513fb818');
  for(const file of provenance.files){
    const raw=readFileSync(join(process.cwd(),file.archive),'utf8').replaceAll('\r\n','\n');
    const blob=createHash('sha1').update(`blob ${Buffer.byteLength(raw)}\0`).update(raw).digest('hex');
    assert.equal(blob,file.upstreamBlob);assert.equal(file.identical,true);
  }
});
