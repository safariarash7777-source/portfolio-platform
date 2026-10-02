// Offline reference only. No persistence, HTTP, provider, identity or fee calculation.
import { createHash } from 'node:crypto';
export const VERSION = 'partner-report.v0.1';
const types = ['conditions_viewed','referral_clicked','registration_reported','partner_confirmed','activity_reported','commission_reported','invoice_reported','receipt_reported'];
const keys = ['schema_version','partner_id','contract_id','contract_version','offer_id','source_event_id','source_revision','referral_ids','member_ref','consent_ref','external_subject_ref','event_type','occurred_at','received_at','period','source_ref','source_hash','amount','unit','fee_basis_ref','verification','corrects_event_id'];
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const nullable = value => value === null || text(value);
const time = value => typeof value === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const eventKey = e => JSON.stringify([e.partner_id,e.source_event_id,e.source_revision]);
const seriesKey = e => JSON.stringify([e.partner_id,e.source_event_id]);
const normalized = e => Object.fromEntries(keys.map(k => [k,e[k]]));
// received_at is transport metadata: replay may arrive at another time.
const content = e => JSON.stringify({...normalized(e),received_at:null});
export function validate(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).length !== keys.length || !keys.every(k => Object.hasOwn(e,k))) return 'shape';
  if (e.schema_version !== VERSION || !['partner_id','contract_id','contract_version','offer_id','source_event_id','period','source_ref'].every(k => text(e[k]))) return 'reference';
  if (!Number.isSafeInteger(e.source_revision) || e.source_revision < 1) return 'revision';
  if (!Array.isArray(e.referral_ids) || e.referral_ids.length > 10 || !e.referral_ids.every(text) || new Set(e.referral_ids).size !== e.referral_ids.length) return 'referrals';
  if (!['member_ref','consent_ref','external_subject_ref','fee_basis_ref','corrects_event_id'].every(k => nullable(e[k]))) return 'nullable-reference';
  if (!types.includes(e.event_type) || !['reported','verified'].includes(e.verification)) return 'event';
  if (!time(e.occurred_at) || !time(e.received_at) || Date.parse(e.occurred_at) > Date.parse(e.received_at)) return 'time';
  if (!/^[a-f0-9]{64}$/.test(e.source_hash)) return 'source-hash';
  if (e.amount !== null && (typeof e.amount !== 'string' || !/^-?(0|[1-9]\d*)$/.test(e.amount) || e.amount.length > 40)) return 'amount';
  if (e.amount === null ? e.unit !== null : !['IRR','IRT'].includes(e.unit)) return 'unit';
  // No real verifier is installed; fixtures must never claim verified facts.
  if (e.verification !== 'reported') return 'verification-not-authorized';
  return null;
}
export function preview(incoming, accepted = []) {
  const journal = accepted.map(e => structuredClone(e));
  const rows = [];
  for (const raw of incoming) {
    const e = structuredClone(raw), error = validate(e);
    if (error) { rows.push({status:'rejected',reason:error,event:e}); continue; }
    const same = journal.find(old => eventKey(old) === eventKey(e));
    if (same) { rows.push({status:content(same) === content(e) ? 'duplicate' : 'conflict',reason:'event-identity',event:e}); continue; }
    const history = journal.filter(old => seriesKey(old) === seriesKey(e));
    const latest = history.at(-1);
    if (!latest && (e.source_revision !== 1 || e.corrects_event_id !== null)) {
      rows.push({status:'conflict',reason:'missing-original',event:e}); continue;
    }
    if (latest && (e.source_revision !== latest.source_revision+1 || e.corrects_event_id !== eventKey(latest))) {
      rows.push({status:'conflict',reason:'correction-chain',event:e}); continue;
    }
    if (latest && ['contract_id','contract_version','offer_id','period','event_type','member_ref','consent_ref','external_subject_ref'].some(k => e[k] !== latest[k])) {
      rows.push({status:'conflict',reason:'historical-context-change',event:e}); continue;
    }
    journal.push(e);
    rows.push({status:'accepted',reason:latest ? 'correction-appended' : 'new',event:e});
  }
  return {rows,journal};
}
export function reconcile(journal) {
  const latest = new Map();
  for (const e of journal) latest.set(seriesKey(e),e);
  const active = [...latest.values()];
  const queue = active.flatMap(e => {
    const issues=[];
    if (e.referral_ids.length !== 1) issues.push(e.referral_ids.length ? 'multiple-referrals' : 'unattributed');
    if (e.member_ref === null) issues.push('unmatched-member');
    if (e.member_ref !== null && e.consent_ref === null) issues.push('missing-consent');
    return issues.map(reason => ({event_id:eventKey(e),reason}));
  });
  const groups = new Map();
  for (const e of active.filter(e => ['commission_reported','invoice_reported'].includes(e.event_type))) {
    const k=JSON.stringify([e.partner_id,e.contract_id,e.contract_version,e.period,e.unit]);
    if (!groups.has(k)) groups.set(k,{key:k,commission:[],invoice:[]});
    groups.get(k)[e.event_type === 'commission_reported' ? 'commission' : 'invoice'].push(e);
  }
  const comparisons=[...groups.values()].map(g => {
    const sum = events => !events.length || events.some(e => e.amount===null) ? null : events.reduce((s,e)=>s+BigInt(e.amount),0n).toString();
    const commission=sum(g.commission),invoice=sum(g.invoice);
    return {key:g.key,reported_commission:commission,reported_invoice:invoice,status:commission===null || invoice===null ? 'incomplete' : commission===invoice ? 'reported-match' : 'reported-mismatch'};
  });
  return {label:'نمونه ساختگی؛ تأیید و وصول نشده',active_events:active.length,queue,comparisons,calculated_fee:null,verified_commission:null,collected_amount:null,verified_aum:null};
}
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const correctionRef = eventKey;
