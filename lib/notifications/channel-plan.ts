/** channel-admission.v0-draft: pure mockable planning contract, deliberately unmounted. */
export type AdmissionInput={
 now:number;observedAt:number;operationKey:string;alreadyRecorded:boolean;
 ingressVerified:boolean;identityVerified:boolean;linkCurrent:boolean;scopeBound:boolean;
 canonicalAccess:'allowed'|'denied'|'unavailable';
 channelConsent:boolean;botAdmin:boolean;canInviteUsers:boolean;
 memberState:'pending'|'member'|'absent'|'unknown';
};
export type AdmissionPlan={action:'approve'|'decline'|'hold'|'already_member'|'review_removal'|'duplicate';reason:string};
export function planChannelAdmission(i:AdmissionInput):AdmissionPlan {
 if(!i.ingressVerified||!i.identityVerified||!i.linkCurrent||!i.scopeBound)return {action:'hold',reason:'verified_binding_required'};
 if(!Number.isFinite(i.now)||!Number.isFinite(i.observedAt)||i.now<i.observedAt||i.now-i.observedAt>30000||i.canonicalAccess==='unavailable')return {action:'hold',reason:'fresh_canonical_decision_required'};
 if(!i.operationKey||i.alreadyRecorded)return {action:i.operationKey?'duplicate':'hold',reason:'durable_operation_receipt_required'};
 if(!i.botAdmin||!i.canInviteUsers)return {action:'hold',reason:'owner_verified_bot_rights_required'};
 if(i.canonicalAccess==='denied'||!i.channelConsent)return i.memberState==='member'
  ?{action:'review_removal',reason:'owner_removal_policy_required'}:i.memberState==='pending'?{action:'decline',reason:'access_and_separate_channel_consent_required'}:{action:'hold',reason:'actual_join_request_required'};
 if(i.memberState==='unknown')return {action:'hold',reason:'membership_observation_required'};
 if(i.memberState==='member')return {action:'already_member',reason:'membership_is_not_payment_or_consent'};
 if(i.memberState!=='pending')return {action:'hold',reason:'actual_join_request_required'};
 return {action:'approve',reason:'recheck_before_future_transport'};
}
