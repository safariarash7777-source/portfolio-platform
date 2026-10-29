/** Read-only confirmation of exact revoke error and full adapter post-state. */
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {state,read,exchange,sql,identity,store,setupJars} from './native-extension.mjs';
import {local,root} from './native-lab.mjs';
const check=(v,c)=>{if(!v)throw Error(c);};
const hash=v=>createHash('sha256').update(v).digest('hex');
async function main(){
 await identity();await setupJars();
 const intents=readdirSync(local).filter(n=>/^extension-intent-\d+\.json$/.test(n)).sort().map(n=>JSON.parse(readFileSync(resolve(local,n),'utf8')));
 const revoke=intents.findLast(v=>v.body?.command?.kind==='revoke');check(revoke&&revoke.actorId===state.users.b.id,'matching_revoke_intent_missing');
 const relationshipId=revoke.body.command.relationshipId;
 const response=await exchange('owner','/api/consultation?'+new URLSearchParams({relationshipId,startOn:'2026-10-01',endOn:'2026-10-31'}),'GET',undefined,403);
 check(response.code==='FORBIDDEN','revoke_exact_code_mismatch');
 const member=await read('b',relationshipId);check(member.selected.revoked&&member.actions.length===2&&member.actions.every(a=>a.actorId===state.users.b.id&&a.sessionId===member.sessions[0].id&&a.actionKey===member.sessions[0].body.actions[0].actionKey),'exact_history_actor_or_action_mismatch');
 const fixture=JSON.parse(execFileSync(process.env.PYTHON||'python3',[resolve(root,'scripts/testing/consultation-feedback/payload-fixture.py'),'--repo',root,'--operation','inspect'],{encoding:'utf8',stdio:'pipe',windowsHide:true}));
 const checks=JSON.parse(sql('BEGIN READ ONLY;'+fixture.checks+'COMMIT;'));check(Object.keys(checks).length===9&&Object.values(checks).every(v=>v===true),'native_full_adapter_poststate_mismatch');
 const strict=sql('BEGIN READ ONLY;'+fixture.rolloutDefaultOff+'COMMIT;')==='t';
 const gate=JSON.parse(sql('BEGIN READ ONLY;SELECT jsonb_build_object(\'enabled\',enabled,\'readerSha\',reader_sha,\'reviewedAt\',reviewed_at) FROM consultation_private.feedback_rollout WHERE singleton;COMMIT;'));
 check(gate.enabled===false&&gate.readerSha===state.sha,'native_gate_metadata_changed');
 const fingerprint=JSON.parse(sql('BEGIN READ ONLY;'+fixture.history+'COMMIT;'));
 const result={status:'PASS_READONLY_NATIVE_REVOKE_AND_FULL_ADAPTER_POSTSTATE',sha:state.sha,runId:state.id,checkedAt:new Date().toISOString(),ownerIdentity:'same synthetic owner verified through native GoTrue getUser',ownerGet:{status:403,code:response.code},memberGet:{status:200,revoked:true},checks,
  actions:member.actions.map(a=>({id:a.id,sessionId:a.sessionId,actionKey:a.actionKey,version:a.version,status:a.status,actorId:a.actorId,textSha256:hash(a.text)})),
  historyAndFinancialFingerprint:fingerprint,gateEnabled:false,strictRolloutDefaultOff:strict,
  strictDefaultOffNote:'False is expected after synthetic activation: enabled is false, while reader_sha and reviewed_at audit metadata are preserved. They were not cleared to force a passing default-off assertion.',
  originalNativeRollbackSqlState:'UNOBSERVED',rollbackDdlReplayed:false,posts:0,ddlRequests:0,primaryInstallation:false,nativeOnlineAcceptance:false};
 store('readonly-confirmation.json',result);console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',reason:/^[a-z_]{1,100}$/.test(e.message)?e.message:'native_confirmation_failed_review_private_evidence',automaticReplay:false}));process.exitCode=2;});
