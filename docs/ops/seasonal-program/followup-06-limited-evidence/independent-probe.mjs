import fs from 'node:fs';
import {chromium} from 'file:///C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='C:/Users/Asus/Documents/ChatGPT/توسعه سایت/portfolio-followup06-limited/docs/ops/seasonal-program/followup-06-limited-evidence/';
const accounts=JSON.parse(fs.readFileSync('C:/Users/Asus/.codex/private/followup06-auth-storage/reviewer-credentials.json'));
const manifest=JSON.parse(fs.readFileSync(root+'app-manifest.json')),origin=manifest.origin;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-first-run']});
const context=await browser.newContext(),page=await context.newPage(),responses=[];
page.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&!u.pathname.includes('_next'))responses.push({path:u.pathname,http:r.status()});});
const evidence={sha:manifest.sha,environment:manifest.environment,startedAt:new Date().toISOString(),role:'A',responses};
try{
 await page.goto(origin+'/login?next=%2Fdashboard%2Fholdings',{waitUntil:'domcontentloaded'});
 await page.locator('#login-email').fill(accounts.A.email);await page.locator('#login-password').fill(accounts.A.password);
 const pending=page.waitForResponse(r=>r.url().includes('/supabase/auth/v1/token')&&r.request().method()==='POST');
 await page.locator('button[type="submit"]').click();const tokenResponse=await pending,b=await tokenResponse.json();
 evidence.tokenHTTP=tokenResponse.status();evidence.tokenPresent=!!b.access_token;evidence.canonicalUserId=b.user?.id;
 await page.waitForTimeout(10000);
 evidence.currentPath=new URL(page.url()).pathname;evidence.currentQuery=new URL(page.url()).search;
 evidence.visibleText=(await page.locator('body').innerText()).replaceAll(accounts.A.email,'[email omitted]');
 evidence.cookieNames=(await context.cookies()).map(x=>({name:x.name,path:x.path,sameSite:x.sameSite}));
 const identity=await context.request.get(origin+'/api/auth/identity');evidence.identityHTTP=identity.status();
}catch(e){evidence.error=String(e.message);}
finally{evidence.finishedAt=new Date().toISOString();fs.writeFileSync(root+'independent-login-probe.json',JSON.stringify(evidence,null,2)+'\n');await browser.close();console.log(JSON.stringify(evidence));}
