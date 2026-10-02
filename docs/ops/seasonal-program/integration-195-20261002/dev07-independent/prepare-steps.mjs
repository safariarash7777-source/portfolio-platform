import fs from 'node:fs';
const old='C:/Users/Asus/Documents/ChatGPT/توسعه سایت/portfolio-v1/.task/',out='docs/ops/seasonal-program/integration-195-20261002/dev07-independent/';
for(const [from,to] of [['dev07-next-01.mjs','01'],['dev07-retest-02.mjs','02'],['dev07-retest-03.mjs','03'],['dev07-retest-market.mjs','market'],['dev07-next-14.mjs','14'],['dev07-retest-12.mjs','12'],['dev07-independent-08.mjs','13'],['dev07-next-human.mjs','human']]){
 let s=fs.readFileSync(old+from,'utf8').replaceAll('./dev07-independent-common.mjs','./common.mjs').replaceAll('فملی','DEV07_195_SYNTHETIC').replaceAll('2026-09-30','2026-10-02').replaceAll('2026-10-01','2026-10-03').replaceAll('dev07-1978-local','portfolio-accept195');
 if(to==='01'){
  s=s.replaceAll('results.baselineHoldings.body[0].version','(results.baselineHoldings.body[0]?.version??0)').replaceAll('v1.status===200&&v2.status===200','v1.status===201&&v2.status===201').replaceAll("text.includes('DEV07_SYNTHETIC')","text.includes('DEV07_195_SYNTHETIC')");
  s=s.replace('const starting=',`observe('Synthetic price fixture',{sql:sql("INSERT INTO public.symbol_history(symbol,trade_date,close,last_price,source) VALUES('DEV07_195_SYNTHETIC','2026-10-02',12000,12000,'DEV07_195_SYNTHETIC');")}); const starting=`).replace('save,accounts}','save,accounts,sql}');
  s=s.replace("await A.page.locator('select').nth(1).selectOption('equity_ir');","await A.page.getByLabel('دستهٔ دارایی',{exact:true}).selectOption('equity_ir');await A.page.getByLabel('تاریخ ثبت مقدار (میلادی)').fill('2026-10-02');");
 }
 if(to==='12')s=s.replace('h1.status===200','h1.status===201');
 if(to==='market')s=s.replace('/symbol/%D9%81%D9%85%D9%84%DB%8C','/symbol/DEV07_195_SYNTHETIC');
 if(to==='human')s=s.replaceAll('http://127.0.0.1:3210','https://62.60.191.24:8443').replaceAll('C:/Users/Asus/.codex/private/dev07-1978bf5/secrets.json','C:/Users/Asus/.codex/private/accept195-liara/reviewer.json').replaceAll('accounts.advisor','accounts.adviser').replace('/symbol/%D9%81%D9%85%D9%84%DB%8C','/symbol/DEV07_195_SYNTHETIC');
 fs.writeFileSync(out+'step-'+to+'.mjs',s);
}
console.log('Adapted reviewer automation only in new evidence folder; old evidence unchanged');
