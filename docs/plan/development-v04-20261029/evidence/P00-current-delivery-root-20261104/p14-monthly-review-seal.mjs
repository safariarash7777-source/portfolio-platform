import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../start-a-finance-v04-20261029'),sha=b=>createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(readFileSync(path.join(here,'baseline.json')));
for(const f of baseline.files){assert.equal(sha(readFileSync(path.join(here,'source',f.path))),f.sha256);assert.equal(sha(execFileSync('git',['show',`${baseline.base}:${f.path}`],{cwd:repo})),f.sha256);}
const unchanged=['components/symbol/MonthlySalesCharts.tsx','components/symbol/MonthlyPointSourceLabel.tsx','components/symbol/monthly-point-provenance.ts','components/symbol/MeasuredResponsiveContainer.tsx','lib/core/monthlyReport.ts'];
for(const f of unchanged)assert.equal(sha(execFileSync('git',['show',`4e4765b:${f}`],{cwd:repo})),sha(readFileSync(path.join(here,'source',f))),f);
const library=['package.json','lib/state/store.js','lib/state/keyboardEventsMiddleware.js','lib/state/mouseEventsMiddleware.js','lib/state/selectors/axisSelectors.js','lib/state/selectors/selectors.js','lib/state/selectors/tooltipSelectors.js','lib/util/getRelativeCoordinate.js','lib/component/Tooltip.js'];
writeFileSync(path.join(here,'library-evidence.json'),JSON.stringify(library.map(p=>({path:p,sha256:sha(readFileSync(path.join(repo,'node_modules/recharts',p)))})),null,2)+'\n');
const log=readFileSync(path.join(here,'probe-first.log'),'utf8');assert.match(log,/PASS 5 selection\/visibility cases/);assert.match(log,/"network":0,"childProcess":0/);
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:repo}).toString().trim(),status=execFileSync('git',['status','--porcelain'],{cwd:repo}).toString();assert.equal(head,'5fe459f5cf61a5cb7c01a70c23ba86270191c2ec');assert.equal(status,'');
const names=readdirSync(here,{recursive:true,withFileTypes:true}).filter(f=>f.isFile()).map(f=>path.join(f.parentPath??f.path,f.name)).filter(p=>!p.endsWith('manifest.json'));
const result={status:'OFFLINE_REVIEW_NO_PRODUCT_PATCH_LIVE_UNCONFIRMED',base:baseline.base,unchangedSinceAccepted4e:unchanged,offlineCasesPassed:5,productFilesChanged:0,browserAcceptance:false,checkoutHead:head,checkoutStatus:status,files:names.map(p=>({path:path.relative(here,p).replaceAll('\\','/'),sha256:sha(readFileSync(p))})).sort((a,b)=>a.path.localeCompare(b.path))};
writeFileSync(path.join(here,'manifest.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({manifestSha256:sha(readFileSync(path.join(here,'manifest.json'))),files:result.files.length,productFilesChanged:0}));
