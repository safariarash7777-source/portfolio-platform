const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const evidence=resolve('docs/ops/seasonal-program/frontend-visual-evidence');await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={at:new Date().toISOString(),environment:'own Chromium contexts; static prototype without backend',baseSha:'27e59ad8d85f37da32b6f5346d289afdb73b20e6',observations:[],prototype:[],checks:[]};
const save=async(name,page)=>{await page.screenshot({path:resolve(evidence,name+'.png'),fullPage:true});};
try{
 const context=await browser.newContext();const page=await context.newPage();
 if(process.argv.includes('--prototype-only'))report.observations=JSON.parse(await readFile(resolve(evidence,'browser-first.json'),'utf8')).observations;
 for(const [name,url] of process.argv.includes('--prototype-only')?[]:[['before-home','https://portfolio-platform-7znmezi57-safariarash7777-4463s-projects.vercel.app/'],['before-course','https://portfolio-platform-7znmezi57-safariarash7777-4463s-projects.vercel.app/webinars'],['before-consultation','https://portfolio-platform-7znmezi57-safariarash7777-4463s-projects.vercel.app/consultation'],['reference-kubera','https://www.kubera.com/wealth-tracker'],['reference-rightcapital','https://www.rightcapital.com/']]){
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});try{const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});await page.waitForTimeout(2000);await save(name+'-'+width,page);report.observations.push({name,url,finalURL:page.url(),width,http:response?.status(),...await page.evaluate(()=>({title:document.title,h1:document.querySelector('h1')?.textContent,font:getComputedStyle(document.body).fontFamily,overflow:document.documentElement.scrollWidth>innerWidth,fonts:[...document.fonts].map(f=>({family:f.family,status:f.status}))}))});}catch(error){report.observations.push({name,url,width,status:'UNKNOWN',reason:error.name});}
  }
 }
 await context.close();
 for(const font of ['a','b'])for(const width of [390,1440]){
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),p=await ctx.newPage();const requests=[],errors=[];
  p.on('request',r=>requests.push(r.url()));p.on('pageerror',e=>errors.push(e.message));
  for(const route of ['home','course','member','type','market','desk','consultation']){
   await p.goto(`http://127.0.0.1:8776/?font=${font}#${route}`,{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);await save(`${font}-${route}-${width}`,p);
   report.prototype.push({font,width,route,errors:[...errors],...await p.evaluate(()=>({h1:document.querySelector('h1')?.textContent,font:getComputedStyle(document.body).fontFamily,loaded:document.fonts.check('16px '+(document.documentElement.dataset.font==='b'?'Estedad':'Vazirmatn')),overflow:document.documentElement.scrollWidth>innerWidth,cls:window.reviewShifts.reduce((a,b)=>a+b,0),mainHeight:document.querySelector('main').getBoundingClientRect().height,smallTargets:[...document.querySelectorAll('a,button,input,select,textarea')].filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height<44&&e.className!=='skip').map(e=>({text:e.textContent.trim().slice(0,35),height:e.getBoundingClientRect().height})),externalLinks:[...document.querySelectorAll('a[href]')].filter(e=>e.hash&&!document.getElementById(e.hash.slice(1))&&e.hash!=='#main').map(e=>e.hash)}))});
  }
  report.checks.push({name:'font requests',font,width,fonts:[...new Set(requests.filter(u=>u.endsWith('.woff2')))],pageErrors:errors});
  if(width===390){
   for(const state of ['empty','error','expired','incomplete','stale','revoked','unknown','two']){await p.goto(`http://127.0.0.1:8776/?font=${font}&state=${state}#member`,{waitUntil:'networkidle'});await save(`${font}-member-${state}-${width}`,p);report.checks.push({name:'member state',font,state,overflow:await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),privateRequests:requests.filter(u=>u.includes('/api/'))});}
  }
  await p.goto(`http://127.0.0.1:8776/?font=${font}#type`,{waitUntil:'networkidle'});await p.locator('#sample-goal').fill('متن آزمایشی حفظ شود');await p.locator('#sample-error').click();report.checks.push({name:'form error retains input and focuses field',font,width,pass:(await p.locator('#sample-goal').inputValue())==='متن آزمایشی حفظ شود'&&await p.locator('#sample-goal').evaluate(e=>e===document.activeElement)});
  await p.goto(`http://127.0.0.1:8776/?font=${font}&keyboard=fresh#home`,{waitUntil:'networkidle'});await p.keyboard.press('Tab');report.checks.push({name:'keyboard skip',font,width,pass:await p.evaluate(()=>document.activeElement.className==='skip'&&getComputedStyle(document.activeElement).outlineStyle!=='none')});await p.keyboard.press('Enter');report.checks.push({name:'skip target',font,width,pass:await p.evaluate(()=>document.activeElement.id==='main')});
  await p.evaluate(()=>document.documentElement.style.fontSize='32px');await p.waitForTimeout(300);await save(`${font}-text-zoom-${width}`,p);report.checks.push({name:'200 percent root text scaling (emulated, not browser zoom)',font,width,overflow:await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  await ctx.close();
 }
}finally{await browser.close();await writeFile(resolve(evidence,'browser.json'),JSON.stringify(report,null,2));const errors=report.prototype.filter(r=>r.errors.length||r.overflow||r.smallTargets.length),failures=report.checks.filter(r=>r.pass===false||r.overflow);if(errors.length||failures.length)process.exitCode=1;console.log(JSON.stringify({observations:report.observations.length,prototype:report.prototype.length,checks:report.checks.length,errors,failures}));}
