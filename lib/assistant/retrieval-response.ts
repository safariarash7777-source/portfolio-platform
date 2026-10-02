/** Offline adapter over the real publication.v1 HTTP reader. No routes, network, index or Auth writes. */
import { createHash } from 'node:crypto';
import { getScopedPublication } from '../intelligence/publication-feed-http';
import { isPublicationDetail, type PublicationDetail } from '../intelligence/publication-feed';
import { publicationId, PUBLICATION_CONTRACT } from '../intelligence/publication';
import type { PublicationHttpAdapter } from '../intelligence/publication-http';
import type { FixtureProvider, Intent, ProviderPayload } from './fixture-service';

export type ReviewedReference = {
  sourceKey: string; versionId: string; sentence: string; privacyReviewed: boolean;
  kind: 'education' | 'decision';
};
export type QuestionPlan = { intent: Intent; disposition: 'retrieve' | 'new-judgement' | 'noanswer'; references: readonly ReviewedReference[] };
export type RetrievalContext = { subjectRef: string; cohortId: string };
export type ValidityPort = {
  contract: 'p07.validity.draft.v1';
  readBounds(versionId: string): Promise<{validFrom: unknown; validUntil: unknown}>;
  evaluate(now: unknown, from: unknown, until: unknown): 'unknown' | 'not_yet_valid' | 'within_time_window' | 'expired';
};
export type RetrievalDependencies = {
  plans: Readonly<Record<string, QuestionPlan>>;
  // Canonical adapter is authenticated by its owner, not by request parameters or history.
  connect(context: RetrievalContext): Promise<PublicationHttpAdapter>;
  validity: ValidityPort | null;
  authoritativeNow(): string;
  enabled(): boolean;
  provider: FixtureProvider;
  tokenCap: number | null;
  deadlineMs: number;
};
export type RetrievalResult = {
  outcome: 'source' | 'deny' | 'noanswer'; reason: string;
  answer?: string;
  citations: {sourceKey: string; versionId: string; version: number; href: string}[];
  needsHuman: boolean; dataClass: 'synthetic'; realCost: null;
};
const result = (outcome: RetrievalResult['outcome'], reason: string, needsHuman = false): RetrievalResult => ({outcome,reason,citations:[],needsHuman,dataClass:'synthetic',realCost:null});
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
class ReadFailure extends Error { constructor(readonly outcome:'deny'|'noanswer', reason:string) {super(reason);} }
async function resolve(ref: ReviewedReference, context: RetrievalContext, deps: RetrievalDependencies): Promise<{detail:PublicationDetail; digest:string}> {
  if (!ref.privacyReviewed || !ref.sentence.trim() || /\p{N}/u.test(ref.sentence)) throw new ReadFailure('noanswer','projection-unreviewed');
  const id=publicationId(ref.versionId),cohort=publicationId(context.cohortId);
  // Calls the existing handler and its exact canonical RPC/DTO validation with a fresh authenticated connector.
  const response=await getScopedPublication(new Request(`https://fixture.invalid/publications/${id}?cohort=${cohort}`),id,()=>deps.connect(context));
  if (response.status!==200) throw new ReadFailure([401,403,404].includes(response.status)?'deny':'noanswer',`canonical-${response.status}`);
  const raw=await response.json();
  if (raw.contractVersion!==PUBLICATION_CONTRACT || !isPublicationDetail(raw.data) || raw.data.id!==id) throw new ReadFailure('noanswer','canonical-invalid');
  const detail=raw.data as PublicationDetail;
  if (!detail.content.includes(ref.sentence)) throw new ReadFailure('noanswer','sentence-not-supported');
  let bounds: unknown=null;
  if (ref.kind==='decision') {
    if (!deps.validity || deps.validity.contract!=='p07.validity.draft.v1') throw new ReadFailure('noanswer','validity-unknown');
    bounds=await deps.validity.readBounds(id);
    const b=bounds as {validFrom:unknown;validUntil:unknown};
    const status=deps.validity.evaluate(deps.authoritativeNow(),b.validFrom,b.validUntil);
    if (status!=='within_time_window') throw new ReadFailure('noanswer',`validity-${status}`);
  }
  return {detail,digest:hash({detail,bounds,sourceKey:ref.sourceKey,sentence:ref.sentence})};
}
/** history is accepted only for explicit exclusion; raw questions and unknown keys are never projected. */
export async function answerFromCanonicalFixture(request:unknown,context:RetrievalContext,deps:RetrievalDependencies):Promise<RetrievalResult> {
  if (!request || typeof request!=='object' || Array.isArray(request)) return result('noanswer','unsafe-request');
  const r=request as Record<string,unknown>;
  if (Object.keys(r).some(k=>k!=='questionKey'&&k!=='history') || typeof r.questionKey!=='string') return result('noanswer','unsafe-request');
  const plan=deps.plans[r.questionKey];
  if (!plan) return result('noanswer','question-unmapped',true);
  if (plan.disposition==='new-judgement') return result('noanswer','new-judgement',true);
  if (plan.disposition==='noanswer' || plan.intent==='source-conflict') return result('noanswer','no-supported-answer',true);
  if (!deps.enabled()) return result('noanswer','stopped');
  if (deps.tokenCap===null || !Number.isSafeInteger(deps.tokenCap) || deps.tokenCap<=0) return result('noanswer','budget-unknown');
  if (!Number.isFinite(deps.deadlineMs)||deps.deadlineMs<1||deps.deadlineMs>30000) return result('noanswer','deadline-invalid');
  const abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let closed=false;
  try {
    const work=async():Promise<RetrievalResult>=>{
      const sources=[];
      for(const ref of plan.references) {sources.push({ref,...await resolve(ref,context,deps)});if(closed)return result('noanswer','deadline');}
      if(!sources.length)return result('noanswer','no-evidence',true);
      if(!deps.enabled())return result('noanswer','stopped');
      const payload:ProviderPayload={contract:'assistant.fixture.v0.1',intent:plan.intent,qualitative:{},evidence:sources.map((s,i)=>({token:`e${i}`,sentence:s.ref.sentence}))};
      if(JSON.stringify(payload).length+2000>deps.tokenCap!)return result('noanswer','budget-exhausted');
      const safe=structuredClone(payload);safe.evidence.forEach(Object.freeze);Object.freeze(safe.evidence);Object.freeze(safe.qualitative);Object.freeze(safe);
      const reply=await deps.provider.generate(safe,abort.signal);
      if(closed)return result('noanswer','deadline');
      if(!deps.enabled())return result('noanswer','stopped');
      if(![reply.inputTokens,reply.outputTokens].every(n=>Number.isSafeInteger(n)&&n>=0)||reply.inputTokens+reply.outputTokens>deps.tokenCap!)return result('noanswer','usage-invalid');
      const chosen=sources.find((s,i)=>reply.token===`e${i}`&&reply.sentence===s.ref.sentence);
      if(!chosen)return result('noanswer','unsupported-output',true);
      const latest=await resolve(chosen.ref,context,deps);
      if(closed)return result('noanswer','deadline');
      if(!deps.enabled())return result('noanswer','stopped');
      if(latest.digest!==chosen.digest)return result('deny','authority-changed');
      return {...result('source','canonical-supported'),answer:reply.sentence,citations:[{sourceKey:chosen.ref.sourceKey,versionId:latest.detail.id,version:latest.detail.version,href:`/publications/${latest.detail.id}?cohort=${context.cohortId}`}]};
    };
    const deadline=new Promise<RetrievalResult>(resolve=>{timer=setTimeout(()=>{closed=true;abort.abort();resolve(result('noanswer','deadline'));},deps.deadlineMs);});
    return await Promise.race([work(),deadline]);
  } catch(e) {return e instanceof ReadFailure?result(e.outcome,e.message):result('noanswer','reader-or-provider-unavailable');}
  finally {closed=true;if(timer)clearTimeout(timer);abort.abort();}
}
