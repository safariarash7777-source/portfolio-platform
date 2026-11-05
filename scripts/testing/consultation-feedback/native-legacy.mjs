/** Targeted new-reader/old-SQL native check. Does not run the prior 24 scenarios. */
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {state,read,post,exchange,sql,identity,store,setupJars} from './native-extension.mjs';
import {legacyMode,origin,attest} from './native-lab.mjs';
const check=(v,c)=>{if(!v)throw Error(c);};
const hash=v=>createHash('sha256').update(v).digest('hex');
function metadata(){return JSON.parse(sql("BEGIN READ ONLY;SELECT jsonb_build_object('command',(SELECT md5(replace(prosrc,E'\\r\\n',E'\\n')) FROM pg_proc WHERE oid=to_regprocedure('consultation_private.command(jsonb)')),'execute',(SELECT md5(replace(prosrc,E'\\r\\n',E'\\n')) FROM pg_proc WHERE oid=to_regprocedure('consultation_private.execute(jsonb)')),'load',(SELECT md5(replace(prosrc,E'\\r\\n',E'\\n')) FROM pg_proc WHERE oid=to_regprocedure('consultation_private.load(uuid,date,date)')),'gateAbsent',to_regclass('consultation_private.feedback_rollout') IS NULL,'statuses',(SELECT array_agg(m[1] ORDER BY m[1]) FROM pg_constraint c CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid),'''([^'']*)''','g') m WHERE c.conrelid='public.consultation_actions'::regclass AND c.conname='consultation_actions_status_check' AND c.convalidated));COMMIT;"));}
async function counter(){await identity();const value=await(await fetch(origin+'/__consultation_lab_identity',{redirect:'error',signal:AbortSignal.timeout(5000)})).json();check(value.runId===state.id&&value.sha===state.sha&&Number.isSafeInteger(value.commandRpcCalls),'legacy_counter_identity');return value.commandRpcCalls;}
function rowCounts(){return JSON.parse(sql("BEGIN READ ONLY;SELECT jsonb_build_object('receipts',(SELECT count(*) FROM public.consultation_command_receipts),'actions',(SELECT count(*) FROM public.consultation_actions),'financialVersions',(SELECT count(*) FROM public.member_holding_versions)+(SELECT count(*) FROM public.member_cash_flow_versions)+(SELECT count(*) FROM public.member_goals_versions));COMMIT;"));}

async function main(){
 check(legacyMode&&state.schemaMode==='legacy5','explicit_legacy_schema_required');await identity();await setupJars();
 const warm=await fetch(origin+'/api/consultation',{redirect:'error',signal:AbortSignal.timeout(120000)});check(warm.status===401,'legacy_guest_route_not_ready');
 store('legacy-started.json',{sha:state.sha,runId:state.id,driverSha256:hash(readFileSync(new URL(import.meta.url))),schemaMode:state.schemaMode,startedAt:new Date().toISOString()});
 const beforeMeta=metadata();
 check(beforeMeta.command==='54dd2351f7ca5ac458e7feb52729c88d'&&beforeMeta.execute==='da2199a556779a36286deb2f534404a9'&&beforeMeta.load==='ca3cf9c59e64d0bf8a442413635a3ac3'&&beforeMeta.gateAbsent&&JSON.stringify(beforeMeta.statuses)===JSON.stringify(['acknowledged','doing','done','question','viewed']),'legacy_schema_not_exact');
 const relation=(await post('b',{kind:'grant',advisorId:state.users.owner.id,clientLabel:'Legacy member B'})).id;
 const basis=(await read('owner',relation)).dossier.basis,actionKey=randomUUID(),sessionKey=randomUUID();
 const body={topic:'Legacy SQL reader acceptance',goal:'Synthetic legacy check',clientSummary:'Synthetic old history remains readable',rationale:'Synthetic only',limitations:'Owned legacy lab, no primary changes',reviewOn:'2099-12-31',basis,researchVersionIds:[],evidence:[{label:'Synthetic legacy schema',url:null,asOf:'2026-10-29'}],actions:[{actionKey,title:'Legacy agreed action',dueOn:'2099-12-31',responsible:'member'}]};
 const saved=await post('owner',{kind:'save',relationshipId:relation,sessionKey,baseVersion:0,body,privateNote:'LEGACY_PRIVATE_CANARY'});
 for(const kind of ['submit','approve','publish']){const session=(await read('owner',relation)).sessions.find(s=>s.id===saved.id);await post('owner',{kind,relationshipId:relation,sessionId:saved.id,contentHash:session.contentHash,note:null});}
 const feedback={kind:'feedback',relationshipId:relation,sessionId:saved.id,actionKey,baseVersion:0,status:'doing',text:null};
 const oldReceipt=await post('b',feedback);
 // This existing RPC is read-only. The native GoTrue bearer token is used by exchange.
 const raw=await exchange('b','/rest/v1/rpc/load_consultation','POST',{p_relation:relation,p_start_on:'2026-10-01',p_end_on:'2026-10-31'},200);
 check(raw.contractVersion==='consultation-read.v1'&&!Object.hasOwn(raw,'capabilities'),'legacy_raw_capability_should_be_absent');
 const loaded=await read('b',relation);
 check(loaded.capabilities.extendedFeedbackWrite===false&&loaded.actions.length===1&&loaded.actions[0].id===oldReceipt.id&&loaded.actions[0].status==='doing'&&loaded.notes.length===0&&!JSON.stringify(loaded).includes('LEGACY_PRIVATE_CANARY'),'new_reader_did_not_preserve_legacy_history');
 const callsBefore=await counter(),countsBefore=rowCounts(),denials=[];
 for(const status of ['partial','not_done']){const denied=await post('b',{...feedback,baseVersion:1,status,text:'Synthetic blocked legacy '+status},409);check(denied.code==='FEEDBACK_DISABLED','legacy_post_not_exactly_disabled');denials.push({status,httpStatus:409,code:denied.code});}
 const callsAfter=await counter(),countsAfter=rowCounts(),after=await read('b',relation);
 check(callsAfter===callsBefore&&JSON.stringify(countsAfter)===JSON.stringify(countsBefore)&&JSON.stringify(after.actions)===JSON.stringify(loaded.actions),'legacy_post_reached_write_or_changed_history');
 check(JSON.stringify(metadata())===JSON.stringify(beforeMeta),'legacy_schema_changed');
 await post('b',{kind:'revoke',relationshipId:relation});
 const revoked=await read('b',relation);check(revoked.selected.revoked&&JSON.stringify(revoked.actions)===JSON.stringify(loaded.actions),'legacy_revoke_lost_history');
 const denied=await exchange('owner','/api/consultation?'+new URLSearchParams({relationshipId:relation,startOn:'2026-10-01',endOn:'2026-10-31'}),'GET',undefined,403);check(denied.code==='FORBIDDEN','legacy_revoked_owner_not_exact');
 const result={status:'PASS_NEW_READER_ON_OLD_SQL_LOCAL_NATIVE',sha:state.sha,runId:state.id,checkedAt:new Date().toISOString(),schemaMode:state.schemaMode,schemaMetadata:beforeMeta,
  rawLegacyCapability:'ABSENT',newGetCapability:{extendedFeedbackWrite:false},legacyHistory:{id:oldReceipt.id,status:'doing',version:1,actorId:state.users.b.id,relationshipId:relation},
  denials,commandRpcCalls:{before:callsBefore,after:callsAfter,delta:callsAfter-callsBefore},databaseCounts:{before:countsBefore,after:countsAfter},
  historyUnchanged:true,schemaUnchanged:true,oldHistoryReadableAfterRevoke:true,ownerAfterRevoke:{status:403,code:denied.code},
  financialWrites:0,guardedMigrationApplied:false,gateActivation:false,reusedRetiredAccounts:false,realMemberAccountsUsed:0,nativeSyntheticUsers:4,prior24ScenariosRepeated:false,
  destination:'owned isolated loopback lab, new native GoTrue users/real PostgREST/Next',isolation:attest(state),primaryInstallation:false,realDeployedReaderAcceptance:false,browser:'PENDING_FILTER_CHECK',cleanup:'PENDING_OWNER_ONLY'};
 store('legacy-result.json',result);console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',reason:/^[a-z_]{1,100}$/.test(e.message)?e.message:'native_legacy_failed_review_private_receipts',automaticReplay:false}));process.exitCode=2;});
