import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { verifySourceIdentity, SOURCE_FILES, receiptExitCode } from './liara-binding-discovery-runner.mjs';
import { createDiscoveryConnect } from './liara-discovery-websocket.mjs';
const secret = 'PRIVATE_DO_NOT_EMIT';
function fixture() {
  const bytes = Buffer.from('fixture'), blob = createHash('sha1').update('blob 7\0').update(bytes).digest('hex');
  return {context:{repository:'safariarash7777-source/portfolio-platform',event:'workflow_dispatch',ref:'refs/heads/main',attempt:'1',operation:'discovery',workflowSha:'a'.repeat(40),sha:'a'.repeat(40)},manifest:{version:1,sourceCommit:'b'.repeat(40),files:Object.fromEntries(SOURCE_FILES.map(p=>[p,blob]))},controlHead:'a'.repeat(40),sourceHead:'b'.repeat(40),readSource:()=>bytes,sourceBlob:()=>blob};
}
test('closed caller rejects before any option getter or credential/transport access',async()=>{
  const r=await offlineCaller(()=>{throw Error(secret);},false)(new Proxy({},{get(){throw Error(secret);}}));assert.equal(r.state,'caller_not_adopted');assert.equal(r.authorized,false);assert.equal(r.remoteHalt,'not_started');
});
test('independent control/source identity, event, attempt and byte pins are required',()=>{
  assert.equal(verifySourceIdentity(fixture()).state,'source_identity_verified');
  const mutations=[f=>f.context.ref='refs/heads/other',f=>f.context.event='push',f=>f.context.attempt='2',f=>f.context.operation='health',f=>f.context.repository='other/repo',f=>f.context.sha='c'.repeat(40),f=>f.controlHead='c'.repeat(40),f=>f.sourceHead='c'.repeat(40),f=>f.readSource=()=>Buffer.from(secret),f=>f.sourceBlob=()=> 'd'.repeat(40),f=>f.manifest.files.extra='a'.repeat(40),f=>f.manifest.extra=secret,f=>f.readSource=()=>{throw Error(secret);}];
  for(const mutate of mutations){const f=fixture();mutate(f);assert.deepEqual(verifySourceIdentity(f),{state:'source_identity_rejected'});}
});
function offlineCaller(protocol, adopted=true) {
  const text=readFileSync(new URL('./liara-binding-discovery-runner.mjs',import.meta.url),'utf8').split('// No import-time transport')[0].replace(/^import .*;\r?\n/gm,'').replaceAll('export ','').replace(/const CALLER_ADOPTED = (?:false|true)/,'const CALLER_ADOPTED = '+adopted);
  const context=vm.createContext({Buffer,createHash,randomBytes:n=>{assert.equal(n,16);return Buffer.alloc(n,5);},discoverBinding:protocol,createDiscoveryConnect});
  vm.runInContext(text,context);return vm.runInContext('runDiscovery',context);
}
test('offline future caller rejects identity and independent protocol gate before token',async()=>{
  const deny=()=>{throw Error(secret);};
  const r=await offlineCaller(deny)({identity:()=>({...fixture(),sourceHead:'bad'}),readToken:deny});assert.equal(r.state,'source_identity_rejected');
  const closed=await offlineCaller(async()=>({state:'discovery_not_adopted'}))({identity:fixture,readToken:deny,get WebSocketClass(){throw Error(secret);}});assert.equal(closed.state,'discovery_not_adopted');
  for(const state of ['deadline','unresolved','candidate_only_not_adopted']) assert.equal((await offlineCaller(async()=>({state}))({identity:fixture,readToken:deny})).state,'caller_rejected');
});
test('offline future preflight uses no token/transport; execute generates fixed length fresh nonce',async()=>{
  let calls=0,tokens=0;
  const run=offlineCaller(async options=>{calls++;if(!options)return {state:'invalid_input'};assert.equal(options.nonce,'05'.repeat(16));assert.equal(options.token,secret);return {state:'unresolved',remoteHalt:'unknown'};});
  const options={identity:fixture,readToken:()=>{tokens++;return secret;},get WebSocketClass(){return class{};}};
  assert.equal((await run({...options,preflight:true})).authorized,true);assert.equal(tokens,0);
  assert.equal((await run(options)).state,'unresolved');assert.equal(tokens,1);assert.equal(calls,3);
});
function socketFixture() {
  let constructed=0,closed=0,sent=0;const handlers=new Map();
  class Socket {constructor(){constructed++;} addEventListener(k,v){handlers.set(k,v);} close(){closed++;} send(){sent++;}}
  const connect=createDiscoveryConnect(Socket);assert.equal(constructed,0);
  const s=connect('wss://api.iran.liara.ir/v1/exec?token=fixture');const events=[];
  for(const name of ['open','message','error','close'])s.on(name,value=>events.push([name,value]));
  return {s,events,fire:(name,data)=>handlers.get(name)(data),counts:()=>({constructed,closed,sent})};
}
test('Node22 adapter translates only bounded string/ArrayBuffer/views and close code',()=>{
  const f=socketFixture();f.fire('open',{});f.s.send('fixed start');
  for(const data of ['{}',new Uint8Array([123,125]),new Uint8Array([123,125]).buffer])f.fire('message',{data});
  f.fire('close',{code:1000,reason:secret});assert.equal(f.events.length,5);assert.equal(f.events.at(-1)[1],1000);assert.deepEqual(f.counts(),{constructed:1,closed:0,sent:1});
});
test('adapter rejects Blob, oversize, native errors and construction failure without raw details',()=>{
  for(const data of [new Blob([secret]),'x'.repeat(8193),new ArrayBuffer(8193),{}]){const f=socketFixture();f.fire('message',{data});assert.deepEqual(f.events,[['error','transport_rejected']]);assert.equal(f.counts().closed,1);}
  const f=socketFixture();f.fire('error',{message:secret});assert.equal(JSON.stringify(f.events).includes(secret),false);
  assert.throws(()=>createDiscoveryConnect(class{constructor(){throw Error(secret);}})('wss://api.iran.liara.ir/v1/exec'),/^Error: transport_rejected$/);
  assert.throws(()=>createDiscoveryConnect(class{})('wss://other.invalid/v1/exec'),/^Error: transport_rejected$/);
  for(const endpoint of [secret,'wss://user:password@api.iran.liara.ir/v1/exec']) assert.throws(()=>createDiscoveryConnect(class{})(endpoint),/^Error: transport_rejected$/);
});
test('candidate-only success exit is strict; unresolved and protocol failures remain failure',()=>{
  const valid={state:'candidate_only_not_adopted',remoteHalt:'unknown',releaseId:'b'.repeat(24),receipt:{version:1,nonce:'c'.repeat(32),state:'discovered_candidate',reason:'stable_candidate',count:1,pid:7,startTicks:'123',exeKind:'node_usr',cwdKind:'app',entryKind:'relative_server'}};
  assert.equal(receiptExitCode(valid),0);
  for(const value of [{state:'unresolved'},{state:'protocol_rejected'},{...valid,remoteHalt:'stopped'},{...valid,receipt:{...valid.receipt,extra:secret}},{...valid,receipt:{...valid.receipt,count:2}}])assert.equal(receiptExitCode(value),1);
});
test('bounded source reader rejects symlink, oversized/nonregular and drifting files before acceptance',()=>{
  const text=readFileSync(new URL('./liara-binding-discovery-runner.mjs',import.meta.url),'utf8').split('// No import-time transport')[0].replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
  for(const mode of ['ok','symlink','large','fifo','drift']){
    let reads=0,closed=0,stats=0;
    const ctx=vm.createContext({Buffer,resolve:x=>x,constants:{O_RDONLY:0,O_NOFOLLOW:1,O_NONBLOCK:2},lstatSync:()=>({isDirectory:()=>true,isSymbolicLink:()=>mode==='symlink'}),openSync:(p,flags)=>{assert.equal(flags,3);return 1;},fstatSync:()=>({isFile:()=>mode!=='fifo',size:mode==='large'?1000:2,ino:1,mtimeMs:mode==='drift'?stats++:1,ctimeMs:1}),readSync:(fd,b)=>{reads++;b.write('ok');return 2;},closeSync:()=>{closed++;}});
    vm.runInContext(text,ctx);const read=vm.runInContext('readBoundedCode',ctx);
    if(mode==='ok')assert.equal(read('/reviewed/file',8).toString(),'ok');else assert.throws(()=>read('/reviewed/file',8));
    assert.equal(closed,mode==='symlink'?0:1);assert.equal(reads,['ok','drift'].includes(mode)?1:0);
  }
});
