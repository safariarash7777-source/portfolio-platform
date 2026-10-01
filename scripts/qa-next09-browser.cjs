const {chromium}=require('C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const out='docs/ops/seasonal-program/next09';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let connection={linked:false,legacyConnection:false,course:false,updates:false},empty=false,fail=false;
 const notices=[{id:'synthetic-notice',kind:'published',version:2,created_at:'2026-10-01T12:00:00Z',acknowledged:false,site_path:'/publications/synthetic',telegram_status:'accepted'}];
 await page.route('**/api/notifications**',async route=>{
  const req=route.request();if(fail)return route.fulfill({status:503,json:{error:'خطای آزمایشی دریافت'}});
  let data;if(req.method()==='POST'){
   const body=req.postDataJSON();
   if(body.action==='start')data={challengeId:'synthetic-challenge',token:'a'.repeat(64)};
   if(body.action==='confirm'){assert.equal(body.confirmation,'f'.repeat(64));connection.linked=true;}
   if(body.action==='preferences'){connection.course=body.course;connection.updates=body.updates;}
   if(body.action==='unlink')connection={linked:false,legacyConnection:false,course:false,updates:false};
   if(body.action==='acknowledge')notices[0].acknowledged=true;
  }else data=req.url().includes('view=connection')?connection:(empty?[]:notices);
  return route.fulfill({json:{data:data??null},headers:{'cache-control':'no-store'}});
 });
 await page.goto('http://127.0.0.1:8799/qa/next09',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'شروع اتصال دوطرفه'}).waitFor();
 assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
 await page.getByRole('button',{name:'شروع اتصال دوطرفه'}).click();
 await page.getByLabel('کد تأیید سمت تلگرام').fill('f'.repeat(64));
 await page.getByRole('button',{name:'تأیید نهایی اتصال'}).click();
 const course=page.getByRole('checkbox',{name:'محتوای آموزشی دوره و تغییر وضعیت آن'});await course.waitFor();assert.equal(await course.isChecked(),false);
 await course.click();await page.waitForFunction(()=>document.querySelector('input[type=checkbox]')?.checked);
 await page.getByRole('button',{name:'اعلان را دیدم'}).click();await page.getByText('مشاهده اعلان ثبت شده است.').waitFor();
 await page.screenshot({path:out+'/ui-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:out+'/ui-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'قطع اتصال و توقف اعلان تلگرام'}).click();await page.getByRole('button',{name:'شروع اتصال دوطرفه'}).waitFor();
 empty=true;await page.reload({waitUntil:'networkidle'});await page.getByText('هنوز اعلانی برای حساب شما ثبت نشده است.').waitFor();
 fail=true;await page.reload({waitUntil:'networkidle'});await page.locator('p[role=alert]').waitFor();fail=false;
 await page.getByRole('button',{name:'دریافت دوباره'}).click();await page.getByRole('button',{name:'شروع اتصال دوطرفه'}).waitFor();
 await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/browser-results.json',JSON.stringify({fixtureOnly:true,transport:'intercepted; no real bot',checks:['RTL','mobile no overflow','two-way ceremony','default opt-out','explicit preference','site acknowledgement','unlink','empty','error recovery','keyboard focus'],pageErrors:errors},null,2));
 await browser.close();console.log('NEXT09 fixture browser checks passed');
})().catch(e=>{console.error(e);process.exit(1);});
