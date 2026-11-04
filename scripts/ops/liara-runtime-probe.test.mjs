import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {FIXED_PROBE_SOURCE,PROBE_FILE_NAMES} from './liara-runtime-probe-command.mjs';
import {inspectRuntime} from './liara-runtime-probe.mjs';
const secret='NEVER_EMIT_PRIVATE_VALUE', nonce='a'.repeat(32),id='b'.repeat(24);
const result=()=>({version:1,nonce,state:'binding_unresolved',collector:'unresolved',initialBackendMatch:null,files:[]});
// Test-only source evaluation; shipped module has no switch to open its gate.
function offlineProtocol(){
  const s=readFileSync(new URL('./liara-runtime-probe.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','').replace('const BINDING_ADOPTED = false','const BINDING_ADOPTED = true').replace('},15000)', '},20)');
  const c=vm.createContext({createHash,FIXED_PROBE_SOURCE,PROBE_FILE_NAMES,Buffer,URL,URLSearchParams,TextDecoder,AbortController,setTimeout,clearTimeout});vm.runInContext(s,c);return vm.runInContext('inspectRuntime',c);
}
async function fixture(mode='ok'){
  let gets=0,connections=0,starts=0;
  const out=await offlineProtocol()({token:secret,nonce,fetchImpl:async(url,init)=>{
    gets++;assert.equal(url,'https://api.liara.ir/v1/projects/arsadata/releases?page=1&count=100');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
    if(mode==='get-stall' || (mode==='post-stall' && gets===2))return new Promise(()=>{});
    if(mode==='http')return new Response(secret,{status:403});
    if(mode==='body-limit')return new Response('x'.repeat(1048577));
    const current=mode==='changed'&&gets===2?'c'.repeat(24):id;
    return Response.json({currentRelease:current,releases:[{_id:current,state:'READY'}]});
  },connect:url=>{
    connections++;const u=new URL(url);assert.equal(u.origin,'wss://api.iran.liara.ir');assert.equal(u.searchParams.get('project_id'),'arsadata');assert.equal(u.searchParams.get('token'),secret);assert.equal(u.searchParams.get('cmd').includes(secret),false);
    const sock=new EventEmitter();sock.close=()=>{};
    sock.send=value=>{starts++;assert.deepEqual(JSON.parse(value),{action:'start',cols:80,rows:24});queueMicrotask(()=>{
      if(mode==='stall')return;
      if(mode==='close-empty'){sock.emit('close',1000);return;}
      let raw=JSON.stringify(result());
      if(mode==='nonce')raw=raw.replace(nonce,'d'.repeat(32));
      if(mode==='duplicate-key')raw=raw.replace('"version":1','"version":1,"version":1');
      if(mode==='private-field')raw=raw.replace('"version":1','"version":1,"private":"'+secret+'"');
      if(mode==='ansi')raw='\u001b[0m'+raw;
      if(mode==='oversize')raw='x'.repeat(8193);
      sock.emit('message',raw);
      if(mode==='extra')sock.emit('message',raw);
      if(mode==='error')sock.emit('error',Error(secret));
      sock.emit('close',mode==='unclean'?1006:1000);
    });};queueMicrotask(()=>sock.emit('open'));return sock;
  }});
  assert.equal(JSON.stringify(out).includes(secret),false);return {out,gets,connections,starts};
}
test('closed shipped gate invokes zero transports even with caller options',async()=>{
  let calls=0;const out=await inspectRuntime({token:secret,nonce,fetchImpl:()=>{calls++;},connect:()=>{calls++;},binding:{cwd:'/invented'},command:'arbitrary'});assert.equal(out.state,'binding_not_adopted');assert.equal(calls,0);
});
test('offline protocol uses two reads, one socket and one START',async()=>{const r=await fixture();assert.equal(r.out.state,'unresolved');assert.equal(r.gets,2);assert.equal(r.connections,1);assert.equal(r.starts,1);});
test('bad frames, replay, close/error and changed identity fail closed',async()=>{
  for(const mode of ['nonce','duplicate-key','private-field','ansi','oversize','extra','error','close-empty','unclean','changed','http','body-limit']){const r=await fixture(mode);assert.equal(r.out.state,'protocol_rejected',mode);assert.ok(r.connections<=1);assert.ok(r.gets<=2);assert.ok(r.starts<=1);}
});
test('deadline includes stalled GET and socket completion, no retry',async()=>{for(const mode of ['get-stall','stall']){const r=await fixture(mode);assert.ok(['deadline','protocol_rejected'].includes(r.out.state));assert.ok(r.connections<=1);assert.ok(r.gets<=1);}});
function commandContext(fake){
  let output='';const c=vm.createContext({require:name=>{if(name==='node:fs')return fake;if(name==='node:crypto')return {createHash};throw Error('forbidden');},Buffer,process:{argv:['node',nonce],stdout:{write:x=>{output+=x;}}}});vm.runInContext(FIXED_PROBE_SOURCE,c);return {c,output};
}
test('fixed unresolved command is inert without touching filesystem',()=>{const {output}=commandContext(new Proxy({},{get(){throw Error('filesystem touched');}}));assert.equal(JSON.parse(output).state,'binding_unresolved');assert.equal(output.includes(secret),false);});
function filesystem(mode='ok'){
  const data=Buffer.from('code'),stat={isFile:()=>true,size:4,dev:1,ino:1,mtimeMs:1,ctimeMs:1};let offset=0,stats=0,closed=0;
  return {constants:{O_RDONLY:0,O_NOFOLLOW:131072},openSync:(_path,flags)=>{assert.equal(flags,131072);if(mode==='symlink')throw Error(secret);offset=0;return 1;},fstatSync:()=>{stats++;return {...stat,isFile:()=>mode!=='directory',size:mode==='oversize'?100:4,ino:mode==='drift'&&stats>1?2:1};},readSync:(_fd,b,n,len)=>{const count=Math.min(len,data.length-offset);data.copy(b,n,offset,offset+count);offset+=count;return count;},closeSync:()=>{closed++;},get closed(){return closed;}};
}
test('bounded read rejects symlink/nonregular/oversize/stat drift and closes fd',()=>{for(const mode of ['ok','symlink','directory','oversize','drift']){const f=filesystem(mode),{c}=commandContext(f);c.file='/fixed/code';if(mode==='ok')assert.equal(vm.runInContext('boundedRead(file,8).toString()',c),'code');else assert.throws(()=>vm.runInContext('boundedRead(file,8)',c));assert.equal(f.closed,mode==='symlink'?0:1);}});
test('zero/multiple matching processes do not read environment or code',()=>{for(const n of [0,2]){const f=filesystem();f.realpathSync=p=>p;f.readdirSync=()=>Array.from({length:n},(_,i)=>String(i+1));f.readlinkSync=p=>p.endsWith('/exe')?'/fixed/node':'/fixed';const {c}=commandContext(f);c.frozen={cwd:'/fixed',exe:'/fixed/node',argv:['code']};const r=vm.runInContext('inspect(frozen)',c);assert.equal(r.collector,n?'multiple':'zero');assert.equal(r.files.length,0);}});
test('deadline also covers postidentity; clean socket closure is not final acceptance',async()=>{const r=await fixture('post-stall');assert.ok(['deadline','protocol_rejected'].includes(r.out.state));assert.equal(r.gets,2);assert.equal(r.connections,1);});
test('one fixture process yields only approved code hashes and initial environment predicate',()=>{
  for(const duplicate of [false,true]) {
    const opened=[],handles=new Map();let next=0;
    const fake={constants:{O_RDONLY:0,O_NOFOLLOW:131072},realpathSync:p=>p,readdirSync:()=>['9'],readlinkSync:p=>p.endsWith('/exe')?'/fixed/node':'/fixed',
      openSync:(p,flags)=>{assert.equal(flags,131072);opened.push(p);let content;
        if(p.endsWith('/cmdline'))content='node\0server.mjs\0';
        else if(p.endsWith('/stat'))content='9 (node) '+Array.from({length:20},(_,i)=>i===19?'123':'0').join(' ');
        else if(p.endsWith('/environ'))content='SECRET='+secret+'\0SUPABASE_URL=https://62.60.191.24/liara-preview\0'+(duplicate?'SUPABASE_URL=other\0':'');
        else {assert.ok(PROBE_FILE_NAMES.includes(p.slice('/fixed/'.length)));content='reviewed code';}
        const id=++next;handles.set(id,{data:Buffer.from(content),offset:0});return id;},
      fstatSync:id=>({isFile:()=>true,size:handles.get(id).data.length,dev:1,ino:id,mtimeMs:1,ctimeMs:1}),
      readSync:(id,buf,n,len)=>{const h=handles.get(id),count=Math.min(len,h.data.length-h.offset);h.data.copy(buf,n,h.offset,h.offset+count);h.offset+=count;return count;},closeSync:id=>handles.delete(id)};
    const {c}=commandContext(fake);c.frozen={cwd:'/fixed',exe:'/fixed/node',argv:['node','server.mjs']};const r=vm.runInContext('inspect(frozen)',c);
    assert.equal(r.state,'disk_and_initial_environment_observed');assert.equal(r.initialBackendMatch,duplicate?null:true);assert.equal(r.files.length,5);
    assert.equal(r.files[0].sha256,createHash('sha256').update('reviewed code').digest('hex'));
    assert.equal(handles.size,0);assert.equal(JSON.stringify(r).includes(secret),false);assert.equal(JSON.stringify(r).includes('/fixed'),false);
    assert.equal(opened.filter(p=>p.endsWith('/environ')).length,1);
  }
});
