import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanyWorkScheduler} from './company-work-scheduler.mjs';
const at=t=>Date.parse(`2026-11-14T${t}:00+03:30`);
test('night cadence increases opportunities without changing daytime or starting before startup delay',async()=>{
 let clock=at('19:40'),calls=0;const s=createCompanyWorkScheduler({job:async()=>calls++,now:()=>clock});
 assert.equal(await s.run(),false);assert.equal(await s.run({initial:true}),true);
 clock=at('19:59');assert.equal(await s.run(),false);
 clock=at('20:00');assert.equal(await s.run(),true);
 clock=at('20:14');assert.equal(await s.run(),false);
 clock=at('20:15');assert.equal(await s.run(),true);assert.equal(calls,3);
});
test('slow in-flight work never overlaps, and cooldown starts after completion',async()=>{
 let clock=at('20:00'),finish,calls=0;const s=createCompanyWorkScheduler({job:()=>{calls++;return new Promise(r=>{finish=r;});},now:()=>clock});
 const pending=s.run({initial:true});clock=at('21:00');assert.equal(await s.run(),false);assert.equal(calls,1);
 finish();await pending;assert.equal(s.state.lastCompletedAt,clock);
 clock=at('21:14');assert.equal(await s.run(),false);assert.equal(calls,1);
});
test('errors retain cooldown, invalid/backwards clocks and disabled overnight do not accelerate',async()=>{
 let clock=at('20:00'),calls=0;const s=createCompanyWorkScheduler({job:async()=>{calls++;throw Error('source');},now:()=>clock,overnightEnabled:false});
 await assert.rejects(s.run({initial:true}),/source/);assert.equal(s.state.running,false);
 for(const value of [NaN,at('19:00'),at('20:15'),at('22:59')]){clock=value;assert.equal(await s.run(),false);}
 clock=at('23:00');await assert.rejects(s.run(),/source/);assert.equal(calls,2);
});
test('morning returns to regular cooldown and existing faster explicit cadence is preserved',async()=>{
 let clock=at('07:50');const s=createCompanyWorkScheduler({job:async()=>{},now:()=>clock});
 await s.run({initial:true});clock=at('08:05');assert.equal(await s.run(),false);
 clock=at('10:50');assert.equal(await s.run(),true);
 assert.equal(createCompanyWorkScheduler({job:async()=>{},regularIntervalMs:5*60000}).state.overnightIntervalMs,5*60000);
 assert.equal(createCompanyWorkScheduler({job:async()=>{},regularIntervalMs:NaN}).state.regularIntervalMs,3*60*60*1000);
});
