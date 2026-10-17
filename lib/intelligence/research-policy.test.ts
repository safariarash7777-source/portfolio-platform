import test from 'node:test';
import assert from 'node:assert/strict';
import { researchRunDigest, inferenceAdmission } from './research-policy';
const now = Date.parse('2026-10-17T12:10:00Z');
test('same hour replay reuses digest but next hourly review is independent', () => {
  assert.equal(researchRunDigest([],now),researchRunDigest([],now+60000));
  assert.notEqual(researchRunDigest([],now),researchRunDigest([],now+3600000));
});
test('attempt ledger limits concurrent changed-input calls and rolling day at midnight', () => {
  assert.equal(inferenceAdmission([],now),'allowed');
  assert.equal(inferenceAdmission([{at:new Date(now-60000).toISOString()}],now),'hour_limit');
  const entries=Array.from({length:24},(_,i)=>({at:new Date(now-i*3600000).toISOString()}));
  assert.equal(inferenceAdmission(entries,now),'day_limit');
  assert.equal(inferenceAdmission([{at:'invalid'}],now),'invalid_ledger');
  assert.equal(inferenceAdmission([{at:new Date(now+3600000).toISOString()}],now),'invalid_ledger');
});
