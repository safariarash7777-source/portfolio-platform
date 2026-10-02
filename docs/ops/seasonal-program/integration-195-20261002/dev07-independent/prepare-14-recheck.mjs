import fs from 'node:fs';const out='docs/ops/seasonal-program/integration-195-20261002/dev07-independent/';let s=fs.readFileSync(out+'step-14.mjs','utf8');
s=s.replace("const A=await browser('A')","results.initialServiceFaultMeasurement=results.scenarios[14];save();const A=await browser('A')");
s=s.replace("uiUnit.sample.includes('ارزش: در دسترس نیست')","(uiUnit.sample.match(/ارزش سهم شما: نامعلوم/g)??[]).length>=3");
s=s.replace("const latest=await rest(A.page,","observe('Pricing fixture native read after installation repair',await rest(A.page,'symbol_history?select=symbol,trade_date,close,source'));const latest=await rest(A.page,");
fs.writeFileSync(out+'step-14-recheck.mjs',s);
