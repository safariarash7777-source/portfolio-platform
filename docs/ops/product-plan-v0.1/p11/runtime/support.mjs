/** Consumes the owner's handoff and receipt; creates no second ticket or consent ledger. */
import {buildMeasurement,canonicalDigest,timestampValid} from './measurement.mjs';
const hex=/^[a-f0-9]{64}$/,key=/^k_[a-f0-9]{64}$/;
const exact=(o,fields)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>fields.includes(k))&&fields.every(k=>Object.hasOwn(o,k));
const rowFields=['caseRef','subjectRef','state','revision','reason','publicationVersionRef','consentVersion','ownerRef'];
const receiptFields=['contractVersion','caseRef','subjectRef','beforeRevision','afterRevision','state','consentVersion','publicationVersionRef','occurredAt','sourceRef','transitionHash','environment'];
const reason=['new-judgement','no-evidence','conflict','provider-outage'];
function validRow(r){return exact(r,rowFields)&&typeof r.caseRef==='string'&&hex.test(r.caseRef)&&typeof r.subjectRef==='string'&&hex.test(r.subjectRef)&&['pending_consent','received','assigned','resolved','closed'].includes(r.state)&&Number.isSafeInteger(r.revision)&&r.revision>=0&&reason.includes(r.reason)&&(r.publicationVersionRef===null||typeof r.publicationVersionRef==='string'&&hex.test(r.publicationVersionRef))&&(r.consentVersion===null||typeof r.consentVersion==='string'&&/^[a-z0-9._-]{1,80}$/i.test(r.consentVersion))&&(r.ownerRef===null||typeof r.ownerRef==='string'&&hex.test(r.ownerRef));}
function transition(before,after){
 if(!validRow(before)||!validRow(after)||before.caseRef!==after.caseRef||before.subjectRef!==after.subjectRef||after.revision!==before.revision+1||before.reason!==after.reason||before.publicationVersionRef!==after.publicationVersionRef)return null;
 if(before.state==='pending_consent'&&after.state==='received'&&before.consentVersion===null&&before.ownerRef===null&&after.ownerRef===null&&after.consentVersion)return 'opened';
 if(before.state==='assigned'&&after.state==='resolved'&&before.consentVersion&&before.consentVersion===after.consentVersion&&before.ownerRef&&before.ownerRef===after.ownerRef)return 'resolved';
 return null;
}
const denied=code=>Object.freeze({status:'unavailable',code,event:null,tracking:null});
const authorityMatches=(proof,row)=>proof?.allowed===true&&proof.caseRef===row.caseRef&&proof.subjectRef===row.subjectRef&&proof.revision===row.revision&&proof.consentVersion===row.consentVersion;
export function handoffTransitionHash(before,after){if(!validRow(before)||!validRow(after))throw Error('support_invalid');return canonicalDigest({before,after});}
/** Callbacks must come from the canonical server boundary. Synthetic-only until live policy ACK. */
export async function projectSupport({before,after,receipt,releaseSha,recordedAt},deps){
 if(!validRow(before)||!validRow(after)||!exact(receipt,receiptFields))return denied('invalid_input');
 const snapshot=structuredClone({before,after,receipt});
 const action=transition(snapshot.before,snapshot.after);
 if(!action)return denied('unsupported_transition');
 const r=snapshot.receipt,row=snapshot.after;
 if(r.contractVersion!=='p08.handoff.receipt.fixture.v0.1'||r.environment!=='synthetic'||r.caseRef!==row.caseRef||r.subjectRef!==row.subjectRef||r.beforeRevision!==snapshot.before.revision||r.afterRevision!==row.revision||r.state!==row.state||r.consentVersion!==row.consentVersion||r.publicationVersionRef!==row.publicationVersionRef||!timestampValid(r.occurredAt)||!key.test(r.sourceRef)||r.transitionHash!==handoffTransitionHash(snapshot.before,row))return denied('invalid_receipt');
 try{
  const pre=await deps.readAuthority(structuredClone(row));
  if(!authorityMatches(pre,row))return denied('authority_denied');
  const witness=await deps.verifyReceipt(structuredClone(r));
  if(witness?.valid!==true||!key.test(witness.subjectKey)||!key.test(witness.caseKey)||witness.sourceRef!==r.sourceRef)return denied('receipt_unverified');
  const post=await deps.readAuthority(structuredClone(row));
  if(!authorityMatches(post,row))return denied('authority_changed');
  const event=buildMeasurement({type:'support.lifecycle',occurredAt:r.occurredAt,recordedAt,environment:r.environment,releaseSha,sourceContract:'support-boundary.v0.1',sourceRef:r.sourceRef,subjectKey:witness.subjectKey,cohortKey:null,versionKey:null,dimensions:{action,category:'assistant'}});
  return Object.freeze({status:'ready',code:'ok',event,tracking:Object.freeze({caseKey:witness.caseKey,state:row.state,revision:row.revision,receiptAt:r.occurredAt,firstHumanResponseAt:null,sla:null,dataKind:'synthetic'})});
 }catch{return denied('support_unavailable');}
}
