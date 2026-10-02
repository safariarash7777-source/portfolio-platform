import fs from 'node:fs';const out='docs/ops/seasonal-program/integration-195-20261002/dev07-independent/';
fs.copyFileSync(out+'results.json',out+'results-initial-stage.json');
let s=fs.readFileSync(out+'step-03.mjs','utf8');
s=s.replace("await goto(D.page,'/dashboard/consultation?relation='+rel);await D.page.getByLabel('تاریخ", "await goto(D.page,'/dashboard/consultation?relation='+rel);let session;if(!results.ids.session1){await D.page.getByLabel('تاریخ");
s=s.replace("const session=await uiPost(D.page,'ذخیرهٔ نسخهٔ جلسه');observe('Advisor UI session v1',session);let dd=await get(D.page);", "session=await uiPost(D.page,'ذخیرهٔ نسخهٔ جلسه');observe('Advisor UI session v1',session);}else{session=results.observations.find(o=>o.label==='Advisor UI session v1').data;observe('Existing independently created session reloaded in new LA UI context',{originalHTTP:session.status,id:results.ids.session1});}let dd=await get(D.page);");
s=s.replace("const cdp=await D.context.newCDPSession(D.page);await cdp.send('Emulation.setTimezoneOverride',{timezoneId:'America/Los_Angeles'});",'');
fs.writeFileSync(out+'step-03-resume.mjs',s);
