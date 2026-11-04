// Fixed hypotheses only; this command neither reads environment nor adopts a binding.
export const FIXED_DISCOVERY_SOURCE = String.raw`
const fs=require('node:fs');
const {performance}=require('node:perf_hooks');
const deadline=performance.now()+1000;
const exes={'/usr/local/bin/node':'node_usr_local','/usr/bin/node':'node_usr'};
const cwds={'/app':'app','/usr/src/app':'usr_src_app','/usr/src/relay':'usr_src_relay'};
const reasons=['proc_unavailable','pid_limit','deadline','identity_unreadable','identity_changed','node_exe_outside_allowlist','node_cwd_outside_allowlist','node_entry_outside_allowlist','zero_candidate','multiple_candidates','stable_candidate'];
const unknown=(reason,count=null)=>({state:'unresolved',reason,count,pid:null,startTicks:null,exeKind:null,cwdKind:null,entryKind:null});
function time(){if(performance.now()>=deadline)throw Error('deadline');}
function read(pid,kind){
  if(!/^[1-9][0-9]{0,8}$/.test(pid)||!['stat','cmdline'].includes(kind))throw Error('unavailable');
  time();const fd=fs.openSync('/proc/'+pid+'/'+kind,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{const a=fs.fstatSync(fd);if(!a.isFile()||a.size>8192)throw Error('unavailable');
    const b=Buffer.alloc(8193);let n=0,k;
    while((time(),k=fs.readSync(fd,b,n,8193-n,null))>0){n+=k;if(n>8192)throw Error('unavailable');}
    const z=fs.fstatSync(fd);if(a.dev!==z.dev||a.ino!==z.ino||a.size!==z.size||a.mtimeMs!==z.mtimeMs||a.ctimeMs!==z.ctimeMs)throw Error('unavailable');
    time();return b.subarray(0,n).toString('utf8');
  }finally{fs.closeSync(fd);}
}
function start(pid){const ticks=read(pid,'stat').split(') ').at(-1).split(' ')[19];if(!/^[0-9]{1,20}$/.test(ticks||''))throw Error('unavailable');return ticks;}
function capture(pid){
  const ticks=start(pid),exe=fs.readlinkSync('/proc/'+pid+'/exe'),cwd=fs.readlinkSync('/proc/'+pid+'/cwd');
  const argv=read(pid,'cmdline').split('\0');if(argv.at(-1)==='')argv.pop();
  if(start(pid)!==ticks)throw Error('identity_changed');
  return {ticks,exe,cwd,argv};
}
function discover(){
  let dir;try{dir=fs.opendirSync('/proc');}catch{throw Error('proc_unavailable');}
  const candidates=[];let count=0;
  try{while(true){time();const e=dir.readSync();if(!e)break;if(++count>4096)throw Error('pid_limit');
    const pid=e.name;if(!/^[1-9][0-9]{0,8}$/.test(pid)||Number(pid)===process.pid)continue;
    // Every inaccessible PID makes uniqueness unknown; never skip a failed read.
    let a;try{a=capture(pid);}catch(e){throw Error(['deadline','identity_changed'].includes(e?.message)?e.message:'identity_unreadable');}
    if(!Object.hasOwn(exes,a.exe)) {
      if(/^node(?:js)?(?: \(deleted\))?$/.test(a.exe.split('/').at(-1))||a.exe.endsWith(' (deleted)'))return unknown('node_exe_outside_allowlist');
      continue;
    }
    if(!Object.hasOwn(cwds,a.cwd))return unknown('node_cwd_outside_allowlist');
    if(a.argv.length!==2||!['node',a.exe].includes(a.argv[0]))return unknown('node_entry_outside_allowlist');
    const entryKind=a.argv[1]==='server.mjs'?'relative_server':a.argv[1]===a.cwd+'/server.mjs'?'absolute_server':null;
    if(!entryKind)return unknown('node_entry_outside_allowlist');
    candidates.push({pid,a,entryKind});
  }}finally{dir.closeSync();}
  if(candidates.length!==1)return unknown(candidates.length?'multiple_candidates':'zero_candidate',candidates.length);
  const {pid,a,entryKind}=candidates[0];let after;
  try{after=capture(pid);}catch(e){throw Error(['deadline','identity_changed'].includes(e?.message)?e.message:'identity_unreadable');}
  if(JSON.stringify(after)!==JSON.stringify(a))return unknown('identity_changed');
  time();return {state:'discovered_candidate',reason:'stable_candidate',count:1,pid:Number(pid),startTicks:a.ticks,exeKind:exes[a.exe],cwdKind:cwds[a.cwd],entryKind};
}
const nonce=process.argv[1];
if(/^[a-f0-9]{32}$/.test(nonce||'')){
  let result;try{result=discover();}catch(e){result=unknown(reasons.includes(e?.message)?e.message:'proc_unavailable');}
  process.stdout.write(JSON.stringify({version:1,nonce,...result})+'\n');
}
`;
