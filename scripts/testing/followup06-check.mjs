import fs from 'node:fs'; import cp from 'node:child_process'; import path from 'node:path'; import {pathToFileURL} from 'node:url';
const folder='docs/ops/seasonal-program/followup-06-evidence/';
const resultsFile=folder+'checks-'+process.argv[2]+'.json'; const rows=fs.existsSync(resultsFile)?JSON.parse(fs.readFileSync(resultsFile)): [];
const pkg=JSON.parse(fs.readFileSync('package.json'));
const env={...process.env,PATH:path.dirname(process.execPath)+';'+process.env.PATH,NEXT_TELEMETRY_DISABLED:'1',
 NEXT_PUBLIC_LIARA_API_URL:'',NEXT_PUBLIC_LIARA_ANON_KEY:'',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3299',NEXT_PUBLIC_SUPABASE_ANON_KEY:'dev07-synthetic-placeholder',
 SUPABASE_SERVICE_ROLE_KEY:'',BRSAPI_KEY:'',BRSAPI_AIO_KEY:'',IR_MARKET_RELAY_TOKEN:'',TEST_POSTGRES_CONTAINER:'',
 NODE_OPTIONS:'--import='+pathToFileURL(path.resolve('scripts/testing/followup06-transport.mjs')).href,
 BRSAPI_BUDGET_TEST_ISOLATED:'1',BRSAPI_BUDGET_TEST_CONTAINER:'liara-budget-test-followup06-20261001',PGHOST:'127.0.0.1',CI:'true',SKIP_LIVE:'1'};
function run(name,args) {
 const startedAt=new Date().toISOString();const log=fs.openSync(folder+name+'.log','w');
 const r=cp.spawnSync(process.execPath,args,{env,stdio:['ignore',log,log],timeout:360000});
 fs.closeSync(log);const body=fs.readFileSync(folder+name+'.log','utf8');
 const row={name,sha:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),startedAt,finishedAt:new Date().toISOString(),exitCode:r.status,error:r.error?.message,
 pass:Number(body.match(/^(?:#|ℹ) pass (\d+)/m)?.[1]??0),fail:Number(body.match(/^(?:#|ℹ) fail (\d+)/m)?.[1]??0),skipped:Number(body.match(/^(?:#|ℹ) skipped (\d+)/m)?.[1]??0),log:folder+name+'.log',
 kind:'isolated synthetic regression; no real Auth acceptance'};
 rows.push(row);fs.writeFileSync(resultsFile,JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(row));if(r.status!==0)process.exitCode=1;
}
const mode=process.argv[2];
if(mode==='quality'||mode==='quality-rest'){ if(mode==='quality') {
 for(const key of ['test:core','test:calc'])run(key.replace(':','-'),['node_modules/tsx/dist/cli.mjs',...pkg.scripts[key].split(' ').slice(1)]);
 } run('test-public',['node_modules/tsx/dist/cli.mjs',...pkg.scripts['test:public'].split(' ').slice(1)]);
 run('typecheck',['node_modules/typescript/bin/tsc','--noEmit']);
 run('lint',['node_modules/eslint/bin/eslint.js','.','--max-warnings=0']);
 run('build',['node_modules/next/dist/bin/next','build']);
}else if(mode==='db'){
 run('db-financial-consultation',['node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','lib/portfolio/holdings.integration.test.ts','lib/portfolio/balanceSheet.integration.test.ts','lib/consultation/consultation.integration.test.ts']);
 run('db-seasonal',['node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','lib/seasonal/seasonal.integration.test.ts']);
 run('db-publication',['node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','lib/intelligence/publication.integration.test.ts']);
 run('db-budget',['--test','relay/brsapi-budget.integration.test.mjs']);
}else if(mode==='relay'){
 for(const [i,part] of pkg.scripts['test:relay'].split(/\s*&&\s*/).entries()){
 const args=part.includes('--eval')?['--input-type=module','--eval',"process.env.SKIP_LIVE='1'; await import('./relay/codal-engine.test.mjs')"]:part.split(/\s+/).slice(1);
 run('relay-'+i,args);
 }
}else throw Error('unknown mode');
