// Reviewed template only. A future source review must replace this frozen null
// binding with exact executable/cwd/argv; caller options cannot override it.
export const FIXED_PROBE_SOURCE = String.raw`
const fs = require('node:fs');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const binding = null;
const deadline = performance.now() + 1000;
function checkTime() { if (performance.now() >= deadline) throw Error('deadline'); }
const files = ['server.mjs','codal.mjs','codal-engine.mjs','brsapi-budget-store.mjs','package.json'];
function boundedRead(file, cap) {
  checkTime();
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const a = fs.fstatSync(fd);
    if (!a.isFile() || a.size > cap) throw Error('unavailable');
    const buf = Buffer.alloc(cap + 1); let n = 0, got;
    while ((checkTime(), got = fs.readSync(fd, buf, n, cap + 1 - n, null)) > 0) { n += got; if (n > cap) throw Error('unavailable'); }
    const b = fs.fstatSync(fd);
    if (a.dev !== b.dev || a.ino !== b.ino || a.size !== b.size || a.mtimeMs !== b.mtimeMs || a.ctimeMs !== b.ctimeMs) throw Error('changed');
    checkTime(); return buf.subarray(0, n);
  } finally { fs.closeSync(fd); }
}
function inspect(frozen) {
  if (!frozen) return {state:'binding_unresolved', collector:'unresolved', initialBackendMatch:null, files:[]};
  // No caller-supplied binding: inspect is invoked only with the frozen constant.
  if (fs.realpathSync(frozen.cwd) !== frozen.cwd) throw Error('unavailable');
  checkTime();
  const candidates = [];
  const startTime=pid=>{const v=boundedRead('/proc/'+pid+'/stat',8192).toString('utf8').split(') ').at(-1).split(' ')[19];if(!/^[0-9]+$/.test(v || ''))throw Error('unavailable');return v;};
  const argv=pid=>{const a=boundedRead('/proc/'+pid+'/cmdline',8192).toString('utf8').split('\0');if(a.at(-1)==='')a.pop();return a;};
  const directory=fs.opendirSync('/proc');let entryCount=0;
  try { while (true) {
    checkTime();const entry=directory.readSync();if(!entry)break;
    if(++entryCount>4096)throw Error('process_limit');
    const pid=entry.name;
    if (!/^[1-9][0-9]{0,8}$/.test(pid)) continue;
    try {
      const started=startTime(pid);
      const exe=fs.readlinkSync('/proc/'+pid+'/exe'), cwd=fs.readlinkSync('/proc/'+pid+'/cwd'), args=argv(pid);
      if(startTime(pid)!==started)throw Error('changed');
      if(exe===frozen.exe && cwd===frozen.cwd && JSON.stringify(args)===JSON.stringify(frozen.argv))candidates.push({pid,started,args});
    } catch { return {state:'collector_unresolved',collector:'unresolved',initialBackendMatch:null,files:[]}; }
  } } finally { directory.closeSync(); }
  if (candidates.length !== 1) return {state:'collector_unresolved',collector:candidates.length>1?'multiple':'zero',initialBackendMatch:null,files:[]};
  const {pid,started,args}=candidates[0];
  const env=boundedRead('/proc/'+pid+'/environ', 131072).toString('utf8').split('\0');
  const values=env.filter(x=>x.startsWith('SUPABASE_URL=')).map(x=>x.slice(13));
  const initialBackendMatch=values.length===1 ? values[0]==='https://62.60.191.24/liara-preview' : null;
  const hashes=files.map(name=>{const bytes=boundedRead(frozen.cwd+'/'+name,1048576);return {name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};});
  // Recheck process identity after reading. Disk hashes never claim loaded JS.
  if (startTime(pid)!==started || fs.readlinkSync('/proc/'+pid+'/exe')!==frozen.exe || fs.readlinkSync('/proc/'+pid+'/cwd')!==frozen.cwd || JSON.stringify(argv(pid))!==JSON.stringify(args) || startTime(pid)!==started) throw Error('changed');
  checkTime();
  return {state:'disk_and_initial_environment_observed',collector:'one',initialBackendMatch,files:hashes};
}
const nonce=process.argv[1];
if (/^[a-f0-9]{32}$/.test(nonce || '')) {
  let result;try {result=inspect(binding);}catch {result={state:'probe_unavailable',collector:'unresolved',initialBackendMatch:null,files:[]};}
  process.stdout.write(JSON.stringify({version:1,nonce,...result})+'\n');
}
`;
export const PROBE_FILE_NAMES = Object.freeze(['server.mjs','codal.mjs','codal-engine.mjs','brsapi-budget-store.mjs','package.json']);
