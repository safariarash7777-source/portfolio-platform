// Operator-invoked metadata export only. Fixed target, no secrets or provider fetch.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const sql=fs.readFileSync(new URL('./p02-metadata-export.sql',import.meta.url),'utf8');
if(!process.argv[2]) throw new Error('output metadata NDJSON path required');
const result=spawnSync('ssh',['-i','C:/Users/Asus/.ssh/codex-liara-portfolio','-o','BatchMode=yes','-o','ConnectTimeout=15',
 'root@62.60.191.24','docker exec -i portfolio-stage-db-1 psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres'],
 {input:sql,encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
if(result.status!==0) { console.error('Read-only export failed:',result.status,result.stderr?.slice(0,1200));process.exit(1); }
const lines=result.stdout.trim().split(/\r?\n/).map(JSON.parse);
if(lines.length!==7||lines[0].readOnly!=='on') throw new Error('Incomplete/non-read-only export');
const content=lines.map(x=>JSON.stringify(x)).join('\n')+'\n';
const output=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,content);
console.log(JSON.stringify({output,observedAt:lines[0].observedAt,readOnly:lines[0].readOnly,
 blocks:lines.map(x=>({kind:x.kind,rows:x.rows?.length??null})),bytes:Buffer.byteLength(content),
 sha256:createHash('sha256').update(content).digest('hex')}));
