/** Separate post-resume native scenario with populated financial ledgers. */
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {state,read,post,exchange,sql,identity,store,setupJars,resumePosts} from './native-extension.mjs';
import {root,local} from './native-lab.mjs';
const check=(v,c)=>{if(!v)throw Error(c);};
const hash=v=>createHash('sha256').update(v).digest('hex');
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const load=async path=>{const m=await import(pathToFileURL(resolve(root,path)));return m.default??m;};
const input=await load('lib/portfolio/financialInput.ts'),cash=await load('lib/portfolio/cashFlowApiContract.ts');
const period={startOn:'2026-10-01',endOn:'2026-10-31'},date='2026-10-29';
const getHoldings=()=>exchange('b','/api/portfolio/holdings');
async function getCash(){const value=await exchange('b','/api/personal-finance/cash-flow?'+new URLSearchParams(period));return cash.validateCashFlowRead(value,{ownerId:state.users.b.id,period});}
const tables=['member_holding_versions','member_holding_positions','member_cash_flow_versions','member_cash_flow_entries','member_goals_versions'];
function financialFingerprint(){return JSON.parse(sql('BEGIN READ ONLY;SELECT jsonb_build_object('+tables.map(name=>`'${name}',(SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]'),'UTF8')),'hex')) FROM public.${name} r)`).join(',')+');COMMIT;'));}

async function main(){
 await identity();await setupJars();resumePosts();
 store('nonzero-started.json',{sha:state.sha,runId:state.id,driverSha256:hash(readFileSync(new URL(import.meta.url))),phase:'separate scenario after completed resume',startedAt:new Date().toISOString()});
 const emptyHolding=await getHoldings(),emptyCash=await getCash();
 check(emptyHolding.ownerId===state.users.b.id&&emptyHolding.state==='empty'&&emptyHolding.version===null&&emptyCash.state==='empty'&&emptyCash.latest.version===0,'nonzero_scenario_requires_fresh_financial_ledgers');
 const position={position_key:'synthetic-nonzero-cash',manual_label:'Synthetic declared cash balance',symbol:null,asset_class:'cash',qty:null,unit:'item',as_of:date,title:'Synthetic nonzero acceptance',ownership_pct:100,valuation_mode:'declared',declared_value:1000000,currency:'IRT',valuation_source:'Synthetic member declaration only',valuation_as_of:date,valuation_status:'estimated'};
 const normalized=input.normalisePosition(position);check(normalized.declared_value===1000000,'nonzero_position_contract_invalid');
 const holdingRequest={base_version:0,client_token:'start-a-nonzero-holdings-'+randomUUID(),positions:[position],note:'Synthetic native acceptance only'};
 const holdingReceipt=await exchange('b','/api/portfolio/holdings','POST',holdingRequest,201);
 check(holdingReceipt.version===1&&holdingReceipt.position_count===1&&/^[a-f0-9-]{36}$/.test(holdingReceipt.version_id),'nonzero_holdings_receipt_invalid');
 const source={label:'Synthetic scoped financial statement',observedOn:date};
 const payload={contractVersion:1,period,accountDefinitions:[{accountKey:'synthetic-bank',label:'Synthetic bank account'}],scopeAccountKeys:['synthetic-bank'],
  opening:{amountToman:500000,atStartOn:period.startOn,source},coverage:{planned:{status:'unknown',memberAffirmed:false,source:null},actual:{status:'complete',memberAffirmed:true,source}},
  entries:[{entryKey:'synthetic-income',basis:'actual',kind:'income',accountKey:'synthetic-bank',amountToman:100000,occurredOn:'2026-10-02',source,category:null,note:null},
           {entryKey:'synthetic-expense',basis:'actual',kind:'expense',accountKey:'synthetic-bank',amountToman:20000,occurredOn:'2026-10-03',source,category:null,note:null}]};
 const cashRequest=cash.validateCashFlowWriteRequest({contractVersion:'cash-flow-request.v1',expectedOwnerId:state.users.b.id,clientToken:'start-a-nonzero-cash-'+randomUUID(),baseVersion:0,payload});
 const cashReceipt=cash.validateCashFlowReceipt(await exchange('b','/api/personal-finance/cash-flow','POST',cashRequest,201),cashRequest);
 const beforeHoldings=await getHoldings(),beforeCash=await getCash(),beforeFingerprint=financialFingerprint();
 check(beforeHoldings.state==='ready'&&beforeHoldings.version.id===holdingReceipt.version_id&&beforeHoldings.positions.length===1&&beforeHoldings.positions[0].declared_value===1000000,'nonzero_holdings_readback_invalid');
 check(beforeCash.snapshot.id===cashReceipt.versionId&&beforeCash.snapshot.payload.entries.length===2&&beforeCash.report.actual.netToman===80000&&beforeCash.report.actual.closingToman===580000&&beforeCash.report.planned.netToman===null,'nonzero_cash_readback_invalid');
 check(beforeFingerprint.member_holding_positions.count===1&&beforeFingerprint.member_cash_flow_entries.count===2,'nonzero_child_rows_missing');
 store('nonzero-before.json',{holdingReceipt,cashReceipt,holdings:beforeHoldings,cashflow:beforeCash,fingerprint:beforeFingerprint});
 const grant=await post('b',{kind:'grant',advisorId:state.users.owner.id,clientLabel:'Synthetic populated financial scenario'}),relation=grant.id;
 const dossier=(await read('owner',relation)).dossier;
 check(dossier.basis.holdingsVersionId===holdingReceipt.version_id&&dossier.basis.cashFlowVersionId===cashReceipt.versionId,'nonzero_recommendation_basis_not_exact');
 const actionKey=randomUUID(),sessionKey=randomUUID();
 const body={topic:'Synthetic populated financial case',goal:'Synthetic only',clientSummary:'Synthetic nonzero balance acceptance',rationale:'Synthetic reason',limitations:'Synthetic acceptance; no real member or advice',reviewOn:'2099-12-31',basis:dossier.basis,researchVersionIds:[],evidence:[{label:'Synthetic financial record',url:null,asOf:date}],actions:[{actionKey,title:'Synthetic agreed action',dueOn:'2099-12-31',responsible:'member'}]};
 const saved=await post('owner',{kind:'save',relationshipId:relation,sessionKey,baseVersion:0,body,privateNote:null});
 for(const kind of ['submit','approve','publish']){const current=(await read('owner',relation)).sessions.find(s=>s.id===saved.id);await post('owner',{kind,relationshipId:relation,sessionId:saved.id,contentHash:current.contentHash,note:null});}
 sql(`UPDATE consultation_private.feedback_rollout SET enabled=true,reader_sha='${state.sha}',reviewed_at=now() WHERE singleton`);
 const cases=[];
 for(const [version,status] of ['partial','not_done'].entries()){
  const command={kind:'feedback',relationshipId:relation,sessionId:saved.id,actionKey,baseVersion:version,status,text:'Synthetic nonzero check '+status};
  const receipt=await post('b',command),loaded=await read('b',relation);
  check(loaded.actions.some(a=>a.id===receipt.id&&a.actorId===state.users.b.id&&a.version===version+1&&a.actionKey===actionKey&&a.status===status&&a.text===command.text),'nonzero_feedback_readback_invalid');
  const holdings=await getHoldings(),flow=await getCash(),fingerprint=financialFingerprint();
  check(stable(holdings)===stable(beforeHoldings)&&stable(flow)===stable(beforeCash)&&stable(fingerprint)===stable(beforeFingerprint),'feedback_changed_populated_financial_ledgers');
  const evidence={status,receiptId:receipt.id,feedbackVersion:receipt.version,holdingVersion:holdings.version,cashVersion:{id:flow.snapshot.id,version:flow.snapshot.version},declaredValueToman:holdings.positions[0].declared_value,
   openingToman:flow.report.opening.amountToman,actualNetToman:flow.report.actual.netToman,actualClosingToman:flow.report.actual.closingToman,plannedNetToman:flow.report.planned.netToman,
   holdingsDtoSha256:hash(stable(holdings)),cashDtoSha256:hash(stable(flow)),financialFingerprint:fingerprint,exactFinancialReadbackUnchanged:true};
  cases.push(evidence);store('nonzero-'+status.replaceAll('_','-')+'.json',evidence);
 }
 sql('UPDATE consultation_private.feedback_rollout SET enabled=false WHERE singleton');
 check((await read('b',relation)).capabilities.extendedFeedbackWrite===false,'nonzero_test_gate_not_closed');
 // End this synthetic service relationship explicitly; do not leave an active grant.
 await post('b',{kind:'revoke',relationshipId:relation});
 const ownerDenied=await exchange('owner','/api/consultation?'+new URLSearchParams({...period,relationshipId:relation}),'GET',undefined,403);check(ownerDenied.code==='FORBIDDEN','nonzero_revoke_not_exact');
 const result={status:'PASS_NATIVE_POPULATED_FINANCIAL_LEDGER_PRESERVATION',sha:state.sha,runId:state.id,checkedAt:new Date().toISOString(),relationshipId:relation,
  memberId:state.users.b.id,syntheticFinancialWrites:2,holdingRows:1,cashFlowEntryRows:2,before:{holdingVersion:beforeHoldings.version,cashVersion:{id:beforeCash.snapshot.id,version:beforeCash.snapshot.version},holdingsDtoSha256:hash(stable(beforeHoldings)),cashDtoSha256:hash(stable(beforeCash)),financialFingerprint:beforeFingerprint},cases,
  gateEnabledOnlyInSyntheticDatabase:true,gateClosedAtEnd:true,relationshipRevokedAtEnd:true,primaryInstallation:false,nativeOnlineAcceptance:false};
 store('nonzero-result.json',result);console.log(JSON.stringify(result));
}
async function finishAfterKnownFilenameRejection(){
 await identity();await setupJars();resumePosts();
 const before=JSON.parse(readFileSync(resolve(local,'extension-nonzero-before.json'),'utf8'));
 const partial=JSON.parse(readFileSync(resolve(local,'extension-nonzero-partial.json'),'utf8'));
 const prior=JSON.parse(readFileSync(resolve(local,'extension-nonzero-started.json'),'utf8'));
 const files=readdirSync(local).filter(n=>/^extension-intent-\d+\.json$/.test(n)).sort();
 const found=files.map(name=>({name,value:JSON.parse(readFileSync(resolve(local,name),'utf8'))})).findLast(({value})=>value.body?.command?.kind==='feedback'&&value.body.command.status==='not_done'&&value.body.command.text==='Synthetic nonzero check not_done');
 check(found&&found.value.actorId===state.users.b.id&&prior.sha===state.sha&&prior.runId===state.id,'nonzero_finish_intent_mismatch');
 const command=found.value.body.command,responseName=found.name.replace('intent-','response-');
 const savedResponse=JSON.parse(readFileSync(resolve(local,responseName),'utf8'));check(savedResponse.status===201,'nonzero_finish_response_missing');
 const loaded=await read('b',command.relationshipId);
 check(!loaded.selected.revoked&&loaded.actions.length===2&&loaded.actions.every(a=>a.actorId===state.users.b.id&&a.sessionId===command.sessionId&&a.actionKey===command.actionKey),'nonzero_finish_history_mismatch');
 check(loaded.actions.some(a=>a.id===partial.receiptId&&a.status==='partial'&&a.version===1)&&loaded.actions.some(a=>a.id===savedResponse.value.id&&a.status==='not_done'&&a.version===2&&a.text===command.text),'nonzero_finish_effect_not_exact');
 const holdings=await getHoldings(),flow=await getCash(),fingerprint=financialFingerprint();
 check(stable(holdings)===stable(before.holdings)&&stable(flow)===stable(before.cashflow)&&stable(fingerprint)===stable(before.fingerprint),'nonzero_finish_financial_changed');
 check(holdings.positions[0].declared_value===1000000&&flow.report.actual.closingToman===580000&&flow.snapshot.payload.entries.length===2,'nonzero_finish_not_populated');
 store('nonzero-finish-started.json',{reason:'not_done underscore rejected by private filename policy after successful API/readback; no financial/feedback POST replay',priorDriverSha256:prior.driverSha256,currentDriverSha256:hash(readFileSync(new URL(import.meta.url))),notDoneIntent:found.name,notDoneReceiptId:savedResponse.value.id,financialFingerprint:fingerprint});
 const notDone={status:'not_done',receiptId:savedResponse.value.id,feedbackVersion:2,holdingVersion:holdings.version,cashVersion:{id:flow.snapshot.id,version:flow.snapshot.version},declaredValueToman:holdings.positions[0].declared_value,openingToman:flow.report.opening.amountToman,actualNetToman:flow.report.actual.netToman,actualClosingToman:flow.report.actual.closingToman,plannedNetToman:flow.report.planned.netToman,holdingsDtoSha256:hash(stable(holdings)),cashDtoSha256:hash(stable(flow)),financialFingerprint:fingerprint,exactFinancialReadbackUnchanged:true};
 store('nonzero-not-done.json',notDone);
 sql('UPDATE consultation_private.feedback_rollout SET enabled=false WHERE singleton');
 check((await read('b',command.relationshipId)).capabilities.extendedFeedbackWrite===false,'nonzero_finish_gate_not_closed');
 await post('b',{kind:'revoke',relationshipId:command.relationshipId});
 const denied=await exchange('owner','/api/consultation?'+new URLSearchParams({...period,relationshipId:command.relationshipId}),'GET',undefined,403);check(denied.code==='FORBIDDEN','nonzero_finish_revoke_not_exact');
 const result={status:'PASS_NATIVE_POPULATED_FINANCIAL_LEDGER_PRESERVATION',sha:state.sha,runId:state.id,checkedAt:new Date().toISOString(),relationshipId:command.relationshipId,memberId:state.users.b.id,
  syntheticFinancialWrites:2,holdingRows:1,cashFlowEntryRows:2,before:{holdingVersion:before.holdings.version,cashVersion:{id:before.cashflow.snapshot.id,version:before.cashflow.snapshot.version},holdingsDtoSha256:hash(stable(before.holdings)),cashDtoSha256:hash(stable(before.cashflow)),financialFingerprint:before.fingerprint},cases:[partial,notDone],
  continuation:'Known private filename rejection; readback matched exact original intent/receipt and complete financial snapshot, then only closed gate and revoked relationship',financialPostReplayed:false,feedbackPostReplayed:false,
  gateEnabledOnlyInSyntheticDatabase:true,gateClosedAtEnd:true,relationshipRevokedAtEnd:true,ownerAfterRevoke:{status:403,code:denied.code},primaryInstallation:false,nativeOnlineAcceptance:false};
 store('nonzero-result.json',result);console.log(JSON.stringify(result));
}
const execute=process.argv.includes('--finish-after-private-filename-rejection')?finishAfterKnownFilenameRejection:main;
execute().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',reason:/^[a-z_]{1,100}$/.test(e.message)?e.message:'native_nonzero_failed_review_private_receipts',automaticReplay:false}));process.exitCode=2;});
