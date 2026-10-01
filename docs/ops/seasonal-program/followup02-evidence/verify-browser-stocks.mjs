import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const bin=process.env.AGENT_BROWSER_BIN;
if(!bin)throw Error('AGENT_BROWSER_BIN required');
const out='docs/ops/seasonal-program/followup02-evidence/';
const call=(...args)=>execFileSync(bin,['--session','followup02-market',...args],{encoding:'utf8',timeout:45000});
const evaluate=source=>JSON.parse(call('eval','-b',Buffer.from(source).toString('base64')));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<80;i++){if(check())return;await pause(250);}throw Error('Browser acceptance timed out');}
const state=()=>evaluate(`({url:location.href,scroll:scrollY,rows:document.querySelectorAll('tbody tr').length,search:document.querySelector('input[placeholder="جستجوی نماد یا نام..."]')?.value,received:[...document.querySelectorAll('header span')].find(s=>s.textContent.startsWith('دریافت:'))?.textContent,requests:window.__marketClock?.requests,active:window.__marketClock?.active,maxActive:window.__marketClock?.maxActive,warning:document.body?.textContent?.includes('دریافت تازه انجام نشد'),timers:window.__marketClock?.timers.size})`);
async function advance(offset,hidden=false){await fs.writeFile(process.env.SYNTHETIC_CLOCK_FILE,String(offset));evaluate(`(()=>{const c=window.__marketClock;c.offset=${offset};c.hidden=${hidden};for(const fn of c.timers.values())fn();return true;})()`);}
let stage='initial'; const result={environment:'synthetic-local-next15-chrome',viewport:'1440x1000',checks:[]};
try{
 await until(()=>state().timers===2);
 const snapshot=call('snapshot','-i');
 await fs.writeFile(out+'stocks-controls.txt',snapshot);
 const line=snapshot.split('\n').find(s=>s.includes('textbox')&&s.includes('جستجوی نماد'));
 const ref='@'+line.match(/ref=(e\d+)/)[1];
 call('fill',ref,'نمونه');
 await until(()=>state().url.includes('q=')&&state().rows===60);
 call('scroll','down','500');await pause(800);
 await until(()=>state().active===0); evaluate("(()=>{window.__marketClock.requests=0;window.__marketClock.maxActive=0;return true;})()");
 const before=state(); const baseOffset=evaluate("window.__marketClock.offset");
 stage='two cycles';
 for(const offset of [300100,600300]){
   const previous=state();await advance(baseOffset+offset);await until(()=>state().received!==previous.received&&state().active===0);await pause(300);
   const after=state();assert.equal(after.url,before.url);assert.equal(after.search,'نمونه');assert.equal(after.rows,60);assert.equal(after.scroll,before.scroll);assert.equal(after.maxActive,1);assert.equal(after.warning,false);
   result.checks.push({case:'five-minute RSC cycle',offset,...after});
 }
 stage='hidden';const previous=state();await advance(baseOffset+900500,true);await pause(500);assert.equal(state().requests,previous.requests);
 evaluate(`(()=>{window.__marketClock.hidden=false;document.dispatchEvent(new Event('visibilitychange'));return true;})()`);
 await until(()=>state().received!==previous.received&&state().active===0);await pause(300);
 result.checks.push({case:'hidden pause and one overdue resume',...state()});
 stage='read failure';await fetch('http://127.0.0.1:15886/fixture-state?mode=unavailable');
 const valid=state();await advance(baseOffset+1200800);await until(()=>state().warning&&state().active===0);await pause(300);
 assert.equal(state().rows,valid.rows);assert.equal(state().received,valid.received);assert.equal(state().url,valid.url);assert.equal(state().scroll,valid.scroll);
 result.checks.push({case:'failed DB read preserves data with warning',...state()});
 await fs.writeFile(out+'stocks-failure-dom.txt',call('snapshot','-i'));
 call('screenshot',out+'stocks-failure1440.png');
 stage='recovery';await fetch('http://127.0.0.1:15886/fixture-state?mode=ready');await advance(baseOffset+1501100);
 await until(()=>!state().warning&&state().received!==valid.received&&state().active===0);
 result.checks.push({case:'recovery',...state()});
 call('screenshot',out+'stocks-refreshed1440.png');
 result.status='PASS';
}catch(error){result.status='FAIL';result.stage=stage;result.error=error.message;try{result.last=state();}catch{};throw error;}
finally{await fs.writeFile(out+'browser-stocks.json',JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,stage,checks:result.checks.length}));}