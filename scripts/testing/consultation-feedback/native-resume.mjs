/** One bounded continuation after the known rollback diagnostic assertion failure.
 * Never replays the discarded POST, consent, financial v1, or the rollback DDL.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {state,read,post,exchange,goalVersion,sql,identity,store,setupJars,resumePosts} from './native-extension.mjs';
import {local,root,origin} from './native-lab.mjs';
const check=(v,c)=>{if(!v)throw Error(c);};
const hash=v=>createHash('sha256').update(v).digest('hex');
async function main(){
 await identity();await setupJars();const priorPosts=resumePosts();
 const prior=JSON.parse(readFileSync(resolve(local,'extension-started.json'),'utf8'));
 check(prior.sha===state.sha&&prior.runId===state.id,'resume_original_run_changed');
 const before=JSON.parse(sql(`SELECT jsonb_build_object('relation',(SELECT id FROM public.consultation_relationships WHERE client_id='${state.users.b.id}' AND advisor_id='${state.users.owner.id}'),'kernel',(SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('consultation_private.execute(jsonb)')),'gateEnabled',(SELECT enabled FROM consultation_private.feedback_rollout WHERE singleton));`));
 check(before.kernel==='e65e1a32348c961f2b409a4f6593c05f'&&before.gateEnabled===false,'rollback_readback_kernel_or_gate_mismatch');
 const member=await read('b',before.relation),advisor=await read('owner',before.relation);
 check(member.actions.length===2&&member.actions.some(a=>a.status==='partial'&&a.version===1&&a.text==='Synthetic partial after native write')&&member.actions.some(a=>a.status==='not_done'&&a.version===2&&a.text==='Synthetic not done native detail'),'resume_feedback_not_exact');
 check(member.sessions.length===1&&advisor.sessions.length===1&&advisor.dossier.goals.version===1&&member.capabilities.extendedFeedbackWrite===false,'resume_not_at_known_checkpoint');
 const session=advisor.sessions[0],body=session.body,firstGoals=advisor.dossier.basis.goalsVersionId;
 store('resume-started.json',{reason:'Known rollback diagnostic used non-verbose psql, so SQLSTATE was not captured; no DDL replay',sha:state.sha,runId:state.id,priorDriverSha256:prior.driverSha256,priorPostAttempts:priorPosts,currentDriverSha256:hash(readFileSync(resolve(root,'scripts/testing/consultation-feedback/native-extension.mjs'))),resumeDriverSha256:hash(readFileSync(new URL(import.meta.url))),observedKernel:before.kernel,historySha256:hash(JSON.stringify(member.actions))});
 const passes=[{scenario:'prior rollback left compatible kernel, disabled gate and exact native history; read-only verification, no DDL replay',status:'PASS_WITH_SQLSTATE_NOT_CAPTURED_LIMIT'}];
 const second=await post('owner',{kind:'save',relationshipId:before.relation,sessionKey:session.sessionKey,baseVersion:1,body,privateNote:null});
 const transition=async(kind,id,expected=201)=>{const current=(await read('owner',before.relation)).sessions.find(s=>s.id===id);return post('owner',{kind,relationshipId:before.relation,sessionId:id,contentHash:current.contentHash,note:null},expected);};
 await transition('submit',second.id);const next=await goalVersion(1);check(next.versionId!==firstGoals,'resume_second_financial_version_missing');
 await transition('approve',second.id,409);const stale=await read('owner',before.relation);check(stale.sessions.find(s=>s.id===second.id).state==='submitted'&&!stale.sessions.find(s=>s.id===second.id).approval,'resume_stale_basis_approved');
 check((await read('b',before.relation)).sessions.length===1,'resume_unpublished_draft_visible');
 passes.push({scenario:'second financial version through native API blocks approval of v1 financial basis',status:'PASS'});
 await post('b',{kind:'revoke',relationshipId:before.relation});
 const forbidden=await fetch(origin+'/api/consultation?'+new URLSearchParams({relationshipId:before.relation,startOn:'2026-10-01',endOn:'2026-10-31'}),{redirect:'error',signal:AbortSignal.timeout(15000)});
 check(forbidden.status===401,'guest_should_not_read');
 const ownerDenied=await exchange('owner','/api/consultation?'+new URLSearchParams({relationshipId:before.relation,startOn:'2026-10-01',endOn:'2026-10-31'}),'GET',undefined,403);check(ownerDenied.code==='FORBIDDEN','resume_revoked_owner_not_exactly_forbidden');
 const revoked=await read('b',before.relation);check(revoked.selected.revoked&&JSON.stringify(revoked.actions)===JSON.stringify(member.actions)&&revoked.notes.length===0,'resume_revoke_history_mismatch');
 passes.push({scenario:'native revoke blocks advisor; member retains exact partial/not_done history and no private note',status:'PASS'});
 const result={status:'PASS_LOCAL_NATIVE_CONTINUATION_WITH_RECORDED_ROLLBACK_LIMIT',sha:state.sha,runId:state.id,checkedAt:new Date().toISOString(),priorScenariosPassed:4,continuationScenarios:passes.length,totalExtendedScenarios:7,passes,
  priorRollbackSqlState:'NOT_CAPTURED_IN_FIRST_NATIVE_ATTEMPT',rollbackPostState:'COMPATIBLE_KERNEL_AND_EXACT_HISTORY_VERIFIED_READ_ONLY',rollbackDdlReplayed:false,
  rollbackPt409VerifiedSeparately:'adapter-sql-receipt.json, both real PG17 permission profiles',nativeAuth:'fresh isolated GoTrue users and PostgREST; real Next routes',
  financialVersionsCreated:2,feedbackBalanceMutation:false,discardedFeedbackPostReplayed:false,operationalGateActivation:false,primaryInstallation:false,nativeOnlineAcceptance:false,browser:'NOT_RUN',cleanup:'PENDING_OWNER_ONLY'};
 store('resume-result.json',result);console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(JSON.stringify({status:'BLOCKED',reason:/^[a-z_]{1,100}$/.test(error.message)?error.message:'native_resume_failed_review_private_receipts',automaticReplay:false}));process.exitCode=2;});
