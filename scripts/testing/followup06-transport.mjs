import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
const own='liara-budget-test-followup06-20261001';
const aliases=new Set(['portfolio-next04-synthetic-db','portfolio-next08-synthetic-db',own]);
const original={execFileSync:cp.execFileSync,spawnSync:cp.spawnSync,spawn:cp.spawn,execFile:cp.execFile};
function route(file,args,options={}) {
 let a=[...args], input;
 if(file==='psql') a=['exec','-i',own,'psql','-U','postgres',...a],file='docker';
 else if(file==='docker') {
  const index=a.findIndex(v=>aliases.has(v)); if(index>=0)a[index]=own;
  if(['exec','stop','start','inspect'].includes(a[0]) && !a.includes(own))throw Error('Refuse Docker operation outside FOLLOWUP06');
 }
 if(file==='docker' && a.includes('psql')) {
  const f=a.indexOf('-f');
  if(f>=0) {
   let p=a[f+1]; if(p.startsWith('/workspace/'))p=path.join(process.cwd(),p.slice(11));
   input=fs.readFileSync(p);
   a.splice(f,2); if(!a.includes('-i'))a.splice(1,0,'-i');
  }
 }
 const opt={...options}; if(input!==undefined){opt.input=input;if(Array.isArray(opt.stdio))opt.stdio=['pipe',...opt.stdio.slice(1)];}
 return {file,args:a,opt,input};
}
cp.execFileSync=(f,a,o)=>{const r=route(f,a,o);return original.execFileSync(r.file,r.args,r.opt);};
cp.spawnSync=(f,a,o)=>{const r=route(f,a,o);return original.spawnSync(r.file,r.args,r.opt);};
cp.spawn=(f,a,o)=>{const r=route(f,a,o);const p=original.spawn(r.file,r.args,r.opt);if(r.input!==undefined)p.stdin.end(r.input);return p;};
cp.execFile=(f,a,o,callback)=>{const r=route(f,a,o);const p=original.execFile(r.file,r.args,r.opt,callback);if(r.input!==undefined)p.stdin.end(r.input);return p;};
syncBuiltinESMExports();
