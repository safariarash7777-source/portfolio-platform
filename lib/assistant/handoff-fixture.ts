/** Local consent/version contract. No ticket write, customer storage or message transmission. */
export type HandoffState = 'pending_consent' | 'received' | 'assigned' | 'resolved' | 'closed';
export type Handoff = {
  caseRef: string; subjectRef: string; state: HandoffState; revision: number;
  reason: 'new-judgement' | 'no-evidence' | 'conflict' | 'provider-outage';
  publicationVersionRef: string | null; consentVersion: string | null; ownerRef: string | null;
};
export type HandoffAction =
  | { kind: 'consent'; consentVersion: string }
  | { kind: 'assign'; ownerRef: string }
  | { kind: 'resolve' }
  | { kind: 'close' }
  | { kind: 'revoke-consent' };
const opaque = /^[a-f0-9]{64}$/;
export function transitionHandoff(caseRow: Handoff, expectedRevision: number, action: HandoffAction, authority: { role:'member'; subjectRef:string } | { role:'operator'; hasCaseGrant:boolean }): Handoff {
  if (caseRow.revision !== expectedRevision) throw Error('version-conflict');
  if (!opaque.test(caseRow.caseRef) || !opaque.test(caseRow.subjectRef)) throw Error('invalid-case');
  if (authority.role === 'member' ? authority.subjectRef !== caseRow.subjectRef : !authority.hasCaseGrant) throw Error('case-denied');
  const row = { ...caseRow, revision: caseRow.revision + 1 };
  if (action.kind === 'consent' && authority.role === 'member' && row.state === 'pending_consent' && /^[a-z0-9._-]{1,80}$/i.test(action.consentVersion)) {
    return { ...row, state:'received', consentVersion:action.consentVersion };
  }
  if (action.kind === 'revoke-consent' && authority.role === 'member') return {...row,state:'closed',consentVersion:null,ownerRef:null};
  if (!row.consentVersion) throw Error('consent-required');
  if (action.kind === 'assign' && authority.role === 'operator' && row.state === 'received' && opaque.test(action.ownerRef)) return {...row,state:'assigned',ownerRef:action.ownerRef};
  if (action.kind === 'resolve' && authority.role === 'operator' && row.state === 'assigned') return {...row,state:'resolved'};
  if (action.kind === 'close' && (row.state === 'received' || row.state === 'assigned' || row.state === 'resolved')) return {...row,state:'closed'};
  throw Error('transition-denied');
}
/** Restricted P08 metadata, NOT a measurement.v0.1 event. */
export function handoffMetric(row: Handoff) {
  return { contract:'p08.handoff.fixture.v0.1', caseRef:row.caseRef, state:row.state, revision:row.revision, reason:row.reason };
}
/** Only project a witnessed canonical transition. This emits dimensions, not a collector event. */
export function p11SupportDimensions(before: Handoff, after: Handoff, receiptWitnessed: boolean) {
  if (!receiptWitnessed) return null;
  if (!opaque.test(before.caseRef) || !opaque.test(before.subjectRef) || before.caseRef !== after.caseRef || before.subjectRef !== after.subjectRef
    || !Number.isSafeInteger(before.revision) || before.revision < 0 || after.revision !== before.revision + 1
    || before.reason !== after.reason || before.publicationVersionRef !== after.publicationVersionRef) return null;
  if (before.state === 'pending_consent' && after.state === 'received' && before.consentVersion === null && before.ownerRef === null
    && after.ownerRef === null && after.consentVersion !== null && /^[a-z0-9._-]{1,80}$/i.test(after.consentVersion)) return { action:'opened', category:'assistant' } as const;
  if (before.state === 'assigned' && after.state === 'resolved' && before.consentVersion !== null
    && before.consentVersion === after.consentVersion && before.ownerRef !== null && opaque.test(before.ownerRef)
    && before.ownerRef === after.ownerRef) return { action:'resolved', category:'assistant' } as const;
  // assigned != responded; closed != resolved. No invented response receipt.
  return null;
}
