/** Run the isolated SQL harness, then validate its fresh emitted receipts with TypeScript. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const args=process.argv.slice(2);
assert.ok(args.length===0||(args.length===1&&args[0]==='--ci-local'),'Unsupported test transport');
const run=spawnSync(process.execPath,['scripts/testing/consultation-replies/run.mjs',...args],{cwd:root,encoding:'utf8',timeout:900000,maxBuffer:8*1024*1024});
process.stdout.write(run.stdout??'');process.stderr.write(run.stderr??'');
if(run.error)throw run.error;
if(run.status!==0)process.exit(run.status??1);
const directory=mkdtempSync(join(tmpdir(),'advisor-reply-sql-')),path=join(directory,'synthetic.log');
try{
 writeFileSync(path,run.stdout,'utf8');
 const check=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/testing/consultation-replies/validate-fixtures.ts',path],{cwd:root,stdio:'inherit',timeout:30000});
 if(check.error)throw check.error;
 process.exitCode=check.status??1;
}finally{unlinkSync(path);rmdirSync(directory);}
