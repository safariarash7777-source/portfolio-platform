/** Source-only caller. Activation requires a separately reviewed source change. */
import { randomBytes, createHash } from 'node:crypto';
import { constants, lstatSync, openSync, fstatSync, readSync, closeSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverBinding } from './liara-binding-discovery.mjs';
import { createDiscoveryConnect } from './liara-discovery-websocket.mjs';

const CALLER_ADOPTED = true;
export const SOURCE_FILES = Object.freeze([
  'scripts/ops/liara-binding-discovery-command.mjs',
  'scripts/ops/liara-binding-discovery.mjs',
  'scripts/ops/liara-discovery-websocket.mjs',
  'scripts/ops/liara-binding-discovery-runner.mjs',
]);
const exact = (x, keys) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x,k));
const sha = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
const reject = () => { throw Error('source_identity_rejected'); };

// Manifest is read from the independent control checkout, never dispatch input.
// Git blob IDs cover working bytes as well as the committed tree (no CRLF repair).
export function verifySourceIdentity({ context, manifest, controlHead, sourceHead, readSource, sourceBlob }) {
  try {
    if (!exact(manifest,['version','sourceCommit','files']) || manifest.version !== 1 || !sha(manifest.sourceCommit) || !exact(manifest.files,SOURCE_FILES)) reject();
    if (context.repository !== 'safariarash7777-source/portfolio-platform' || context.event !== 'workflow_dispatch' || context.ref !== 'refs/heads/main' || context.attempt !== '1' || context.operation !== 'discovery' || !sha(context.workflowSha) || context.workflowSha !== context.sha || controlHead !== context.workflowSha || sourceHead !== manifest.sourceCommit) reject();
    for (const path of SOURCE_FILES) {
      const pin = manifest.files[path];
      if (!sha(pin) || sourceBlob(path) !== pin) reject();
      const bytes = readSource(path);
      if (!Buffer.isBuffer(bytes) || bytes.length > 131072) reject();
      if (createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex') !== pin) reject();
    }
    return { state:'source_identity_verified' };
  } catch { return { state:'source_identity_rejected' }; }
}

export async function runDiscovery(options = {}) {
  // Must precede destructuring: even malicious getters cannot obtain credentials.
  if (!CALLER_ADOPTED) return { state:'caller_not_adopted', authorized:false, remoteHalt:'not_started' };
  try {
    const identity = verifySourceIdentity(options.identity());
    if (identity.state !== 'source_identity_verified') return { ...identity, authorized:false, remoteHalt:'not_started' };
    // Independently closed protocol gate must stop before credential access.
    const gate = await discoverBinding();
    if (gate.state === 'discovery_not_adopted') return { state:gate.state, authorized:false, remoteHalt:'not_started' };
    if (gate.state !== 'invalid_input') return {state:'caller_rejected',authorized:false,remoteHalt:'not_started'};
    if (options.preflight) return { state:'source_identity_verified', authorized:true, remoteHalt:'not_started' };
    const nonce = randomBytes(16).toString('hex');
    const token = options.readToken();
    const result = await discoverBinding({ token, nonce, fetchImpl:options.fetchImpl, connect:createDiscoveryConnect(options.WebSocketClass) });
    return result;
  } catch { return { state:'caller_rejected', authorized:false, remoteHalt:'unknown' }; }
}

export function readBoundedCode(path, cap) {
  const full=resolve(path), parts=full.split(/[/\\]/);
  for(let i=1;i<parts.length;i++) { const parent=parts.slice(0,i).join('/') || '/'; const s=lstatSync(parent); if(!s.isDirectory() || s.isSymbolicLink()) reject(); }
  const fd=openSync(full,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try { const before=fstatSync(fd); if(!before.isFile() || before.size>cap) reject(); const bytes=Buffer.alloc(before.size+1); const n=readSync(fd,bytes,0,bytes.length,0), after=fstatSync(fd); if(n!==before.size || before.size!==after.size || before.ino!==after.ino || before.mtimeMs!==after.mtimeMs || before.ctimeMs!==after.ctimeMs) reject(); return bytes.subarray(0,n); }
  finally { closeSync(fd); }
}
function localIdentity() {
  const control = resolve('control'), source = resolve('reviewed');
  const git = (cwd, args) => execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:1000,maxBuffer:4096}).trim();
  const manifestBytes = readBoundedCode(resolve(control,'scripts/ops/liara-discovery-source.json'),8192);
  return {
    context:{repository:process.env.GITHUB_REPOSITORY,event:process.env.GITHUB_EVENT_NAME,ref:process.env.GITHUB_REF,attempt:process.env.GITHUB_RUN_ATTEMPT,operation:process.env.DISCOVERY_OPERATION,workflowSha:process.env.GITHUB_WORKFLOW_SHA,sha:process.env.GITHUB_SHA},
    manifest:JSON.parse(manifestBytes.toString('utf8')),
    controlHead:git(control,['rev-parse','HEAD']), sourceHead:git(source,['rev-parse','HEAD']),
    readSource:path => readBoundedCode(resolve(source,path),131072), sourceBlob:path => git(source,['rev-parse','HEAD:'+path]),
  };
}
export function receiptExitCode(result) {
  if (['caller_not_adopted','discovery_not_adopted','source_identity_verified'].includes(result.state)) return 0;
  const r=result.receipt;
  return exact(result,['state','remoteHalt','releaseId','receipt']) && result.state==='candidate_only_not_adopted' && result.remoteHalt==='unknown' && /^[a-f0-9]{24}$/.test(result.releaseId) && exact(r,['version','nonce','state','reason','count','pid','startTicks','exeKind','cwdKind','entryKind']) && r.version===1 && /^[a-f0-9]{32}$/.test(r.nonce) && r.state==='discovered_candidate' && r.reason==='stable_candidate' && r.count===1 && Number.isSafeInteger(r.pid) && r.pid>0 && r.pid<=999999999 && /^[0-9]{1,20}$/.test(r.startTicks) && ['node_usr_local','node_usr'].includes(r.exeKind) && ['app','usr_src_app','usr_src_relay'].includes(r.cwdKind) && ['relative_server','absolute_server'].includes(r.entryKind) ? 0 : 1;
}
// No import-time transport, credential lookup or execution. Fixed workflow entry only.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const preflight = process.argv.length === 3 && process.argv[2] === '--preflight';
  const execute = process.argv.length === 3 && process.argv[2] === '--execute';
  const result = preflight || execute ? await runDiscovery({preflight,identity:localIdentity,readToken:() => process.env.LIARA_API_TOKEN,get fetchImpl(){return globalThis.fetch;},get WebSocketClass(){return globalThis.WebSocket;}}) : {state:'caller_rejected',authorized:false,remoteHalt:'not_started'};
  process.stdout.write(JSON.stringify(result)+'\n');
  if (preflight && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,'authorized='+(result.authorized === true ? 'true':'false')+'\n');
  process.exitCode = receiptExitCode(result);
}
