/** Offline-reviewed protocol only. No native network, credential lookup or CLI. */
import { createHash } from 'node:crypto';
import { FIXED_PROBE_SOURCE, PROBE_FILE_NAMES } from './liara-runtime-probe-command.mjs';
const BINDING_ADOPTED = false; // Requires a new reviewed source change, never caller configuration.
const RELEASES = 'https://api.liara.ir/v1/projects/arsadata/releases?page=1&count=100';
export const commandSha256 = createHash('sha256').update(FIXED_PROBE_SOURCE).digest('hex');
const fail = () => { throw Error('rejected'); };
const exactKeys = (x, names) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === names.length && names.every(n => Object.hasOwn(x,n));
function receipt(raw, nonce) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw)>8192 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(raw)) fail();
  const x=JSON.parse(raw);
  if (JSON.stringify(x)!==raw.trim() || !exactKeys(x,['version','nonce','state','collector','initialBackendMatch','files']) || x.version!==1 || x.nonce!==nonce) fail();
  if (!['binding_unresolved','collector_unresolved','probe_unavailable','disk_and_initial_environment_observed'].includes(x.state) || !['unresolved','zero','one','multiple'].includes(x.collector) || ![true,false,null].includes(x.initialBackendMatch) || !Array.isArray(x.files)) fail();
  if(x.state==='disk_and_initial_environment_observed') {
    if(x.collector!=='one' || x.files.length!==PROBE_FILE_NAMES.length) fail();
    x.files.forEach((f,i)=>{if(!exactKeys(f,['name','sha256','bytes']) || f.name!==PROBE_FILE_NAMES[i] || !/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes<0 || f.bytes>1048576) fail();});
  } else if(x.files.length || x.initialBackendMatch!==null || (x.state==='collector_unresolved' ? !['zero','multiple'].includes(x.collector) : x.collector!=='unresolved')) fail();
  return x;
}
async function identity(fetchImpl, token, signal) {
  const response=await fetchImpl(RELEASES,{method:'GET',redirect:'error',signal,headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  if(!response.ok || !response.body) fail();
  const reader=response.body.getReader();const chunks=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>1048576)fail();chunks.push(Buffer.from(value));}}finally{void reader.cancel().catch(()=>{});}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
    endpoint.search=new URLSearchParams({token,cmd:'node -e '+quote(FIXED_PROBE_SOURCE)+' '+nonce,project_id:'arsadata',teamID:''}).toString();
    try{socket=connect(endpoint.href);remember(socket);}catch{rejectSafe();return;}
    signal.addEventListener('abort',rejectSafe,{once:true});
    socket.on('open',()=>{try{if(started || settled || signal.aborted)return rejectSafe();started=true;socket.send(JSON.stringify({action:'start',cols:80,rows:24}));}catch{rejectSafe();}});
    socket.on('message',data=>{try{count++;const bytes=typeof data==='string'?Buffer.byteLength(data):data?.byteLength;total+=bytes;if(!started || settled || count>1 || !Number.isSafeInteger(bytes) || bytes>8192 || total>8192)return rejectSafe();const raw=typeof data==='string'?data:new TextDecoder('utf-8',{fatal:true}).decode(data);result=receipt(raw,nonce);}catch{rejectSafe();}});
    socket.on('error',rejectSafe);
    socket.on('unexpected-response',rejectSafe);
    socket.on('close',code=>{signal.removeEventListener('abort',rejectSafe);if(settled)return;if(code!==1000 || !result)return rejectSafe();settled=true;resolve(result);});
  });
}
export async function inspectRuntime({token,nonce,fetchImpl,connect}={}) {
  // Closed even when transports and credentials are supplied.
  if(!BINDING_ADOPTED)return {state:'binding_not_adopted',commandSha256};
  if(typeof token!=='string' || !token || !/^[a-f0-9]{32}$/.test(nonce||'') || typeof fetchImpl!=='function' || typeof connect!=='function')return {state:'invalid_input',commandSha256};
  const controller=new AbortController();let timer,socket;
  const work=async()=>{
    const pre=await identity(fetchImpl,token,controller.signal);
    if(controller.signal.aborted)fail();
    const result=await socketReceipt(connect,token,nonce,controller.signal,s=>{socket=s;});
    if(controller.signal.aborted)fail();
    const post=await identity(fetchImpl,token,controller.signal);
    if(pre!==post || controller.signal.aborted)fail();
    return {state:result.state==='disk_and_initial_environment_observed'?'observed_disk_and_initial_environment':'unresolved',releaseId:pre,commandSha256,receipt:result};
  };
  try{return await Promise.race([work(),new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();try{socket?.close();}catch{/* no output */}resolve({state:'deadline',commandSha256});},15000);})]);}
  catch{return {state:'protocol_rejected',commandSha256};}
  finally{clearTimeout(timer);controller.abort();try{socket?.close();}catch{/* no output */}}
}
