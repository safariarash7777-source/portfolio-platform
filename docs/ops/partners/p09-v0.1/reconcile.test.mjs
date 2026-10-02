import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preview,reconcile,correctionRef,validate} from './reconcile.mjs';
const fixture=JSON.parse(readFileSync(new URL('./example.json',import.meta.url),'utf8'));
const base=fixture.events[0];
const event=(id,type='commission_reported',extra={})=>({...base,source_event_id:id,event_type:type,amount:'100',unit:'IRT',...extra});
test('click and registration do not create activity, fee or AUM',()=>{
 const p=preview(fixture.events.slice(0,2)); assert.equal(p.journal.length,2);
 const result=reconcile(p.journal); assert.deepEqual(result.comparisons,[]);
 assert.equal(result.verified_aum,null); assert.equal(result.calculated_fee,null); assert.equal(result.collected_amount,null);
});
test('repeated report and later received_at never double counted',()=>{
 const p=preview(fixture.events); const replay=preview(fixture.events.map(e=>({...e,received_at:'2026-10-02T12:00:00Z'})),p.journal);
 assert.ok(replay.rows.every(r=>r.status==='duplicate')); assert.deepEqual(reconcile(replay.journal),reconcile(p.journal));
});
test('same identity with changed amount quarantined',()=>{
 const old=event('one'); const p=preview([old,{...old,amount:'999'}]);
 assert.equal(p.rows[1].status,'conflict'); assert.equal(p.journal.length,1);
});
test('late correction retains original and changes effective reported amount',()=>{
 const old=event('one'); const corrected={...old,source_revision:2,amount:'80',corrects_event_id:correctionRef(old),received_at:'2026-10-02T12:00:00Z'};
 const p=preview([old,event('invoice','invoice_reported',{amount:'80'}),corrected]);
 assert.equal(p.journal.length,3); assert.equal(p.journal[0].amount,'100');
 assert.equal(reconcile(p.journal).comparisons[0].status,'reported-match');
 assert.equal(preview([corrected],p.journal).rows[0].status,'duplicate');
});
test('missing original, gap and competing corrections stop',()=>{
 const old=event('one'), correction={...old,source_revision:2,corrects_event_id:correctionRef(old)};
 assert.equal(preview([correction]).rows[0].reason,'missing-original');
 assert.equal(preview([old,{...correction,source_revision:3}]).rows[1].reason,'correction-chain');
 assert.equal(preview([old,correction,{...correction,amount:'55'}]).rows[2].status,'conflict');
});
test('mid-period contract change never overwrites old context',()=>{
 const old=event('one'); const p=preview([old,{...old,source_revision:2,corrects_event_id:correctionRef(old),contract_version:'fixture-v2'}]);
 assert.equal(p.rows[1].reason,'historical-context-change');
 const separate=preview([old,event('new-contract','invoice_reported',{contract_version:'fixture-v2'})]);
 assert.ok(reconcile(separate.journal).comparisons.every(c=>c.status==='incomplete'));
});
test('unmatched member, two codes and missing consent need operations review',()=>{
 const p=preview([event('none','registration_reported',{referral_ids:[],member_ref:null,consent_ref:null}),event('two','registration_reported',{referral_ids:['fixture:a','fixture:b']}),event('no-consent','registration_reported',{consent_ref:null})]);
 assert.deepEqual(new Set(reconcile(p.journal).queue.map(q=>q.reason)),new Set(['unattributed','unmatched-member','multiple-referrals','missing-consent']));
});
test('unit errors rejected; IRR and IRT never guessed or compared',()=>{
 assert.equal(validate(event('bad','commission_reported',{unit:'USD'})),'unit');
 const p=preview([event('one'),event('two','invoice_reported',{unit:'IRR',amount:'1000'})]);
 assert.equal(reconcile(p.journal).comparisons.length,2); assert.ok(reconcile(p.journal).comparisons.every(c=>c.status==='incomplete'));
});
test('invoice mismatch and absent amount remain explicit, never verified',()=>{
 const p=preview([event('one'),event('two','invoice_reported',{amount:'90'})]);
 assert.equal(reconcile(p.journal).comparisons[0].status,'reported-mismatch');
 assert.equal(reconcile(p.journal).verified_commission,null);
 assert.equal(reconcile(preview([event('unknown','commission_reported',{amount:null,unit:null})]).journal).comparisons[0].reported_commission,null);
});
test('reject unverifiable claims, private extra fields, future/no-offset and numeric money',()=>{
 assert.equal(validate({...base,verification:'verified'}),'verification-not-authorized');
 assert.equal(validate({...base,phone:'private'}),'shape');
 assert.equal(validate({...base,occurred_at:'2027-01-01T00:00:00Z'}),'time');
 assert.equal(validate({...base,occurred_at:'2026-10-01T00:00:00'}),'time');
 assert.equal(validate({...base,amount:100,unit:'IRT'}),'amount');
});
