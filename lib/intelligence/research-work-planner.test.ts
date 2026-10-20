import test from 'node:test';
import assert from 'node:assert/strict';
import { planResearchWork, privateResearchReviewItem, RESEARCH_ROLES, type ResearchWorkInput, type WorkEvidence } from './research-work-planner';
import type { ResearchUniverseRow } from './research-universe';
import type { ResearchCoverageEvidence } from './research-universe-readiness';

const at = '2026-10-20T12:00:00Z';
const earlier = '2026-10-20T11:00:00Z';
function universe(count: number): ResearchUniverseRow[] {
  return Array.from({ length: count }, (_, n) => ({
    issuerId: `issuer-${n}`, symbol: `نماد${String.fromCharCode(1575 + n) }س`,
    securityType: 'ordinary-share', marketCapRial: String(1000 - n), unit: 'IRR',
    source: 'synthetic-cap-contract', sourceAt: earlier, observedAt: earlier,
  }));
}
function coverage(count: number): ResearchCoverageEvidence[] {
  return Array.from({ length: count }, (_, n) => (['quarterly', 'monthly'] as const).map(axis => ({
    issuerId: `issuer-${n}`, axis, periods: axis === 'quarterly' ? 4 : 12,
    knownAt: earlier, evidenceRef: `synthetic-${axis}-${n}`,
  }))).flat();
}
function evidence(role: WorkEvidence['role'], issuerId: string | null = null): WorkEvidence {
  return { id: `${role}-${issuerId ?? 'market'}`, role, issuerId,
    sourceRef: 'synthetic-source', sourceApprovalRef: 'synthetic-reviewed-contract', contractKnownAt: earlier,
    sourceAt: earlier, observedAt: earlier, period: '2026-10-20', unit: 'IRR',
    definition: 'synthetic-measurement', scope: 'synthetic-scope',
  };
}
function input(count = 6): ResearchWorkInput {
  return { asOf: at, maxAgeMs: 86400000, stage: 5, expansionReviewRef: null, expansionReviewedAt: earlier,
    universeRows: universe(count), coverage: coverage(count),
    coverageRequirements: [{ axis: 'quarterly', minimumPeriods: 4 }, { axis: 'monthly', minimumPeriods: 12 }],
    evidence: [...Array.from({ length: count }, (_, n) => evidence('equities', `issuer-${n}`)),
      ...RESEARCH_ROLES.filter(role => role !== 'equities').map(role => evidence(role))],
  };
}
test('five-company cap and all six roles reuse the existing private contract; no runtime actions', () => {
  const plan = planResearchWork(input());
  assert.equal(plan.jobs.length, 10);
  assert.equal(plan.jobs.filter(job => job.role === 'equities').length, 5);
  assert.equal(plan.ready, 10);
  assert.equal(plan.contract, 'p07.private-preparation.v1');
  assert.equal(plan.publicationAllowed, false); assert.equal(plan.executionAllowed, false);
  assert.ok(plan.jobs.every(job => !job.forecastReady));
});
test('missing large-company coverage blocks only its job and never replaces it with a smaller company', () => {
  const data = input();
  data.coverage = data.coverage.filter(row => row.issuerId !== 'issuer-0');
  data.evidence = data.evidence.filter(row => row.role !== 'gold');
  const plan = planResearchWork(data);
  assert.equal(plan.jobs[0].issuerId, 'issuer-0');
  assert.equal(plan.jobs[0].state, 'blocked');
  assert.equal(plan.jobs[0].owner, 'research-team:equities');
  assert.match(plan.jobs[0].nextAction, /coverage_quarterly_unavailable/);
  assert.ok(!plan.jobs.some(job => job.issuerId === 'issuer-5'));
  assert.equal(plan.jobs.find(job => job.role === 'gold')?.state, 'blocked');
  assert.equal(plan.jobs.find(job => job.role === 'fx')?.state, 'ready_for_research');
  assert.equal(plan.ready, 8);
});
test('30 and 50 require explicit review plus sufficient independently validated coverage', () => {
  for (const stage of [30, 50] as const) {
    const data = { ...input(stage), stage };
    assert.equal(planResearchWork(data).effectiveStage, 5);
    data.expansionReviewRef = 'owner-reviewed-expansion';
    assert.equal(planResearchWork(data).effectiveStage, stage);
    assert.equal(planResearchWork({ ...data, expansionReviewedAt: '2026-10-21T11:00:00Z' }).effectiveStage, 5);
    data.coverage = data.coverage.map(row => row.issuerId === `issuer-${stage - 1}` ? { ...row, periods: 0 } : row);
    const blocked = planResearchWork(data);
    assert.equal(blocked.effectiveStage, 5);
    assert.ok(blocked.expansionBlockers.includes('expansion_coverage_incomplete'));
  }
});
test('shortfall stays visible; no fabricated company or period fills missing inputs', () => {
  const plan = planResearchWork({ ...input(2), stage: 30, expansionReviewRef: 'review' });
  assert.equal(plan.pilotShortfall, 3);
  assert.ok(plan.expansionBlockers.includes('universe_shortfall'));
  assert.equal(plan.jobs.filter(job => job.role === 'equities').length, 2);
});
test('requested IME coverage is independent and cannot be substituted with monthly activity', () => {
  const data = input(30);
  data.stage = 30; data.expansionReviewRef = 'review';
  data.coverageRequirements = [...data.coverageRequirements, { axis: 'ime', minimumPeriods: 3 }];
  const result = planResearchWork(data);
  assert.equal(result.effectiveStage, 5);
  assert.ok(result.jobs[0].blockers.includes('coverage_ime_unavailable'));
  assert.throws(() => planResearchWork({ ...data, coverageRequirements: [] }));
});
test('rejects stale, invalid-calendar, future receipt/contract and incomplete evidence per job', () => {
  const patches: Partial<WorkEvidence>[] = [
    { sourceAt: '2026-10-18T11:00:00Z' }, { sourceAt: '2026-02-30T11:00:00Z' },
    { observedAt: '2026-10-21T11:00:00Z' }, { sourceAt: at },
    { contractKnownAt: '2026-10-21T11:00:00Z' },
    { unit: null }, { period: null }, { scope: null }, { definition: null },
    { sourceApprovalRef: null }, { sourceRef: null },
  ];
  for (const patch of patches) {
    const data = input();
    data.evidence = data.evidence.map(row => row.role === 'gold' ? { ...row, ...patch } : row);
    const jobs = planResearchWork(data).jobs;
    assert.equal(jobs.find(job => job.role === 'gold')?.state, 'blocked', JSON.stringify(patch));
    assert.equal(jobs.find(job => job.role === 'fx')?.state, 'ready_for_research');
  }
});
test('future and ambiguous coverage cannot unlock historical research', () => {
  for (const rows of [
    [...coverage(6), coverage(6)[0]],
    coverage(6).map(row => ({ ...row, knownAt: '2026-10-21T11:00:00Z' })),
  ]) {
    assert.equal(planResearchWork({ ...input(), coverage: rows }).jobs[0].state, 'blocked');
  }
});
test('future coverage and evidence revisions cannot alter historical jobs or expansion', () => {
  const original = { ...input(30), stage: 30 as const, expansionReviewRef: 'review' };
  const baseline = planResearchWork(original);
  const future = '2026-10-21T11:00:00Z';
  const revised = {
    ...original,
    coverage: [...original.coverage, ...original.coverage.map(row => ({ ...row, knownAt: future, periods: 0 }))],
    evidence: [
      ...original.evidence,
      ...original.evidence.map(row => ({ ...row, observedAt: future, unit: null })),
      // A future different role reusing an ID must not poison today's ID checks.
      { ...original.evidence[0], role: 'gold' as const, issuerId: null, observedAt: future },
    ],
  };
  assert.deepEqual(planResearchWork(revised), baseline);
});
test('unknown timestamps remain blocking revisions rather than silently restoring older evidence', () => {
  const original = input();
  const badCoverage = { ...original, coverage: [...original.coverage, { ...original.coverage[0], knownAt: 'unknown' }] };
  assert.equal(planResearchWork(badCoverage).jobs[0].state, 'blocked');
  const badEvidence = { ...original, evidence: [...original.evidence, { ...original.evidence[0], observedAt: null }] };
  const job = planResearchWork(badEvidence).jobs[0];
  assert.equal(job.state, 'blocked');
  assert.ok(job.blockers.includes('ambiguous_evidence_identity'));
  assert.ok(job.blockers.includes('invalid_source_or_receipt_time'));
});
test('duplicate evidence fails closed and detached plans do not mutate input', () => {
  const data = input();
  data.evidence = [...data.evidence, { ...data.evidence[0] }];
  const plan = planResearchWork(data);
  assert.ok(plan.jobs[0].blockers.includes('ambiguous_evidence_identity'));
  plan.jobs[0].evidence[0].unit = 'changed';
  assert.equal(data.evidence[0].unit, 'IRR');
});
test('all intents including blocked work remain private drafts pending human review', () => {
  const job = planResearchWork({ ...input(), evidence: [] }).jobs[0];
  for (const intent of ['research', 'allocation', 'buy', 'sell'] as const) {
    const item = privateResearchReviewItem(job, intent);
    assert.equal(item.status, 'draft'); assert.equal(item.visibility, 'private');
    assert.equal(item.review, 'pending_human_review');
    assert.equal(item.publicationAllowed, false); assert.equal(item.executionAllowed, false);
    assert.ok(item.blockers.includes('evidence_unavailable'));
  }
});
test('invalid cutoff and unbounded inputs fail before planning', () => {
  assert.throws(() => planResearchWork({ ...input(), asOf: '2026-02-30T12:00:00Z' }));
  assert.throws(() => planResearchWork({ ...input(), evidence: Array(2001).fill(evidence('fx')) }));
});
