const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const browser=await chromium.launch({channel:'chrome',headless:true});
const rows=[],base='https://portfolio-platform-7znmezi57-safariarash7777-4463s-projects.vercel.app';
try{const page=await browser.newPage();for(const route of ['/login','/dashboard','/admin/desk','/market','/market/funds','/symbol/'+encodeURIComponent('فملی')])for(const width of [390,1440]){
 await page.setViewportSize({width,height:900});const label=route.split('/')[1]==='symbol'?'symbol':route.replaceAll('/','-').slice(1);
 try{const r=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:16000});await page.waitForTimeout(1800);const gate=page.url().includes('/login');const h1=await page.locator('h1').allTextContents();await page.screenshot({path:resolve('docs/ops/seasonal-program/frontend-visual-evidence',`before-${label}-${width}.png`),fullPage:true});rows.push({route,width,http:r?.status(),url:page.url(),h1,protectedUI:route.startsWith('/admin')||route==='/dashboard'?gate?'UNKNOWN behind login':'UNKNOWN no authenticated owner context':'not applicable',overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});}catch(error){rows.push({route,width,status:'UNKNOWN',reason:error.name});}
 }}finally{await browser.close();await writeFile(resolve('docs/ops/seasonal-program/frontend-visual-evidence/before-additional.json'),JSON.stringify({at:new Date().toISOString(),sha:'27e59ad8d85f37da32b6f5346d289afdb73b20e6',session:'anonymous own Chromium; no authentication or credentials',rows},null,2));console.log(JSON.stringify(rows));}
