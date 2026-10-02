import fs from 'node:fs';
import {chromium} from 'file:///C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const c=JSON.parse(fs.readFileSync('C:/Users/Asus/.codex/private/accept195-liara/reviewer.json'));const origin='https://62.60.191.24:8443';if(c.origin!==origin)throw Error('Unexpected target');
const folder='docs/ops/seasonal-program/integration-195-20261002/';const report={environment:'portfolio-accept195',applicationSHA:'31c44ab635b672b589b7833bcbc78b41d36f1e75',origin,startedAt:new Date().toISOString(),source:'Native SQL synthetic fixtures; actual UI-issued admin login; no issuer data or live provider',scenarios:[]};
const save=()=>fs.writeFileSync(folder+'BROWSER-FINANCIAL.json',JSON.stringify(report,null,2)+'\n');
function record(id,expected,observed,ok){report.scenarios.push({id,role:'admin',expected,observed,status:ok?'PASS':'FAIL',at:new Date().toISOString()});save();console.log(id+' '+(ok?'PASS':'FAIL'))}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Los_Angeles'});const page=await context.newPage();let external=0;const errors=[];
await context.route(url=>url.origin!==origin&&['http:','https:'].includes(url.protocol),route=>{external++;return route.abort()});page.on('pageerror',e=>errors.push(e.message.replace(/eyJ[\w.-]+/g,'[REDACTED]')));
try{
 await page.goto(origin+'/login?next='+encodeURIComponent('/symbol/SYNTHETIC195_CURRENT'),{waitUntil:'domcontentloaded',timeout:60000});await page.locator('#login-email').fill(c.accounts.admin.email);await page.locator('#login-password').fill(c.accounts.admin.password);
 const pending=page.waitForResponse(r=>r.url().includes('/supabase/auth/v1/token')&&r.request().method()==='POST',{timeout:30000});await page.locator('button[type="submit"]').click();const login=await pending;
 await page.waitForURL(url=>url.pathname==='/symbol/SYNTHETIC195_CURRENT',{timeout:60000});record('financial-real-login','Native GoTrue actual UI login and protected full access',{http:login.status(),path:new URL(page.url()).pathname},login.status()===200);
 for(const symbol of ['SYNTHETIC195_CURRENT','SYNTHETIC195_PRIOR']){
  const response=new URL(page.url()).pathname==='/symbol/'+symbol
   ? await page.reload({waitUntil:'domcontentloaded',timeout:60000})
   : await page.goto(origin+'/symbol/'+symbol,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForLoadState('networkidle',{timeout:30000});
  const tab=page.getByRole('tab',{name:'بنیادی',exact:true});await tab.click();
  await page.waitForFunction(()=>document.querySelector('[role="tab"][aria-selected="true"]')?.textContent==='بنیادی',{},{timeout:15000});
  await page.locator('#chart-margins').waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>[...document.querySelectorAll('#chart-margins .recharts-cartesian-axis-tick-value')].some(x=>x.textContent==='خالص'),{},{timeout:25000});
  const annual=await page.locator('#chart-margins').evaluate(el=>({axisLabels:[...el.querySelectorAll('.recharts-cartesian-axis-tick-value')].map(x=>x.textContent),bars:el.querySelectorAll('.recharts-bar-rectangle path').length,text:el.innerText}));
  record(symbol+'-annual-null','Unknown current/prior gross pair omitted, operating/net categories and four bars remain',{http:response.status(),axisLabels:annual.axisLabels,bars:annual.bars,grossCategoryPresent:annual.axisLabels.includes('ناخالص')},response.status()===200&&!annual.axisLabels.includes('ناخالص')&&annual.axisLabels.includes('عملیاتی')&&annual.axisLabels.includes('خالص')&&annual.bars===4);
  await page.locator('#quarterly').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelectorAll('#quarterly .recharts-line').length>=3,{},{timeout:25000});
  const lines=await page.locator('#quarterly').evaluate(el=>[...el.querySelectorAll('.recharts-line')].slice(0,3).map(line=>{
   const path=line.querySelector('.recharts-line-curve')?.getAttribute('d')??null;
   return{path,moveSegments:(path?.match(/M/g)??[]).length,curveSegments:(path?.match(/C/g)??[]).length};
  }));
  const expectedGross=symbol.endsWith('CURRENT')?1:2;
  // Recharts' wrapper for dot elements varies; the actual SVG path is stable evidence.
  // Q1 (and Q4 for PRIOR) are separate M...Z segments; no C/L bridges missing Q2/Q3.
  record(symbol+'-quarterly-null','Gross missing quarters stay SVG gaps; net/operating four quarters remain; no false zero',{lines,expectedGrossIsolatedSegments:expectedGross},lines[0]?.moveSegments===expectedGross&&lines[0]?.curveSegments===0&&!/[LNaInf]/.test(lines[0]?.path??'')&&lines[1]?.curveSegments===3&&lines[2]?.curveSegments===3);
  const bar=page.locator('#chart-margins .recharts-bar-rectangle path').first();await bar.hover();await page.locator('#chart-margins .recharts-tooltip-wrapper').waitFor({state:'visible',timeout:10000});
  const tooltip=await page.locator('#chart-margins .recharts-tooltip-wrapper').innerText();
  record(symbol+'-tooltip','Rendered annual tooltip contains operating category and omits unavailable gross',{text:tooltip},tooltip.includes('عملیاتی')&&!tooltip.includes('ناخالص'));
  await page.locator('#chart-margins').screenshot({path:folder+symbol+'-annual.png'});
 }
 record('financial-browser-isolation','Hydration succeeds without external provider requests',{pageErrors:errors,externalRequestsBlocked:external},errors.length===0&&external===0);
}catch(e){let error=String(e.message);for(const v of [c.anon,...Object.values(c.accounts).flatMap(x=>[x.email,x.password])])error=error.split(v).join('[REDACTED]');record('financial-execution','Complete affected financial UI acceptance',{error:error.replace(/eyJ[\w.-]+/g,'[REDACTED]'),path:new URL(page.url()).pathname},false)}finally{await browser.close();report.finishedAt=new Date().toISOString();report.counts=Object.fromEntries(['PASS','FAIL'].map(k=>[k,report.scenarios.filter(s=>s.status===k).length]));save();console.log(JSON.stringify({counts:report.counts}))}
