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
    let body=JSON.stringify({currentRelease:current,releases:[{_id:current,state:'READY'}]});
    if(mode==='duplicate-release')body=body.replace('"currentRelease":','"currentRelease":"'+id+'","currentRelease":');
    if(mode==='duplicate-state')body=body.replace('"state":"READY"','"state":"FAILED","state":"READY"');
    if(mode==='duplicate-id')body=body.replace('"_id":','"_id":"'+id+'","_id":');
    if(mode==='escaped-key')body=body.replace('"state":"READY"','"state":"FAILED","st\\u0061te":"READY"');
    if(mode==='whitespace')body=JSON.stringify(JSON.parse(body),null,2);
    return new Response(body);
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
  assert.equal(JSON.stringify(out).includes(secret),false);assert.equal(out.remoteHalt,'unknown');return {out,gets,connections,starts};
}
test('closed shipped gate invokes zero transports even with caller options',async()=>{
  let calls=0;const out=await inspectRuntime({token:secret,nonce,fetchImpl:()=>{calls++;},connect:()=>{calls++;},binding:{cwd:'/invented'},command:'arbitrary'});assert.equal(out.state,'binding_not_adopted');assert.equal(calls,0);
});
test('closed gate does not inspect options getters',async()=>{const options=new Proxy({},{get(){throw Error(secret);}});assert.equal((await inspectRuntime(options)).state,'binding_not_adopted');});
test('offline protocol uses two reads, one socket and one START',async()=>{const r=await fixture();assert.equal(r.out.state,'unresolved');assert.equal(r.gets,2);assert.equal(r.connections,1);assert.equal(r.starts,1);});
test('bad frames, replay, close/error and changed identity fail closed',async()=>{
  for(const mode of ['nonce','duplicate-key','private-field','ansi','oversize','extra','error','close-empty','unclean','changed','http','body-limit']){const r=await fixture(mode);assert.equal(r.out.state,'protocol_rejected',mode);assert.ok(r.connections<=1);assert.ok(r.gets<=2);assert.ok(r.starts<=1);}
});
test('deadline includes stalled GET and socket completion, no retry',async()=>{for(const mode of ['get-stall','stall']){const r=await fixture(mode);assert.ok(['deadline','protocol_rejected'].includes(r.out.state));assert.ok(r.connections<=1);assert.ok(r.gets<=1);}});
function commandContext(fake,now=()=>0){
  let output='';const c=vm.createContext({require:name=>{if(name==='node:fs')return fake;if(name==='node:crypto')return {createHash};if(name==='node:perf_hooks')return {performance:{now}};throw Error('forbidden');},Buffer,process:{argv:['node',nonce],stdout:{write:x=>{output+=x;}}}});vm.runInContext(FIXED_PROBE_SOURCE,c);return {c,output};
}
test('fixed unresolved command is inert without touching filesystem',()=>{const {output}=commandContext(new Proxy({},{get(){throw Error('filesystem touched');}}));assert.equal(JSON.parse(output).state,'binding_unresolved');assert.equal(output.includes(secret),false);});
function directoryFixture(names){let index=0;return {readSync:()=>index<names.length?{name:names[index++]}:null,closeSync:()=>{}};}
function filesystem(mode='ok'){
  let data=Buffer.from('code');const stat={isFile:()=>true,dev:1,ino:1,mtimeMs:1,ctimeMs:1};let offset=0,stats=0,closed=0;
  return {constants:{O_RDONLY:0,O_NOFOLLOW:131072,O_NONBLOCK:2048},openSync:(path,flags)=>{assert.equal(flags,133120);if(mode==='symlink')throw Error(secret);data=Buffer.from(path.endsWith('/stat')?'9 (node) '+Array.from({length:20},(_,i)=>i===19?'123':'0').join(' '):'code');offset=0;return 1;},fstatSync:()=>{stats++;return {...stat,isFile:()=>!['directory','fifo'].includes(mode),size:mode==='oversize'?100:data.length,ino:mode==='drift'&&stats>1?2:1};},readSync:(_fd,b,n,len)=>{const count=Math.min(len,data.length-offset);data.copy(b,n,offset,offset+count);offset+=count;return count;},closeSync:()=>{closed++;},get closed(){return closed;}};
}
test('bounded read rejects symlink/nonregular/FIFO/oversize/stat drift and closes fd',()=>{for(const mode of ['ok','symlink','directory','fifo','oversize','drift']){const f=filesystem(mode),{c}=commandContext(f);c.file='/fixed/code';if(mode==='ok')assert.equal(vm.runInContext('boundedRead(file,8).toString()',c),'code');else assert.throws(()=>vm.runInContext('boundedRead(file,8)',c));assert.equal(f.closed,mode==='symlink'?0:1);}});
test('zero/multiple matching processes do not read environment or code',()=>{for(const n of [0,2]){const f=filesystem();f.realpathSync=p=>p;f.opendirSync=()=>directoryFixture(Array.from({length:n},(_,i)=>String(i+1)));f.readlinkSync=p=>p.endsWith('/exe')?'/fixed/node':'/fixed';const {c}=commandContext(f);c.frozen={cwd:'/fixed',exe:'/fixed/node',argv:['code']};const r=vm.runInContext('inspect(frozen)',c);assert.equal(r.collector,n?'multiple':'zero');assert.equal(r.files.length,0);}});
test('deadline also covers postidentity; clean socket closure is not final acceptance',async()=>{const r=await fixture('post-stall');assert.ok(['deadline','protocol_rejected'].includes(r.out.state));assert.equal(r.gets,2);assert.equal(r.connections,1);});
test('release JSON rejects duplicate and escaped duplicate identity keys but accepts whitespace',async()=>{for(const mode of ['duplicate-release','duplicate-state','duplicate-id','escaped-key'])assert.equal((await fixture(mode)).out.state,'protocol_rejected');assert.equal((await fixture('whitespace')).out.state,'unresolved');});
test('PID census and monotonic time are bounded',()=>{
  const f=filesystem();f.realpathSync=p=>p;let reads=0,closed=0;f.opendirSync=()=>({readSync(){reads++;return {name:'non-pid'};},closeSync(){closed++;}});const {c}=commandContext(f);c.frozen={cwd:'/fixed'};assert.throws(()=>vm.runInContext('inspect(frozen)',c));assert.equal(reads,4097);assert.equal(closed,1);
  let time=0;const expired=commandContext(filesystem(),()=>time);time=1001;assert.throws(()=>vm.runInContext("boundedRead('/fixed/code',8)",expired.c));
});
test('incremental directory closes on deadline and read failure without scanning more entries',()=>{
  for(const mode of ['deadline','read-error']){
    let time=0,reads=0,closed=0;const f=filesystem();f.realpathSync=p=>p;
    f.opendirSync=()=>({readSync(){reads++;if(mode==='read-error')throw Error(secret);time=1001;return {name:'non-pid'};},closeSync(){closed++;}});
    const {c}=commandContext(f,()=>time);c.frozen={cwd:'/fixed'};assert.throws(()=>vm.runInContext('inspect(frozen)',c));assert.equal(reads,1);assert.equal(closed,1);
  }
});
test('one fixture process yields only approved code hashes and initial environment predicate',()=>{
  for(const mode of ['ok','duplicate-env','initial-reuse','final-reuse','final-argv','unreadable-sibling']) {
    const opened=[],handles=new Map();let next=0,stats=0,args=0;
    const fake={constants:{O_RDONLY:0,O_NOFOLLOW:131072,O_NONBLOCK:2048},realpathSync:p=>p,opendirSync:()=>directoryFixture(mode==='unreadable-sibling'?['9','10']:['9']),readlinkSync:p=>p.endsWith('/exe')?'/fixed/node':'/fixed',
      openSync:(p,flags)=>{assert.equal(flags,133120);opened.push(p);let content;
        if(p.startsWith('/proc/10/'))throw Error(secret);
        if(p.endsWith('/cmdline')){args++;content=mode==='final-argv'&&args>1?'node\0different.mjs\0':'node\0server.mjs\0';}
        else if(p.endsWith('/stat')){stats++;const changed=(mode==='initial-reuse'&&stats>1)||(mode==='final-reuse'&&stats>2);content='9 (node) '+Array.from({length:20},(_,i)=>i===19?(changed?'124':'123'):'0').join(' ');}
        else if(p.endsWith('/environ'))content='SECRET='+secret+'\0SUPABASE_URL=https://62.60.191.24/liara-preview\0'+(mode==='duplicate-env'?'SUPABASE_URL=other\0':'');
        else {assert.ok(PROBE_FILE_NAMES.includes(p.slice('/fixed/'.length)));content='reviewed code';}
        const id=++next;handles.set(id,{data:Buffer.from(content),offset:0});return id;},
      fstatSync:id=>({isFile:()=>true,size:handles.get(id).data.length,dev:1,ino:id,mtimeMs:1,ctimeMs:1}),
      readSync:(id,buf,n,len)=>{const h=handles.get(id),count=Math.min(len,h.data.length-h.offset);h.data.copy(buf,n,h.offset,h.offset+count);h.offset+=count;return count;},closeSync:id=>handles.delete(id)};
    const {c}=commandContext(fake);c.frozen={cwd:'/fixed',exe:'/fixed/node',argv:['node','server.mjs']};
    if(['final-reuse','final-argv'].includes(mode)){assert.throws(()=>vm.runInContext('inspect(frozen)',c));assert.equal(handles.size,0);continue;}
    const r=vm.runInContext('inspect(frozen)',c);
    if(['initial-reuse','unreadable-sibling'].includes(mode)){assert.equal(r.state,'collector_unresolved');assert.equal(r.collector,'unresolved');assert.equal(opened.some(p=>p.endsWith('/environ')||p.startsWith('/fixed/')),false);assert.equal(handles.size,0);continue;}
    assert.equal(r.state,'disk_and_initial_environment_observed');assert.equal(r.initialBackendMatch,mode==='duplicate-env'?null:true);assert.equal(r.files.length,5);
    assert.equal(r.files[0].sha256,createHash('sha256').update('reviewed code').digest('hex'));
    assert.equal(handles.size,0);assert.equal(JSON.stringify(r).includes(secret),false);assert.equal(JSON.stringify(r).includes('/fixed'),false);
    assert.equal(opened.filter(p=>p.endsWith('/environ')).length,1);
  }
});
