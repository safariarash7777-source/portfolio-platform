/** Closed discovery protocol. Candidate hypotheses are not attestation or adoption. */
import { createHash } from 'node:crypto';
import { FIXED_DISCOVERY_SOURCE } from './liara-binding-discovery-command.mjs';
const DISCOVERY_ADOPTED = true; // Requires a new reviewed source change, never caller configuration.
const RELEASES = 'https://api.liara.ir/v1/projects/arsadata/releases?page=1&count=100';
export const commandSha256 = createHash('sha256').update(FIXED_DISCOVERY_SOURCE).digest('hex');
const fail = () => { throw Error('rejected'); };
const exactKeys = (x, names) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === names.length && names.every(n => Object.hasOwn(x,n));
// Native JSON validates grammar; a bounded token walk rejects duplicate keys,
// including escaped spellings. Ordinary whitespace is accepted.
function strictJson(raw) {
  const value=JSON.parse(raw), stack=[];
  const tokens=raw.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) || [];
  if(tokens.length>100000)fail();
  for(const token of tokens){
    if(token==='{' || token==='['){stack.push({object:token==='{',keys:new Set(),key:true});if(stack.length>64)fail();}
    else if(token==='}' || token===']')stack.pop();
    else if(token===','){if(stack.at(-1)?.object)stack.at(-1).key=true;}
    else if(token.startsWith('"') && stack.at(-1)?.object && stack.at(-1).key){const frame=stack.at(-1),key=JSON.parse(token);if(frame.keys.has(key))fail();frame.keys.add(key);frame.key=false;}
  }
  return value;
}
function receipt(raw, nonce) {
  if(typeof raw!=='string' || Buffer.byteLength(raw)>8192)fail();
  // Exactly one optional LF or CRLF terminator, never generic trimming.
  const framed=raw.endsWith('\r\n')?raw.slice(0,-2):raw.endsWith('\n')?raw.slice(0,-1):raw;
  if(/[\u0000-\u001f\u007f]/.test(framed))fail();
  const x=strictJson(framed);
  if(JSON.stringify(x)!==framed || !exactKeys(x,['version','nonce','state','reason','count','pid','startTicks','exeKind','cwdKind','entryKind']) || x.version!==1 || x.nonce!==nonce)fail();
  if(x.state==='discovered_candidate') {
    if(x.reason!=='stable_candidate' || x.count!==1 || !Number.isSafeInteger(x.pid) || x.pid<1 || x.pid>999999999 || typeof x.startTicks!=='string' || !/^[0-9]{1,20}$/.test(x.startTicks) || !['node_usr_local','node_usr'].includes(x.exeKind) || !['app','usr_src_app','usr_src_relay'].includes(x.cwdKind) || !['relative_server','absolute_server'].includes(x.entryKind))fail();
  } else if(x.state!=='unresolved' || !(x.count===null || (Number.isSafeInteger(x.count)&&x.count>=0&&x.count<=4096&&x.count!==1)) || ['pid','startTicks','exeKind','cwdKind','entryKind'].some(k=>x[k]!==null))fail();
  if(x.state==='unresolved'){
    const failures=['proc_unavailable','pid_limit','deadline','identity_unreadable','identity_changed','node_exe_outside_allowlist','node_cwd_outside_allowlist','node_entry_outside_allowlist'];
    if(x.reason==='zero_candidate'?x.count!==0:x.reason==='multiple_candidates'?!(Number.isSafeInteger(x.count)&&x.count>=2):!(failures.includes(x.reason)&&x.count===null))fail();
  }
  return x;
}
async function identity(fetchImpl, token, signal) {
  const response=await fetchImpl(RELEASES,{method:'GET',redirect:'error',signal,headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  if(!response.ok || !response.body) fail();
  const reader=response.body.getReader();const chunks=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>1048576)fail();chunks.push(Buffer.from(value));}}finally{void reader.cancel().catch(()=>{});}
  const body=strictJson(Buffer.concat(chunks).toString('utf8'));
  if(!/^[a-f0-9]{24}$/.test(body?.currentRelease) || !Array.isArray(body.releases) || body.releases.length>100)fail();
  const matches=body.releases.filter(r=>r?._id===body.currentRelease);
  if(matches.length!==1 || matches[0].state!=='READY')fail();
  return body.currentRelease;
}
function socketReceipt(connect, token, nonce, signal, remember) {
  return new Promise((resolve,reject)=>{
    let socket,started=false,result=null,count=0,total=0,settled=false;
    const rejectSafe=()=>{if(!settled){settled=true;reject(Error('rejected'));}try{socket?.close();}catch{/* no raw errors */}};
    const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
    const endpoint=new URL('wss://api.iran.liara.ir/v1/exec');
    endpoint.search=new URLSearchParams({token,cmd:'node -e '+quote(FIXED_DISCOVERY_SOURCE)+' '+nonce,project_id:'arsadata',teamID:''}).toString();
    try{socket=connect(endpoint.href);remember(socket);}catch{rejectSafe();return;}
    signal.addEventListener('abort',rejectSafe,{once:true});
    socket.on('open',()=>{try{if(started || settled || signal.aborted)return rejectSafe();started=true;socket.send(JSON.stringify({action:'start',cols:80,rows:24}));}catch{rejectSafe();}});
    socket.on('message',data=>{try{count++;const bytes=typeof data==='string'?Buffer.byteLength(data):data?.byteLength;total+=bytes;if(!started || settled || count>1 || !Number.isSafeInteger(bytes) || bytes>8192 || total>8192)return rejectSafe();const raw=typeof data==='string'?data:new TextDecoder('utf-8',{fatal:true}).decode(data);result=receipt(raw,nonce);}catch{rejectSafe();}});
    socket.on('error',rejectSafe);
    socket.on('unexpected-response',rejectSafe);
    socket.on('close',code=>{signal.removeEventListener('abort',rejectSafe);if(settled)return;if(code!==1000 || !result)return rejectSafe();settled=true;resolve(result);});
  });
}
export async function discoverBinding(options={}) {
  // Closed even when transports and credentials are supplied.
  if(!DISCOVERY_ADOPTED)return {state:'discovery_not_adopted',remoteHalt:'not_started'};
  const {token,nonce,fetchImpl,connect}=options;
  if(typeof token!=='string' || !token || !/^[a-f0-9]{32}$/.test(nonce||'') || typeof fetchImpl!=='function' || typeof connect!=='function')return {state:'invalid_input'};
  const controller=new AbortController();let timer,socket;
  const work=async()=>{
    const pre=await identity(fetchImpl,token,controller.signal);
    if(controller.signal.aborted)fail();
    const result=await socketReceipt(connect,token,nonce,controller.signal,s=>{socket=s;});
    if(controller.signal.aborted)fail();
    const post=await identity(fetchImpl,token,controller.signal);
    if(pre!==post || controller.signal.aborted)fail();
    return {state:result.state==='discovered_candidate'?'candidate_only_not_adopted':'unresolved',remoteHalt:'unknown',releaseId:pre,receipt:result};
  };
  // Closing the local socket does not prove remote process termination.
  try{return await Promise.race([work(),new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();try{socket?.close();}catch{/* no output */}resolve({state:'deadline',remoteHalt:'unknown'});},15000);})]);}
  catch{return {state:'protocol_rejected',remoteHalt:'unknown'};}
  finally{clearTimeout(timer);controller.abort();try{socket?.close();}catch{/* no output */}}
}
