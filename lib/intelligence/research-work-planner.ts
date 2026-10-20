import { dateInput } from '../portfolio/financialInput';
import { selectResearchUniverse, type ResearchUniverseRow } from './research-universe';
import type { ResearchCoverageEvidence } from './research-universe-readiness';
import type { ResearchDraft } from './research-agent';
import { PRIVATE_PREPARATION_CONTRACT } from './research-workbook';

export const RESEARCH_ROLES = ['equities', 'funds', 'gold', 'fx', 'commodities', 'global-drivers'] as const;
export type ResearchRole = typeof RESEARCH_ROLES[number];
export type ResearchStage = 5 | 30 | 50;
export interface WorkCoverageRequirement {
  axis: ResearchCoverageEvidence['axis']; minimumPeriods: number;
}
/** Local metadata only. Never a prompt, source approval, or financial calculation. */
export interface WorkEvidence {
  id: string; role: ResearchRole; issuerId: string | null;
  sourceRef: string | null; sourceApprovalRef: string | null; contractKnownAt: string | null;
  sourceAt: string | null; observedAt: string | null;
  period: string | null; unit: string | null; definition: string | null; scope: string | null;
}
export interface ResearchWorkInput {
  asOf: string; maxAgeMs: number; stage: ResearchStage;
  expansionReviewRef: string | null; expansionReviewedAt: string | null;
  universeRows: readonly ResearchUniverseRow[];
  coverage: readonly ResearchCoverageEvidence[];
  coverageRequirements: readonly WorkCoverageRequirement[];
  evidence: readonly WorkEvidence[];
}
export interface ResearchWorkJob {
  id: string; role: ResearchRole; issuerId: string | null;
  state: 'ready_for_research' | 'blocked';
  blockers: string[]; evidence: WorkEvidence[];
  owner: string; nextAction: string;
  /** No earnings forecast readiness is implied by data coverage. */
  forecastReady: false;
}
const text = (value: string | null) => typeof value === 'string' && value.trim().length > 0;
function instant(value: string | null): number {
  if (!value || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return NaN;
  try { dateInput(value.slice(0, 10)); } catch { return NaN; }
  return Date.parse(value);
}
function coverageBlockers(coverage: readonly ResearchCoverageEvidence[], requirements: readonly WorkCoverageRequirement[], issuerId: string, cutoff: number): string[] {
  // Historical accounting coverage, not calibrated forecast quality. Monthly means
  // reported monthly activity/sales; it is not monthly net profit or stock return.
  return requirements.flatMap(({ axis, minimumPeriods }) => {
    const entries = coverage.filter(row => row.issuerId === issuerId && row.axis === axis);
    const entry = entries[0];
    return entries.length === 1 && text(entry.evidenceRef) && Number.isSafeInteger(entry.periods)
      && entry.periods >= minimumPeriods && Number.isFinite(instant(entry.knownAt)) && instant(entry.knownAt) <= cutoff
      ? [] : [`coverage_${axis}_unavailable`];
  });
}
/** Independent deterministic jobs; never invokes a model, provider, scheduler or database. */
export function planResearchWork(input: ResearchWorkInput) {
  if (![5, 30, 50].includes(input.stage) || input.evidence.length > 2000 || input.coverage.length > 2000
    || input.universeRows.length > 10000) throw new Error('invalid_research_plan_bounds');
  if (!input.coverageRequirements.length || input.coverageRequirements.length > 3
    || new Set(input.coverageRequirements.map(row => row.axis)).size !== input.coverageRequirements.length
    || input.coverageRequirements.some(row => !['quarterly', 'monthly', 'ime'].includes(row.axis)
      || !Number.isSafeInteger(row.minimumPeriods) || row.minimumPeriods < 1)) throw new Error('invalid_coverage_requirements');
  const universe = selectResearchUniverse(input.universeRows, {
    asOf: input.asOf, maxAgeMs: input.maxAgeMs, target: input.stage === 50 ? 50 : 30,
  });
  const cutoff = instant(input.asOf);
  const expansionBlockers: string[] = [];
  if (input.stage !== 5) {
    if (!text(input.expansionReviewRef) || !Number.isFinite(instant(input.expansionReviewedAt))
      || instant(input.expansionReviewedAt) > cutoff) expansionBlockers.push('expansion_review_missing_or_future');
    if (universe.selected.length < input.stage) expansionBlockers.push('universe_shortfall');
    if (universe.selected.slice(0, input.stage).some(row => coverageBlockers(input.coverage, input.coverageRequirements, row.issuerId, cutoff).length)) {
      expansionBlockers.push('expansion_coverage_incomplete');
    }
  }
  const effectiveStage = expansionBlockers.length ? 5 : input.stage;
  const selected = universe.selected.slice(0, effectiveStage);
  const jobs: ResearchWorkJob[] = [];
  function job(role: ResearchRole, issuerId: string | null) {
    const evidence = input.evidence.filter(row => row.role === role && row.issuerId === issuerId);
    const blockers: string[] = [];
    if (!evidence.length) blockers.push('evidence_unavailable');
    if (role === 'equities' && issuerId) blockers.push(...coverageBlockers(input.coverage, input.coverageRequirements, issuerId, cutoff));
    for (const row of evidence) {
      if (!text(row.id) || input.evidence.filter(item => item.id === row.id).length !== 1) blockers.push('ambiguous_evidence_identity');
      if (!text(row.sourceRef) || !text(row.sourceApprovalRef)) blockers.push('source_unverified');
      if (!Number.isFinite(instant(row.contractKnownAt)) || instant(row.contractKnownAt) > cutoff) blockers.push('measurement_contract_not_known_at_cutoff');
      if (![row.period, row.unit, row.definition, row.scope].every(text)) blockers.push('incomplete_measurement_contract');
      const source = instant(row.sourceAt), observed = instant(row.observedAt);
      if (!Number.isFinite(source) || !Number.isFinite(observed) || source > observed || observed > cutoff) blockers.push('invalid_source_or_receipt_time');
      else if (cutoff - source > input.maxAgeMs) blockers.push('stale_source');
    }
    jobs.push({
      id: `${role}:${issuerId ?? 'market'}`, role, issuerId,
      state: blockers.length ? 'blocked' : 'ready_for_research',
      blockers: [...new Set(blockers)], evidence: evidence.map(row => ({ ...row })), forecastReady: false,
      owner: `research-team:${role}`,
      nextAction: blockers.length ? `Resolve evidence blockers: ${[...new Set(blockers)].join(', ')}`
        : 'Prepare a private draft through the existing human-review workflow; no execution or publication.',
    });
  }
  // Keep market-cap rank even when a large issuer's analytical inputs are missing.
  for (const row of selected) job('equities', row.issuerId);
  for (const role of RESEARCH_ROLES) if (role !== 'equities') job(role, null);
  return {
    contract: PRIVATE_PREPARATION_CONTRACT, asOf: input.asOf,
    requestedStage: input.stage, effectiveStage, expansionBlockers,
    coverageRequirements: input.coverageRequirements.map(row => ({ ...row })),
    pilotShortfall: Math.max(0, 5 - selected.length),
    universe, jobs, ready: jobs.filter(row => row.state === 'ready_for_research').length,
    publicationAllowed: false as const, executionAllowed: false as const,
  };
}

export type ReviewIntent = 'research' | 'allocation' | 'buy' | 'sell';
export interface PrivateResearchReviewItem {
  contract: typeof PRIVATE_PREPARATION_CONTRACT;
  jobId: string; intent: ReviewIntent; status: ResearchDraft['status'];
  visibility: 'private'; review: 'pending_human_review';
  evidenceRefs: string[]; blockers: string[];
  publicationAllowed: false; executionAllowed: false;
}
/** Preparation metadata for the existing human workflow, not a second approval engine.
 * Even an allocation/buy/sell intent never conveys executable instructions or approval.
 * Authentication and persistence belong to the existing admin-only consumer.
 */
export function privateResearchReviewItem(job: ResearchWorkJob, intent: ReviewIntent): PrivateResearchReviewItem {
  if (!['research', 'allocation', 'buy', 'sell'].includes(intent)) throw new Error('invalid_review_intent');
  return {
    contract: PRIVATE_PREPARATION_CONTRACT, jobId: job.id, intent,
    status: 'draft', visibility: 'private', review: 'pending_human_review',
    evidenceRefs: job.evidence.map(row => row.id), blockers: [...job.blockers],
    publicationAllowed: false, executionAllowed: false,
  };
}
