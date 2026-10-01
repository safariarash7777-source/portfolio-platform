import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const bin=process.env.AGENT_BROWSER_BIN;
if(!bin)throw Error('AGENT_BROWSER_BIN required');
const out='docs/ops/seasonal-program/followup02-evidence/';
const call=(...args)=>execFileSync(bin,['--session','followup02-market',...args],{encoding:'utf8',timeout:45000});
const evaluate=source=>JSON.parse(call('eval','-b',Buffer.from(source).toString('base64')));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<80;i++){if(check())return;await pause(250);}throw Error('Browser acceptance timed out');}
function ref(fragment){const s=call('snapshot','-i');const line=s.split('\n').find(line=>line.includes(fragment));if(!line)throw Error('Observed control not found');return '@'+line.match(/ref=(e\d+)/)[1];}
const state=()=>evaluate(`({url:location.href,scroll:scrollY,cards:new Set([...document.querySelectorAll('a[href^="/symbol/"]')].filter(a=>a.getBoundingClientRect().width>0).map(a=>a.getAttribute('href'))).size,received:[...document.querySelectorAll('header span')].find(s=>s.textContent.startsWith('دریافت:'))?.textContent,requests:window.__marketClock.requests,active:window.__marketClock.active,maxActive:window.__marketClock.maxActive,warning:document.body.textContent.includes('دریافت تازه انجام نشد'),width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})`);
async function advance(offset){await fs.writeFile(process.env.SYNTHETIC_CLOCK_FILE,String(offset));evaluate(`(()=>{const c=window.__marketClock;c.offset=${offset};for(const fn of c.timers.values())fn();return true;})()`);}
let stage='filter';const result={environment:'synthetic-local-next15-chrome',viewport:'390x844',checks:[]};
try{
 call('click',ref('button "طلا۱"'));await until(()=>state().url.includes('type=')&&state().active===0);
 call('select',ref('combobox "مرتبسازی صندوقها"'),'faName');await until(()=>state().url.includes('sort=faName')&&state().active===0);
 call('fill',ref('textbox "جستوجوی صندوق"'),'نمونه');
 await until(()=>state().url.includes('q=')&&state().url.includes('sort=faName')&&state().cards===1&&state().active===0);await pause(500);
 evaluate('(()=>{window.__marketClock.requests=0;window.__marketClock.maxActive=0;return true;})()');
 const before=state(),base=evaluate('window.__marketClock.offset');
 for(const offset of [300100,600300]){
  stage='five-minute cycle';const previous=state();await advance(base+offset);await until(()=>state().received!==previous.received&&state().active===0);await pause(300);
  const after=state();assert.equal(after.url,before.url);assert.equal(after.cards,1);assert.equal(after.maxActive,1);assert.equal(after.warning,false);assert.equal(after.width,after.scrollWidth);
  result.checks.push({case:'five-minute fund cycle preserves type search sort and cards',offset,...after});
 }
 call('screenshot',out+'funds-refreshed390.png');
 stage='long in-flight';evaluate('(()=>{const c=window.__marketClock;c.hold=new Promise(resolve=>c.release=resolve);return true;})()');
 const prior=state();await advance(base+900500);await until(()=>state().active===1);
 call('mouse','wheel','180');await pause(700);const userPosition=state().scroll;
 await advance(base+1200800);await pause(500);
 assert.equal(state().requests,prior.requests+1);assert.equal(state().active,1);assert.equal(state().maxActive,1);
 evaluate('(()=>{const c=window.__marketClock;c.hold=null;c.release();return true;})()');
 await until(()=>state().active===0&&state().received!==prior.received&&!state().warning);await pause(300);
 assert.equal(state().cards,1);assert.ok(state().scroll>=userPosition-60,'intentional scroll must not reset to the old position');
 result.checks.push({case:'held RSC does not overlap after another overdue tick; intentional user wheel preserved',userPosition,...state()});
 stage='failure';await fetch('http://127.0.0.1:15886/fixture-state?mode=unavailable');const valid=state();await advance(base+1501100);
 await until(()=>state().warning&&state().active===0);await pause(300);
 assert.equal(state().cards,valid.cards);assert.equal(state().received,valid.received);assert.equal(state().url,valid.url);assert.equal(state().scroll,valid.scroll);
 result.checks.push({case:'fund failure keeps prior card data stamp filters and scroll',...state()});
 call('screenshot',out+'funds-failure390.png');
 await fs.writeFile(out+'funds-failure-dom.txt',call('snapshot','-i'));
 result.status='PASS';
}catch(error){result.status='FAIL';result.stage=stage;result.error=error.message;try{result.last=state();}catch{};throw error;}
finally{await fs.writeFile(out+'browser-funds.json',JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,stage,checks:result.checks.length}));}