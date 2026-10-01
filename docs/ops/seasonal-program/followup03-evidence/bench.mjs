import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const phase=process.argv[2]??'baseline';
const tasks=['data','market'].flatMap(mode=>Array.from({length:20},()=>mode));
const samples=[];
async function worker(){while(tasks.length){const mode=tasks.shift();const row=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','docs/ops/seasonal-program/followup03-evidence/bench-sample.mjs',mode,phase],{env:{...process.env,NODE_OPTIONS:'--conditions=react-server'}});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('exit',code=>code?reject(new Error(err)):resolve(JSON.parse(out.trim())));});samples.push(row);}}
await Promise.all([worker(),worker()]);
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.ceil(a.length*p)-1];
const summarize=mode=>{const s=samples.filter(x=>x.mode===mode);const cold=s.map(x=>x.cold.ms),warm=s.flatMap(x=>x.warm.map(y=>y.ms));return {cold:{n:cold.length,p50:percentile(cold,.5),p95:percentile(cold,.95)},warm:{n:warm.length,p50:percentile(warm,.5),p95:percentile(warm,.95)},counts:s[0].counts,network:s[0].network,parallelWorkers:2};};
const result={phase,at:new Date().toISOString(),summary:{data:summarize('data'),market:summarize('market')},samples};
await writeFile(`docs/ops/seasonal-program/followup03-evidence/${phase}.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.summary));
