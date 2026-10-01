import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {initialize} from './independent-core.mjs';
const t=await initialize('market-cold',{browserNeeded:false}),{record,origin,privateDir,evidence}=t;
// Root must restart ONLY the owned Next3398 process after the reviewer sets
// fixture db=hang/world=ready. No page/login/market warmup is allowed before this.
// Runtime gate requires --run-sha plus --cold-ready after root's recorded handoff.
if(!process.argv.includes('--cold-ready'))throw Error('Cold acceptance requires witnessed owned Next process restart readiness');
const clock=offset=>fs.writeFileSync(privateDir+'/clock.txt',String(offset));
const control=async fields=>fetch('http://127.0.0.1:15913/control?'+new URLSearchParams(fields)).then(r=>r.json());
const request=async()=>{const start=performance.now(),r=await fetch(origin+'/api/market?diag=1',{signal:AbortSignal.timeout(12000)}),body=await r.json();return {http:r.status,ms:+(performance.now()-start).toFixed(2),body};};
try{
 clock(0);t.fault({});
 const r=await request();
 evidence.firstColdObservation={http:r.http,ms:r.ms,iranIsNull:r.body.ir===null,iranAvailability:r.body.availability?.iran,globalAvailability:r.body.availability?.global,cryptoRows:r.body.crypto?.length,partial:r.body.partial};t.save();
 await control({db:'ready',world:'ready',analytics:'ready'});clock(65001);const recovery=await request();
 record('cold-iran-hung-null-and-explicit-recovery',['anonymous public'],'First request after witnessed owned process restart: hung Iran ends at budget with null/timeout and null sourceAt; global remains healthy. Restore fixture/cooldown and complete Iran board returns',{cold:evidence.firstColdObservation,recovery:{http:recovery.http,ms:recovery.ms,stocks:recovery.body.ir?.stocks?.length,funds:recovery.body.ir?.funds?.length,iranAvailability:recovery.body.availability?.iran,partial:recovery.body.partial}},r.http===200&&r.ms<6200&&r.body.ir===null&&r.body.availability?.iran?.state==='timeout'&&r.body.availability?.iran?.sourceAt===null&&r.body.availability?.global?.state==='ready'&&r.body.crypto?.length===1&&r.body.partial===true&&recovery.http===200&&recovery.body.ir?.stocks.length===760&&recovery.body.ir?.funds.length===333&&recovery.body.availability?.iran?.state==='ready','187/cold source truthfulness');
 evidence.processRestart='Witnessed root-owned Next3398 restart; same immutable build; see root environment recovery evidence';
}catch(e){t.fail(e);}finally{clock(0);await control({db:'ready',world:'ready',analytics:'ready',pageMs:'40'}).catch(()=>null);await t.finish();}
