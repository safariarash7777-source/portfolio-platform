import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {FIXED_DISCOVERY_SOURCE} from './liara-binding-discovery-command.mjs';
const nonce='a'.repeat(32),secret='NEVER_EMIT_PRIVATE_VALUE',release='b'.repeat(24);
const node=(extra={})=>({exe:'/usr/bin/node',cwd:'/app',argv:['node','server.mjs'],...extra});
function command(processes={},mode='ok'){
  let output='',closed=0,entriesRead=0,now=0,fd=0;const handles=new Map(),reads=[],calls=new Map();
  const fake={constants:{O_RDONLY:0,O_NOFOLLOW:131072,O_NONBLOCK:2048},
    opendirSync:path=>{assert.equal(path,'/proc');if(mode==='proc-unavailable')throw Error(secret);let index=0;const names=['999',...Object.keys(processes)];return {readSync(){entriesRead++;if(mode==='cap')return {name:'nonpid'};if(mode==='deadline'){now=1001;return {name:'nonpid'};}return index<names.length?{name:names[index++]}:null;},closeSync(){closed++;}};},
    readlinkSync:path=>{const m=/^\/proc\/(\d+)\/(exe|cwd)$/.exec(path);assert.ok(m);if(processes[m[1]].unreadable)throw Error(secret);return processes[m[1]][m[2]];},
    openSync:(path,flags)=>{assert.equal(flags,133120);const m=/^\/proc\/(\d+)\/(stat|cmdline)$/.exec(path);assert.ok(m,'only proc stat/cmdline permitted');reads.push(path);const p=processes[m[1]];if(p.unreadable)throw Error(secret);const n=(calls.get(path)||0)+1;calls.set(path,n);let text;
      if(m[2]==='stat'){const changed=(mode==='initial-reuse'&&n>=2)||(mode==='final-reuse'&&n>=3);text=m[1]+' (node) '+Array.from({length:20},(_,i)=>i===19?(changed?'124':'123'):'0').join(' ');}
      else text=(mode==='argv-change'&&n>=2?['node',secret]:p.argv).join('\0')+'\0';
      handles.set(++fd,{data:Buffer.from(text),offset:0});return fd;},
    fstatSync:n=>({isFile:()=>mode!=='fifo',size:mode==='oversize'?8193:handles.get(n).data.length,dev:1,ino:n,mtimeMs:1,ctimeMs:1}),
    readSync:(n,buffer,offset,length)=>{const h=handles.get(n),count=Math.min(length,h.data.length-h.offset);h.data.copy(buffer,offset,h.offset,h.offset+count);h.offset+=count;return count;},closeSync:n=>handles.delete(n)};
  const c=vm.createContext({Buffer,require:name=>{if(name==='node:fs')return fake;if(name==='node:perf_hooks')return {performance:{now:()=>now}};throw Error('forbidden import');},process:{pid:999,argv:['node',nonce],stdout:{write:s=>{output+=s;}}}});
  vm.runInContext(FIXED_DISCOVERY_SOURCE,c);assert.equal(handles.size,0);assert.equal(closed,mode==='proc-unavailable'?0:1);assert.equal(output.includes(secret),false);assert.equal(output.includes('/app'),false);assert.equal(output.includes('/usr/'),false);
  assert.deepEqual(Object.keys(JSON.parse(output)),['version','nonce','state','reason','count','pid','startTicks','exeKind','cwdKind','entryKind']);
  return {receipt:JSON.parse(output),reads,entriesRead};
}
test('all six exe/cwd hypotheses and exact entry forms yield only candidate enums',()=>{
  for(const exe of ['/usr/bin/node','/usr/local/bin/node'])for(const cwd of ['/app','/usr/src/app','/usr/src/relay'])for(const absolute of [false,true])for(const arg0 of ['node',exe]){
    const r=command({'7':node({exe,cwd,argv:[arg0,absolute?cwd+'/server.mjs':'server.mjs']})}).receipt;
    assert.equal(r.state,'discovered_candidate');assert.equal(r.reason,'stable_candidate');assert.equal(r.count,1);assert.equal(r.pid,7);assert.equal(r.startTicks,'123');assert.equal(r.entryKind,absolute?'absolute_server':'relative_server');
  }
});
test('out-of-hypothesis node/nodejs and extra or mismatched argv never fake uniqueness',()=>{
  for(const bad of [node({exe:'/other/node'}),node({exe:'/other/nodejs'}),node({exe:'/usr/bin/node (deleted)'}),node({cwd:'/other'}),node({argv:['node','server.mjs',secret]}),node({argv:['/usr/local/bin/node','server.mjs']}),node({argv:['node','/other/server.mjs']})]){
    const r=command({'7':node(),'8':bad}).receipt;assert.equal(r.state,'unresolved');assert.equal(r.count,null);assert.equal(r.pid,null);
  }
});
test('complete census reports exact zero or multiple and excludes only verified nonnode or exact self PID',()=>{
  assert.equal(command().receipt.count,0);
  assert.equal(command({'7':node(),'8':node(),'9':node()}).receipt.count,3);
  const r=command({'7':node(),'8':{exe:'/bin/sh',cwd:'/',argv:['sh']}}).receipt;assert.equal(r.state,'discovered_candidate');
});
test('unreadable siblings, PID reuse, exec argv change and malformed proc data remain unresolved',()=>{
  assert.equal(command({'7':node(),'8':node({unreadable:true})}).receipt.count,null);
  for(const mode of ['initial-reuse','final-reuse','argv-change','fifo','oversize']){const r=command({'7':node()},mode).receipt;assert.equal(r.state,'unresolved');assert.equal(r.pid,null);assert.equal(r.reason,['initial-reuse','final-reuse','argv-change'].includes(mode)?'identity_changed':'identity_unreadable');}
});
test('incremental census is capped and closed on elapsed deadline without app/env/code reads',()=>{
  const capped=command({},'cap'),expired=command({},'deadline');assert.equal(capped.entriesRead,4097);assert.equal(capped.receipt.reason,'pid_limit');assert.equal(expired.entriesRead,1);assert.equal(expired.receipt.reason,'deadline');
  assert.ok(command({'7':node()}).reads.every(p=>/^\/proc\/7\/(stat|cmdline)$/.test(p)));
});
test('public discovery gate is closed before getters, with no activation options',async()=>{
  const r=await offline(false)(new Proxy({},{get(){throw Error(secret);}}));assert.equal(r.state,'discovery_not_adopted');assert.equal(r.remoteHalt,'not_started');
});
test('fixed reasons identify failure categories without raw messages or candidate identity',()=>{
  for(const [processes,mode,reason] of [[{},'proc-unavailable','proc_unavailable'],[{'7':node({unreadable:true})},'ok','identity_unreadable'],[{'7':node({exe:'/other/nodejs'})},'ok','node_exe_outside_allowlist'],[{'7':node({cwd:'/other'})},'ok','node_cwd_outside_allowlist'],[{'7':node({argv:['node','bad.mjs']})},'ok','node_entry_outside_allowlist'],[{},'ok','zero_candidate'],[{'7':node(),'8':node()},'ok','multiple_candidates']]){
    const r=command(processes,mode).receipt;assert.equal(r.reason,reason);assert.equal(r.state,'unresolved');for(const k of ['pid','startTicks','exeKind','cwdKind','entryKind'])assert.equal(r[k],null);
  }
});
function offline(adopted=true){const s=readFileSync(new URL('./liara-binding-discovery.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','').replace(/const DISCOVERY_ADOPTED = (?:false|true)/,'const DISCOVERY_ADOPTED = '+adopted).replace('},15000)','},20)');const c=vm.createContext({createHash,FIXED_DISCOVERY_SOURCE,Buffer,URL,URLSearchParams,TextDecoder,AbortController,setTimeout,clearTimeout});vm.runInContext(s,c);return vm.runInContext('discoverBinding',c);}
async function protocol(mode='ok'){
  let gets=0,ws=0,starts=0,lastSocket,statusReads=0;
  const r=await offline()({token:secret,nonce,fetchImpl:async(url,init)=>{gets++;if(mode==='post-late-reject'&&gets===2){lastSocket.emit('open');lastSocket.emit('message','late');throw Error(secret);}assert.equal(url,'https://api.liara.ir/v1/projects/arsadata/releases?page=1&count=100');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');if(mode==='get-throw'||(mode==='post-throw'&&gets===2))throw Error(secret);if(mode==='get-stall'||(mode==='post-stall'&&gets===2))return new Promise(()=>{});if(mode==='body-throw')return {ok:true,status:200,body:{getReader:()=>({read:async()=>{throw Error(secret);},cancel:async()=>{}})}};if(mode==='bad-json')return new Response(secret);if(mode==='http')return new Response(secret,{status:401});const id=mode==='release-change'&&gets===2?'c'.repeat(24):release;let text=JSON.stringify({currentRelease:id,releases:[{_id:id,state:'READY'}]});if(mode==='duplicate-release')text=text.replace('"currentRelease":','"currentRelease":"'+release+'","currentRelease":');const response=new Response(mode==='body-limit'?'x'.repeat(1048577):text);if(mode==='status-throws')return {ok:true,body:response.body,get status(){statusReads++;throw Error(secret);}};return response;},connect:url=>{
    ws++;if(mode==='connect-throw')throw Error(secret);const u=new URL(url);assert.equal(u.origin,'wss://api.iran.liara.ir');assert.equal(u.searchParams.get('project_id'),'arsadata');assert.equal(u.searchParams.get('token'),secret);assert.equal(u.searchParams.get('cmd').includes(secret),false);
    const socket=new EventEmitter();lastSocket=socket;socket.close=()=>{};socket.send=text=>{starts++;if(mode==='send-throw')throw Error(secret);assert.equal(JSON.parse(text).action,'start');queueMicrotask(()=>{if(mode==='ws-stall')return;if(mode==='empty'){socket.emit('close',1000);return;}let text=JSON.stringify({version:1,nonce,state:'discovered_candidate',reason:'stable_candidate',count:1,pid:7,startTicks:'123',exeKind:'node_usr',cwdKind:'app',entryKind:'relative_server'});
      if(mode==='valid-unresolved')text=JSON.stringify({version:1,nonce,state:'unresolved',reason:'zero_candidate',count:0,pid:null,startTicks:null,exeKind:null,cwdKind:null,entryKind:null});if(mode==='nonce')text=text.replace(nonce,'d'.repeat(32));if(mode==='duplicate-frame-key')text=text.replace('"version":1','"version":1,"version":1');if(mode==='secret-field')text=text.replace('"version":1','"version":1,"argv":"'+secret+'"');if(mode==='crlf')text+='\r\n';if(mode==='ansi')text='\u001b[0m'+text;if(mode==='frame-limit')text='x'.repeat(8193);
      if(mode==='split-frame'){socket.emit('message',text.slice(0,10));socket.emit('message',text.slice(10));}else if(mode==='truncated-utf8')socket.emit('message',new Uint8Array([0xc3]));else socket.emit('message',text);if(mode==='extra-frame')socket.emit('message',text);if(mode==='socket-error')socket.emit('error',Error(secret));socket.emit('close',mode==='unclean'?1006:mode==='bad-close'?999999:1000);
    });};queueMicrotask(()=>{socket.emit('open');if(mode==='duplicate-open')socket.emit('open');});return socket;
  }});assert.equal(JSON.stringify(r).includes(secret),false);assert.equal(JSON.stringify(r).includes('Sha256'),false);assert.equal(r.remoteHalt,'unknown');assert.ok(gets<=2&&ws<=1&&starts<=1);return {r,gets,ws,starts,statusReads};
}
test('offline protocol has exactly two release GETs, one socket/start and no automatic adoption',async()=>{const p=await protocol();assert.equal(p.r.state,'candidate_only_not_adopted');assert.equal(p.gets,2);assert.equal(p.ws,1);assert.equal(p.starts,1);assert.equal((await offline()()).state,'invalid_input');});
test('protocol adversarial schema/frames/identity/errors are redacted and fail closed',async()=>{for(const mode of ['http','body-limit','duplicate-release','release-change','nonce','duplicate-frame-key','secret-field','ansi','frame-limit','extra-frame','socket-error','empty','unclean'])assert.equal((await protocol(mode)).r.state,'protocol_rejected',mode);});
test('deadline covers preflight, socket and postflight, no remote stop claim or retry',async()=>{for(const mode of ['get-stall','ws-stall','post-stall'])assert.ok(['deadline','protocol_rejected'].includes((await protocol(mode)).r.state));});

// Pure framing evaluation: no native transport, CLI entry or credential lookup.
function framingFixture(){
  let parses=0;
  const source=readFileSync(new URL('./liara-binding-discovery.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const context=vm.createContext({Buffer,createHash,FIXED_DISCOVERY_SOURCE,JSON:{stringify:JSON.stringify,parse:s=>{parses++;return JSON.parse(s);}}});
  vm.runInContext(source,context);
  return {read:vm.runInContext('receipt',context),parses:()=>parses};
}
const canonicalReceipt=JSON.stringify({version:1,nonce,state:'discovered_candidate',reason:'stable_candidate',count:1,pid:7,startTicks:'123',exeKind:'node_usr',cwdKind:'app',entryKind:'relative_server'});
test('framing accepts exactly no terminator or one LF/CRLF and rejects whitespace/control/text extras',()=>{
  for(const raw of [canonicalReceipt,canonicalReceipt+'\n',canonicalReceipt+'\r\n'])assert.equal(framingFixture().read(raw,nonce).reason,'stable_candidate');
  for(const raw of [canonicalReceipt+'\n\n',canonicalReceipt+'\r\n\r\n',canonicalReceipt+'\r',canonicalReceipt.replace('stable_candidate','stable\rcandidate'),'prompt>'+canonicalReceipt,canonicalReceipt+'prompt>',canonicalReceipt+canonicalReceipt,' '+canonicalReceipt,canonicalReceipt+' ','\x1b[0m'+canonicalReceipt])assert.throws(()=>framingFixture().read(raw,nonce));
});
test('raw8192 UTF8-byte cap precedes terminator removal and strict nonce/schema validation',()=>{
  for(const bytes of [8192,8193]){
    const f=framingFixture(),prefix=canonicalReceipt.slice(0,-1)+',"extra":"',suffix='"}\r\n',raw=prefix+'x'.repeat(bytes-Buffer.byteLength(prefix+suffix))+suffix;
    assert.equal(Buffer.byteLength(raw),bytes);assert.throws(()=>f.read(raw,nonce));assert.equal(f.parses()>0,bytes===8192);
  }
  const f=framingFixture();assert.throws(()=>f.read('é'.repeat(4096)+'\r\n',nonce));assert.equal(f.parses(),0);
  assert.throws(()=>framingFixture().read(canonicalReceipt+'\r\n','c'.repeat(32)));
  assert.throws(()=>framingFixture().read(canonicalReceipt.replace('"version":1','"version":1,"version":1')+'\r\n',nonce));
});
test('CRLF stays single-frame candidate-only; split frames and truncated UTF8 fail without retry',async()=>{
  const ok=await protocol('crlf');assert.equal(ok.r.state,'candidate_only_not_adopted');assert.equal(ok.gets,2);assert.equal(ok.r.remoteHalt,'unknown');
  for(const mode of ['split-frame','truncated-utf8']){const failed=await protocol(mode);assert.equal(failed.r.state,'protocol_rejected');assert.equal(failed.gets,1);assert.equal(failed.ws,1);assert.equal(failed.starts,1);}
});

const diagnosticKeys=['phase','bodyBytesCapped1048577','fetchCalls','fetchReturns','httpStatusClass','connectCalls','connectReturns','wsOpenEventsCapped2','startSendCalls','startSendReturned','frameCountCapped2','lastFrameBytesCapped8193','closeCode'];
test('failure diagnostics distinguish request/body/schema/socket/send/frame/close/post phases without raw details',async()=>{
  const modes={ 'get-throw':'pre_release_fetch',http:'pre_release_fetch','body-throw':'pre_release_body','bad-json':'pre_release_validate','connect-throw':'ws_connect','send-throw':'start_send','duplicate-open':'ws_open','frame-limit':'frame_read',nonce:'frame_validate',unclean:'ws_close','post-throw':'post_release_fetch','release-change':'post_release_validate'};
  for(const [mode,phase] of Object.entries(modes)){
    const {r}=await protocol(mode);assert.equal(r.state,'protocol_rejected');assert.equal(r.diagnostics.phase,phase,mode);assert.deepEqual(Object.keys(r.diagnostics),diagnosticKeys);assert.equal(JSON.stringify(r).includes(secret),false);assert.equal(JSON.stringify(r).includes('wss:'),false);
  }
});
test('diagnostics expose only observed attempts/returns, null unobserved, and capped sizes',async()=>{
  const get=(await protocol('get-throw')).r.diagnostics;assert.equal(get.fetchCalls,1);for(const k of diagnosticKeys.filter(k=>!['phase','fetchCalls'].includes(k)))assert.equal(get[k],null,k);
  const connect=(await protocol('connect-throw')).r.diagnostics;assert.equal(connect.connectCalls,1);assert.equal(connect.connectReturns,null);assert.equal(connect.wsOpenEventsCapped2,null);
  const send=(await protocol('send-throw')).r.diagnostics;assert.equal(send.connectReturns,1);assert.equal(send.wsOpenEventsCapped2,1);assert.equal(send.startSendCalls,1);assert.equal(send.startSendReturned,null);
  const frame=(await protocol('frame-limit')).r.diagnostics;assert.equal(frame.startSendReturned,1);assert.equal(frame.lastFrameBytesCapped8193,8193);
  const body=(await protocol('body-limit')).r.diagnostics;assert.equal(body.bodyBytesCapped1048577,1048577);assert.equal(body.httpStatusClass,'2xx');
  assert.equal((await protocol('http')).r.diagnostics.httpStatusClass,'4xx');assert.equal((await protocol('bad-close')).r.diagnostics.closeCode,null);assert.equal((await protocol('unclean')).r.diagnostics.closeCode,1006);
});
test('first failure snapshot survives subsequent frame/close/abort; candidate contract unchanged',async()=>{
  const nonceFailure=(await protocol('nonce')).r.diagnostics;assert.equal(nonceFailure.phase,'frame_validate');assert.equal(nonceFailure.closeCode,null);assert.equal(nonceFailure.frameCountCapped2,1);
  const duplicate=(await protocol('extra-frame')).r.diagnostics;assert.equal(duplicate.phase,'frame_read');assert.equal(duplicate.frameCountCapped2,2);assert.equal(duplicate.closeCode,null);
  const candidate=(await protocol()).r;assert.deepEqual(Object.keys(candidate),['state','remoteHalt','releaseId','receipt']);assert.equal(candidate.diagnostics,undefined);const unresolved=(await protocol('valid-unresolved')).r;assert.equal(unresolved.state,'unresolved');assert.deepEqual(Object.keys(unresolved),['state','remoteHalt','releaseId','receipt']);
  for(const mode of ['get-stall','ws-stall','post-stall']){const d=(await protocol(mode)).r.diagnostics;assert.ok(d);assert.equal(d.closeCode,mode==='post-stall'?1000:null);}
});

test('late settled socket events cannot replace post-fetch failure phase',async()=>{
  const p=await protocol('post-late-reject');assert.equal(p.r.state,'protocol_rejected');assert.equal(p.r.diagnostics.phase,'post_release_fetch');assert.equal(p.r.diagnostics.fetchCalls,2);assert.equal(p.r.diagnostics.frameCountCapped2,1);assert.equal(p.r.diagnostics.wsOpenEventsCapped2,1);
  const duplicate=await protocol('duplicate-open');assert.equal(duplicate.r.diagnostics.wsOpenEventsCapped2,2);
});
test('throwing diagnostic-only HTTP status getter is read once and cannot reject valid transport',async()=>{
  const p=await protocol('status-throws');assert.equal(p.r.state,'candidate_only_not_adopted');assert.deepEqual(Object.keys(p.r),['state','remoteHalt','releaseId','receipt']);assert.equal(p.statusReads,2);
});

test('pre/post body read failure captures first observation before failure-triggered cancellation',async()=>{
  const source=readFileSync(new URL('./liara-binding-discovery.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const context=vm.createContext({Buffer,createHash,FIXED_DISCOVERY_SOURCE});vm.runInContext(source,context);const readIdentity=vm.runInContext('identity',context);
  for(const prefix of ['pre','post'])for(const mode of ['read-failure','body-limit']){
    const order=[],diagnostic={phase:prefix+'_release_fetch',fetchCalls:null,fetchReturns:null,httpStatusClass:null,bodyBytesCapped1048577:null};let captured;
    const response={ok:true,status:200,body:{getReader:()=>({read:async()=>{if(mode==='read-failure')throw Error(secret);return {done:false,value:new Uint8Array(1048577)};},cancel:async()=>{order.push('cancel');diagnostic.phase='late_cleanup';}})}};
    await assert.rejects(readIdentity(async()=>response,'fixture',new AbortController().signal,diagnostic,()=>{order.push('capture');captured={...diagnostic};}));
    assert.deepEqual(order,['capture','cancel']);assert.equal(captured.phase,prefix+'_release_body');assert.equal(captured.bodyBytesCapped1048577,mode==='read-failure'?null:1048577);assert.equal(JSON.stringify(captured).includes(secret),false);
  }
});
