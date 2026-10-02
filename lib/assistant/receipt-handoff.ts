/** Consumes the existing handoff and P11 projection ports; no ticket system, transport or storage here. */
import { transitionHandoff, type Handoff } from './handoff-fixture';
import { answerFromCanonicalFixture, type RetrievalContext, type RetrievalDependencies } from './retrieval-response';
export type HandoffReceipt = {
  contractVersion:'p08.handoff.receipt.fixture.v0.1';environment:'synthetic';
  caseRef:string;subjectRef:string;beforeRevision:number;afterRevision:number;state:Handoff['state'];
  consentVersion:string|null;publicationVersionRef:string|null;occurredAt:string;sourceRef:string;transitionHash:string;
};
export type HandoffAuthority = {allowed:boolean;row:Handoff;consentVersion:string|null};
export type ReceiptDependencies = {
  readAuthority():Promise<HandoffAuthority>;
  commit(before:Handoff,after:Handoff,occurredAt:string):Promise<HandoffReceipt>;
  verifyReceipt(receipt:HandoffReceipt):Promise<{valid:boolean;subjectKey:string;caseKey:string;sourceRef:string}>;
  project(input:{before:Handoff;after:Handoff;receipt:HandoffReceipt;releaseSha:string;recordedAt:string},deps:{
    readAuthority(row:Handoff):Promise<{allowed:boolean;caseRef:string;subjectRef:string;revision:number;consentVersion:string|null}>;
    verifyReceipt(receipt:HandoffReceipt):ReturnType<ReceiptDependencies['verifyReceipt']>;
  }):Promise<{status:string;code:string;event:unknown;tracking:unknown}>;
  now():string;releaseSha:string;
};
export type ReceiptOutcome = {status:'pending_consent'|'received'|'unavailable';reason:string;receiptRef:string|null;firstHumanResponseAt:null;sla:null};
const outcome=(status:ReceiptOutcome['status'],reason:string,receiptRef:string|null=null):ReceiptOutcome=>({status,reason,receiptRef,firstHumanResponseAt:null,sla:null});
export async function forwardJudgementFixture(subjectRef:string,deps:ReceiptDependencies):Promise<ReceiptOutcome> {
  try {
    const pre=await deps.readAuthority();
    if(!pre.allowed||pre.row.subjectRef!==subjectRef)return outcome('unavailable','authority-denied');
    if(!pre.consentVersion)return outcome('pending_consent','consent-required');
    if(pre.row.state!=='pending_consent')return outcome('unavailable','existing-case-requires-own-receipt');
    const before=structuredClone(pre.row);
    const after=transitionHandoff(before,before.revision,{kind:'consent',consentVersion:pre.consentVersion},{role:'member',subjectRef});
    const receipt=await deps.commit(structuredClone(before),structuredClone(after),deps.now());
    // P11 validates the structural receipt, immutable transition hash, witness and both authority reads.
    const projected=await deps.project({before,after,receipt,releaseSha:deps.releaseSha,recordedAt:deps.now()},{
      readAuthority:async()=>{
        const a=await deps.readAuthority();return {allowed:a.allowed,caseRef:a.row.caseRef,subjectRef:a.row.subjectRef,revision:a.row.revision,consentVersion:a.consentVersion};
      },verifyReceipt:r=>deps.verifyReceipt(r),
    });
    if(projected.status!=='ready')return outcome('unavailable',projected.code);
    const post=await deps.readAuthority();
    if(!post.allowed||post.row.caseRef!==after.caseRef||post.row.subjectRef!==subjectRef||post.row.revision!==after.revision||post.row.state!=='received'
      ||post.row.consentVersion!==after.consentVersion||post.consentVersion!==after.consentVersion)return outcome('unavailable','authority-changed');
    return outcome('received','receipt-verified',receipt.sourceRef);
  } catch {return outcome('unavailable','receipt-unavailable');}
}
export async function answerAndReferFixture(request:unknown,context:RetrievalContext,read:RetrievalDependencies,handoff:ReceiptDependencies|null) {
  const response=await answerFromCanonicalFixture(request,context,read);
  if(response.reason!=='new-judgement')return {response,referral:null};
  const referral=handoff?await forwardJudgementFixture(context.subjectRef,handoff):outcome('unavailable','handoff-port-unknown');
  return {response,referral};
}
