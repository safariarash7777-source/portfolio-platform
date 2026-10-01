import fs from 'node:fs';import {createHash} from 'node:crypto';
const out='docs/ops/seasonal-program/followup-06-auth-storage-evidence/',p=out+'independent.md';let s=fs.readFileSync(p,'utf8');
s=s.replace(/\b(HTTP|Storage|PostgREST|Postgres|across|return|token|user|list|download|REST|RPC|native|Expected|expected|path|resource|command|and|both|TTL|A|guest|revoke|still|all|versions|returned|at|contains|contain|asset|debt|net|were|advertised|matched|records)(?=\d)/g,'$1 ');
s=s.replaceAll('signedURL','signed URL').replaceAll('providerTTL','provider TTL').replaceAll('RPCallowed','RPC allowed').replaceAll('listzero','list zero').replaceAll('moduleallowed','module allowed').replaceAll('exact36','exact 36').replaceAll('digest773','digest 773').replaceAll('seconds(HTTP','seconds (HTTP').replaceAll('warning(PORTFOLIO_TARGET)','warning (PORTFOLIO_TARGET)').replaceAll('API(200)','API (200)').replaceAll('PR173','PR 173');
const r=JSON.parse(fs.readFileSync(out+'independent.json'));
s=s.split('\n').map(line=>{const id=line.match(/^\| (ledger-preserved-\w+) \|/)?.[1];return id?line.replace('Initial premature text check is retained as a harness observation.','Initial premature text check is retained as a harness observation. UI recheck: '+r.scenarios.find(x=>x.id===id).observed.UIFollowup.at+'.'):line}).join('\n');
fs.writeFileSync(p,s);
const files=['independent.md','independent.json','independent-attempt-01.json','independent-ui-followup.json'];const hashes=files.map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(out+file)).digest('hex')}));
for(const file of files){const text=fs.readFileSync(out+file,'utf8');if(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(text)||/[?&]token=/.test(text))throw Error('Sensitive token pattern in evidence')}
console.log(JSON.stringify({hashes,redactedTokenPatternCheck:'PASS'}));
