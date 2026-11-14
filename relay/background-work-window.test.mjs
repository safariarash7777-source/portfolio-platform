import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundWorkWindow, backgroundRotationDue } from './background-work-window.mjs';
const at = local => Date.parse(`2026-11-14T${local}:00+03:30`);
test('Tehran boundaries keep quote-session hours unchanged and reserve overnight work',()=>{
 for(const t of ['08:00','12:30','15:00','18:00','19:59'])assert.equal(backgroundWorkWindow(at(t)).offPeak,false,t);
 for(const t of ['20:00','23:59','00:00','07:59'])assert.equal(backgroundWorkWindow(at(t)).issuerMultiplier,4,t);
});
test('background rotations retain one hourly check overnight, resume immediately at 08:00',()=>{
 assert.equal(backgroundRotationDue(at('20:00'),at('20:59')),false);
 assert.equal(backgroundRotationDue(at('20:00'),at('21:00')),true);
 assert.equal(backgroundRotationDue(at('07:59'),at('08:00')),true);
 assert.equal(backgroundRotationDue(0,at('20:01')),true);
 assert.equal(backgroundRotationDue(at('21:00'),at('20:00')),true);
});
test('unknown clock does not claim market closure or increase issuer work',()=>{
 assert.equal(backgroundWorkWindow(NaN).issuerMultiplier,1);
});
