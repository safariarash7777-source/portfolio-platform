const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import {writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const browser=await chromium.launch({channel:'chrome',headless:true});
const output={at:new Date().toISOString(),checks:[],reference:[]};
const record=(name,pass,details={})=>output.checks.push({name,pass,...details});
try{
 for(const font of ['a','b']){
  const ctx=await browser.newContext({viewport:{width:390,height:900}}),page=await ctx.newPage();
  await page.route('**/*.woff2',async route=>{await new Promise(r=>setTimeout(r,700));await route.continue();});
  await page.goto(`http://127.0.0.1:8776/?font=${font}&cold=1#home`,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
  const cls=await page.evaluate(()=>window.reviewShifts.reduce((a,b)=>a+b,0));const loaded=await page.evaluate(()=>document.fonts.check('16px '+(document.documentElement.dataset.font==='b'?'Estedad':'Vazirmatn')));record('Cold font + 700ms delay',loaded,{font,cls,notCoreWebVitalsCertification:true});
  await page.getByRole('link',{name:'وبینار دورهٔ پیش‌رو',exact:true}).click();record('Home -> course focus and registration disabled',await page.locator('h1').innerText()==='وبینار و سه ماه همراهی'&&await page.getByRole('button',{name:'ثبت‌نام هنوز باز نشده'}).isDisabled()&&await page.locator('main').evaluate(e=>e===document.activeElement),{font});
  await page.locator('.skip').focus();await page.keyboard.press('Enter');record('Skip on course preserves route',page.url().endsWith('#course')&&await page.locator('main').evaluate(e=>e===document.activeElement),{font});
  await page.getByRole('link',{name:'بررسی نمونهٔ حساب',exact:true}).click();await page.getByRole('link',{name:'نیازسنجی آموزشی',exact:true}).click();await page.locator('#goal').fill('فهم تفاوت صندوق‌ها');await page.locator('#question').fill('پرسش آزمایشی');await page.getByRole('button',{name:'ذخیرهٔ محلی نمونه'}).click();await page.reload();record('Needs assessment reload/edit (local demo only)',await page.locator('#goal').inputValue()==='فهم تفاوت صندوق‌ها',{font});
  await page.goto(`http://127.0.0.1:8776/?font=${font}#consultation`);await page.locator('#contact-email').fill('test@example.invalid');await page.getByRole('button',{name:'ثبت نمونهٔ درخواست'}).click();record('Consultation demo receipt explicitly no reservation',await page.locator('#contact-status').innerText()==='نمونهٔ درخواست دریافت شد؛ ارسال واقعی و رزرو جلسه انجام نشد.',{font});
  await page.goto(`http://127.0.0.1:8776/?font=${font}#type`);await page.evaluate(()=>document.fonts.ready);
  const metrics=await page.evaluate(()=>{
   const samples=['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];const spans=samples.map(text=>{const span=document.createElement('span');span.textContent=text;span.style.cssText='display:inline-block;font-variant-numeric:tabular-nums;font-size:16px';document.body.append(span);return span;});const widths=spans.map(e=>e.getBoundingClientRect().width);spans.forEach(e=>e.remove());return {digitWidths:widths,spread:Math.max(...widths)-Math.min(...widths),body:getComputedStyle(document.body).fontFamily};
  });record('Persian numeric width under tabular-nums',metrics.spread<.05,{font,...metrics});
  const table=page.locator('.table-wrap');await table.focus();const initial=await table.evaluate(e=>e.scrollLeft);await page.keyboard.press('ArrowLeft');await page.waitForTimeout(200);record('Mobile table keyboard scroll',await table.evaluate(e=>e.scrollLeft)!==initial,{font});
  await ctx.close();
 }
 if(process.argv.includes('--local-only'))output.reference=JSON.parse(await readFile(resolve('docs/ops/seasonal-program/frontend-visual-evidence/boundaries.json'),'utf8')).reference;
 const p=await browser.newPage();
 for(const width of process.argv.includes('--local-only')?[]:[390,1440]){await p.setViewportSize({width,height:900});try{const r=await p.goto('https://www.monarch.com/',{waitUntil:'domcontentloaded',timeout:20000});await p.waitForTimeout(2000);await p.screenshot({path:resolve('docs/ops/seasonal-program/frontend-visual-evidence',`reference-monarch-${width}.png`),fullPage:true});output.reference.push({url:p.url(),width,http:r?.status(),h1:await p.locator('h1').first().textContent()});}catch(error){output.reference.push({url:'https://www.monarch.com/',width,status:'UNKNOWN',reason:error.name});}}
}finally{
 await browser.close();const luminance=hex=>{const c=hex.match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 for(const [label,fg,bg] of [['body','0F172A','F8F7F4'],['muted','556274','FFFFFF'],['gold ink','7A5A08','F8F7F4'],['gold light/navy','F5D07A','0D1F4A'],['action','FFFFFF','1E3A8A'],['error','B91C1C','F2F0E8'],['active','157038','F2F0E8']]){const x=luminance(fg),y=luminance(bg),ratio=(Math.max(x,y)+.05)/(Math.min(x,y)+.05);record('Text contrast '+label,ratio>=4.5,{foreground:'#'+fg,background:'#'+bg,ratio});}
 await writeFile(resolve('docs/ops/seasonal-program/frontend-visual-evidence/boundaries.json'),JSON.stringify(output,null,2));if(output.checks.some(check=>check.pass===false))process.exitCode=1;console.log(JSON.stringify(output));
}
