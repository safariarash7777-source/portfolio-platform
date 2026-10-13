import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyWorkbook, parseWorkbook, reviewWorkbook } from './research-workbook';
import { summarizeRehearsal } from './workflow';
import { inspectRehearsalReferences, validateResearchProvenance, workbookContentFingerprint,
  type ResearchProvenanceInput, type RehearsalReference } from './research-provenance';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const checkedAt = '2026-10-14T10:00:00Z';
function fixture(): ResearchProvenanceInput {
  const body = emptyWorkbook();
  Object.assign(body, { title: 'SYNTHETIC rehearsal only', question: 'Synthetic question', horizon: 'short_term',
    interpretation: 'Synthetic interpretation', counterEvidence: 'Synthetic limitation', portfolioImpact: 'No real portfolio advice', reviewOn: '2026-10-14' });
  body.evidence = [{ id: 'local-e1', statement: 'SYNTHETIC observation', sourceUrl: 'https://example.invalid/synthetic',
    observedOn: '2026-10-13', publishedOn: '2026-10-13' }];
  for (const scenario of Object.values(body.scenarios)) Object.assign(scenario, { assumptions: 'Synthetic assumption', mechanism: 'Synthetic mechanism', invalidation: 'Synthetic invalidation' });
  return {
    version: { id: id(1), workbookId: id(2), version: 3, title: body.title, body, createdAt: '2026-10-13T10:00:00Z' },
    review: { id: id(3), versionId: id(1), decision: 'approved_internal', note: 'SYNTHETIC record, not a real human approval', reviewedAt: '2026-10-13T11:00:00Z' },
    nativeReviewIdentity: { id: id(3), version_id: id(1), reviewed_by: id(4), reviewed_at: '2026-10-13T11:00:00Z' },
    reference: { workbookId: id(2), versionId: id(1), versionNo: 3, workbookHash: workbookContentFingerprint(body), reviewId: id(3),
      evidence: [{ workbookEvidenceId: 'local-e1', evidenceId: id(5), contentHash: 'synthetic-content-hash-001', claimId: id(7), requiresUnit: false, requiresScope: true }] },
    evidence: [{ id: id(5), sourceId: id(6), excerpt: 'SYNTHETIC observation; no real data.', contentUrl: 'https://example.invalid/synthetic',
      observedAt: '2026-10-13T09:00:00Z', publishedAt: '2026-10-13T08:00:00Z', contentHash: 'synthetic-content-hash-001' }],
    sources: [{ id: id(6), kind: 'manual', name: 'SYNTHETIC', url: 'https://example.invalid/synthetic', trustTier: 'unverified', approved: false, approvedBy: null, approvedAt: null }],
    claims: [{ id: id(7), analysisId: id(8), eventId: id(9), kind: 'FACT', statement: 'SYNTHETIC observation', confidence: 80, scenarioLabel: null }],
    events: [{ id: id(9), domain: 'macro_ir', title: 'SYNTHETIC', summary: null, occurredAt: '2026-10-13T08:00:00Z', scope: 'iran', symbol: null }],
    links: [{ claimId: id(7), evidenceId: id(5) }], checkedAt: '2026-10-14T10:00:00Z',
  };
}
const codes = (input: ResearchProvenanceInput) => validateResearchProvenance(input).issues.map(i => i.code);
test('existing ids, stored revision and receipt match structurally without any truth, human or publishing authority', () => {
  const f = fixture(), result = validateResearchProvenance(f);
  assert.equal(result.consistent, true);
  assert.deepEqual(result.reviewObservation, { reviewId: id(3), reviewerId: id(4), reviewedAt: f.review!.reviewedAt });
  for (const field of ['sourceTruthVerified', 'quotationTruthVerified', 'humanReviewAuthenticated', 'publicationAuthorized', 'gate3Accepted'] as const) assert.equal(result[field], false);
  assert.ok(result.gaps.includes('review_evidence_snapshot_not_persisted'));
});
test('fingerprint is stable for object-key order and distinct for meaningful content', () => {
  const body = fixture().version.body as Record<string, unknown>;
  assert.equal(workbookContentFingerprint(Object.fromEntries(Object.entries(body).reverse())), workbookContentFingerprint(body));
  assert.notEqual(workbookContentFingerprint({ ...body, question: 'Changed question' }), workbookContentFingerprint(body));
});
for (const field of ['id', 'workbookId', 'version'] as const) test(`stored ${field} change invalidates old review reference`, () => {
  const f = fixture();
  if (field === 'version') f.version.version++;
  else f.version[field] = id(999);
  assert.ok(codes(f).includes('stale_workbook_version'));
  assert.equal(validateResearchProvenance(f).reviewObservation.reviewedAt, null);
});
test('body revision changes invalidate old receipt snapshot even if row id/version are reused', () => {
  const f = fixture(); (f.version.body as { title: string }).title = 'Changed draft';
  assert.ok(codes(f).includes('changed_workbook_content'));
});
test('canonical evidence hash change invalidates prior reference', () => {
  const f = fixture(); f.evidence[0].contentHash = 'different-content-hash';
  assert.ok(codes(f).includes('changed_evidence_hash'));
  assert.equal(validateResearchProvenance(f).reviewObservation.reviewerId, null);
});
for (const missing of ['excerpt', 'source', 'evidence', 'claim', 'link'] as const) test(`absent ${missing} cannot support dependent claim`, () => {
  const f = fixture();
  if (missing === 'excerpt') f.evidence[0].excerpt = '';
  if (missing === 'source') f.sources = [];
  if (missing === 'evidence') f.evidence = [];
  if (missing === 'claim') f.claims = [];
  if (missing === 'link') f.links = [];
  assert.equal(validateResearchProvenance(f).consistent, false);
});
test('an imported unit is not a native IntelEvidence unit or permission', () => {
  const f = fixture(); f.reference.evidence[0].requiresUnit = true;
  Object.assign(f.evidence[0], { unit: 'toman', approved: true });
  const result = validateResearchProvenance(f);
  assert.ok(result.issues.some(i => i.code === 'dependent_unit_unattested'));
  assert.ok(result.gaps.includes('intel_evidence_unit_not_recorded'));
  assert.equal(result.publicationAuthorized, false);
});
for (const missing of ['event', 'eventId', 'scope'] as const) test(`dependent ${missing} unknown rejects scope-dependent claim`, () => {
  const f = fixture();
  if (missing === 'event') f.events = [];
  if (missing === 'eventId') f.claims[0].eventId = null;
  if (missing === 'scope') Object.assign(f.events[0], { scope: 'unknown' });
  assert.ok(codes(f).includes('dependent_scope_unknown'));
});
test('valid URL alone proves neither quotation nor source contents', () => {
  const f = fixture(); f.evidence[0].excerpt = ''; f.evidence[0].contentHash = '';
  assert.equal(reviewWorkbook(parseWorkbook(JSON.stringify(f.version.body))).length, 0);
  const result = validateResearchProvenance(f);
  assert.equal(result.consistent, false); assert.equal(result.quotationTruthVerified, false);
});
test('URL and workbook statement must map to the selected existing records', () => {
  const f = fixture(); f.evidence[0].contentUrl = 'https://other.example.invalid/'; f.claims[0].statement = 'Different claim';
  assert.ok(codes(f).includes('source_url_mismatch')); assert.ok(codes(f).includes('workbook_claim_statement_mismatch'));
});
test('imported published/approved and forged reviewer fields cannot create a missing receipt or actor', () => {
  const f = fixture(); Object.assign(f.version.body!, { status: 'published', approved: true, approvedBy: id(999), reviewedAt: f.checkedAt });
  const before = f.reference.workbookHash;
  assert.equal(workbookContentFingerprint(f.version.body), before, 'parseWorkbook drops authority extras');
  f.review = null; delete f.nativeReviewIdentity;
  const result = validateResearchProvenance(f);
  assert.ok(result.issues.some(i => i.code === 'existing_review_missing'));
  assert.equal(result.reviewObservation.reviewerId, null); assert.equal(result.reviewObservation.reviewedAt, null);
  assert.equal(result.publicationAuthorized, false);
});
test('returned or wrong-version review cannot pass the consistency check', () => {
  const f = fixture(); f.review!.decision = 'returned'; f.review!.versionId = id(99);
  assert.ok(codes(f).includes('review_receipt_mismatch'));
});
test('missing native reviewer is reported as DTO gap, never inferred from createdBy/workbook', () => {
  const f = fixture(); delete f.nativeReviewIdentity; f.version.createdBy = id(444);
  const result = validateResearchProvenance(f);
  assert.equal(result.reviewObservation.reviewerId, null);
  assert.ok(result.gaps.includes('stored_review_dto_omits_reviewer_identity'));
});
for (const at of ['2026-10-13T09:00:00Z', '2026-10-15T10:00:00Z', '2026-02-30T10:00:00Z', '2026-10-13T24:00:00Z']) test(`review timestamp ${at} is rejected`, () => {
  const f = fixture(); f.review!.reviewedAt = at;
  assert.ok(codes(f).includes('invalid_review_time'));
});
test('native receipt actor/time must belong to the same existing review row', () => {
  const f = fixture(); f.nativeReviewIdentity!.id = id(999); f.nativeReviewIdentity!.reviewed_at = f.checkedAt;
  assert.ok(codes(f).includes('native_review_identity_mismatch'));
});
test('duplicate ledger IDs and missing/duplicated local mappings remain ambiguous', () => {
  const f = fixture(); f.evidence = [...f.evidence, { ...f.evidence[0] }]; f.reference.evidence = [];
  assert.ok(codes(f).includes('duplicate_or_missing_id')); assert.ok(codes(f).includes('workbook_evidence_unbound'));
});
test('validator does not mutate supplied records', () => {
  const f = fixture(), before = JSON.stringify(f); validateResearchProvenance(f); assert.equal(JSON.stringify(f), before);
});

function rehearsal(index: number): RehearsalReference {
  const date = `2026-10-${String(index).padStart(2, '0')}`;
  return { declaredOrigin: 'real', day: { rehearsalDate: date, dayIndex: index, briefProduced: true, minutesToApproval: 5,
    absentSources: [], staleSources: [], humanCorrections: 1, rejectedConclusions: 0, missedEvents: 0 },
  run: { id: id(100 + index), origin: 'human', actorId: id(4), status: 'succeeded', modelProvider: null, modelName: null,
    modelVersion: null, promptHash: null, configHash: null, startedAt: `${date}T10:00:00Z`, completedAt: `${date}T11:00:00Z`, outputAnalysisId: id(8) } };
}
test('ten distinct declared real days/runs are only a structural candidate, never Gate3 acceptance', () => {
  const rows = Array.from({ length: 10 }, (_, i) => rehearsal(i + 1)), result = inspectRehearsalReferences(rows, checkedAt, 'UTC');
  assert.equal(result.uniqueDeclaredRealDays, 10); assert.equal(result.structuralTenDayCandidate, true);
  assert.equal(result.realDaysVerified, false); assert.equal(result.gate3Accepted, false);
  assert.ok(result.gaps.includes('rehearsal_real_origin_not_attested'));
});
test('ten repetitions that fool the old row-count summary count only once here', () => {
  const rows = Array.from({ length: 10 }, () => rehearsal(1));
  assert.equal(summarizeRehearsal(rows.map(r => r.day)).readyForGateReview, true);
  const result = inspectRehearsalReferences(rows, checkedAt, 'UTC');
  assert.equal(result.uniqueDeclaredRealDays, 1); assert.equal(result.structuralTenDayCandidate, false);
  assert.equal(result.issues.filter(i => i.code === 'repeated_day_or_run').length, 9);
});
test('same run reused on different dates cannot produce ten rehearsal days', () => {
  const rows = Array.from({ length: 10 }, (_, i) => rehearsal(i + 1));
  for (const row of rows) row.run!.id = id(100);
  assert.equal(inspectRehearsalReferences(rows, checkedAt, 'UTC').uniqueDeclaredRealDays, 1);
});
for (const origin of ['synthetic', 'unknown'] as const) test(`${origin} observations never enter declared real set`, () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ ...rehearsal(i + 1), declaredOrigin: origin }));
  const result = inspectRehearsalReferences(rows, checkedAt, 'UTC');
  assert.equal(result.uniqueDeclaredRealDays, 0); assert.equal(result.summary.readyForGateReview, false);
});
test('invalid metrics, missing run and unsuccessful runs are not real rehearsal candidates', () => {
  const rows = [rehearsal(1), rehearsal(2), rehearsal(3)]; rows[0].day.missedEvents = -1; rows[1].run = null; rows[2].run!.status = 'failed';
  assert.equal(inspectRehearsalReferences(rows, checkedAt, 'UTC').uniqueDeclaredRealDays, 0);
});
test('labelled error example produces its stated failures and admits no synthetic Gate3 day', () => {
  const example = JSON.parse(readFileSync('docs/ops/research-provenance.synthetic.example.json', 'utf8'));
  assert.equal(example.label, 'SYNTHETIC_ONLY_NOT_GATE3');
  const result = validateResearchProvenance(example.input);
  for (const code of example.expectedIssueCodes) assert.ok(result.issues.some(issue => issue.code === code), code);
  assert.equal(inspectRehearsalReferences(example.rehearsals, checkedAt, 'UTC').uniqueDeclaredRealDays, 0);
});
test('future completions and unknown check clock cannot be counted as recorded days', () => {
  const row = rehearsal(1); row.run!.completedAt = '2027-10-01T11:00:00Z';
  assert.equal(inspectRehearsalReferences([row], checkedAt, 'UTC').uniqueDeclaredRealDays, 0);
  assert.equal(inspectRehearsalReferences([rehearsal(1)], 'unknown', 'UTC').uniqueDeclaredRealDays, 0);
});

for (const field of ['observedAt', 'publishedAt'] as const) {
  for (const [label, value] of [['null', null], ['undefined', undefined], ['number', 7], ['boolean', false], ['object', {}], ['array', []]] as const) {
    test(`malformed evidence ${field}: ${label} returns diagnostics without throwing`, () => {
      const f = fixture(); Object.assign(f.evidence[0], { [field]: value });
      const result = validateResearchProvenance(f);
      assert.equal(result.consistent, false);
      assert.ok(result.issues.some(i => i.code === (field === 'publishedAt' && value === null ? 'workbook_evidence_date_mismatch' : 'invalid_evidence_time')));
      assert.equal(result.reviewObservation.reviewerId, null);
      assert.equal(result.reviewObservation.reviewedAt, null);
      assert.equal(result.publicationAuthorized, false);
    });
  }
  test(`absent evidence ${field} returns diagnostics without throwing`, () => {
    const f = fixture(); delete (f.evidence[0] as unknown as Record<string, unknown>)[field];
    const result = validateResearchProvenance(f);
    assert.equal(result.consistent, false);
    assert.ok(result.issues.some(i => i.code === 'invalid_evidence_time'));
  });
}
for (const [label, date] of [['future', '2027-10-'], ['past but unrelated', '2026-09-']] as const) {
  test(`${label} rehearsal labels cannot convert past runs into readiness`, () => {
    const rows = Array.from({ length: 10 }, (_, i) => rehearsal(i + 1));
    for (const [i, row] of rows.entries()) row.day.rehearsalDate = `${date}${String(i + 1).padStart(2, '0')}`;
    const result = inspectRehearsalReferences(rows, checkedAt, 'UTC');
    assert.equal(result.uniqueDeclaredRealDays, 0);
    assert.equal(result.structuralTenDayCandidate, false);
    assert.equal(result.summary.readyForGateReview, false);
    assert.equal(result.issues.length, 10);
  });
}
for (const zone of [undefined, '', 'Unknown/Calendar']) test(`missing or invalid declared calendar ${String(zone)} blocks readiness`, () => {
  const result = inspectRehearsalReferences(Array.from({ length: 10 }, (_, i) => rehearsal(i + 1)), checkedAt, zone);
  assert.equal(result.uniqueDeclaredRealDays, 0);
  assert.equal(result.structuralTenDayCandidate, false);
  assert.equal(result.summary.readyForGateReview, false);
  assert.ok(result.issues.some(i => i.code === 'rehearsal_calendar_zone_unknown'));
});
test('Tehran calendar handles a run after local midnight without assuming its UTC date', () => {
  const row = rehearsal(2); row.run!.startedAt = '2026-10-01T21:00:00Z'; row.run!.completedAt = '2026-10-01T22:00:00Z';
  const local = inspectRehearsalReferences([row], checkedAt, 'Asia/Tehran');
  assert.equal(local.uniqueDeclaredRealDays, 1);
  assert.equal(local.realDaysVerified, false);
  const utc = inspectRehearsalReferences([row], checkedAt, 'UTC');
  assert.equal(utc.uniqueDeclaredRealDays, 0);
  assert.ok(utc.issues.some(i => i.code === 'rehearsal_day_run_mismatch'));
});
test('a run crossing declared-calendar midnight may intersect either day but counts only once', () => {
  const first = rehearsal(1); first.run!.startedAt = '2026-10-01T23:50:00Z'; first.run!.completedAt = '2026-10-02T00:10:00Z';
  const second = structuredClone(first); second.day.rehearsalDate = '2026-10-02'; second.day.dayIndex = 2;
  assert.equal(inspectRehearsalReferences([second], checkedAt, 'UTC').uniqueDeclaredRealDays, 1);
  const result = inspectRehearsalReferences([first, second], checkedAt, 'UTC');
  assert.equal(result.uniqueDeclaredRealDays, 1);
  assert.ok(result.issues.some(i => i.code === 'repeated_day_or_run'));
});
test('ten valid rows plus an invalid label suppress both readiness flags', () => {
  const rows = Array.from({ length: 11 }, (_, i) => rehearsal(i + 1)); rows[10].day.rehearsalDate = '2026-02-30';
  const result = inspectRehearsalReferences(rows, checkedAt, 'UTC');
  assert.equal(result.uniqueDeclaredRealDays, 10);
  assert.equal(result.structuralTenDayCandidate, false);
  assert.equal(result.summary.readyForGateReview, false);
  assert.equal(result.gate3Accepted, false);
  assert.equal(result.publicationAuthorized, false);
});
test('equivalent offset run instants use the supplied calendar rather than timestamp prefixes', () => {
  const row = rehearsal(2); row.run!.startedAt = '2026-10-01T23:30:00-02:00'; row.run!.completedAt = '2026-10-02T00:00:00-02:00';
  assert.equal(inspectRehearsalReferences([row], checkedAt, 'UTC').uniqueDeclaredRealDays, 1);
});
test('a caller calendar never removes the missing native calendar or real-origin gaps', () => {
  const result = inspectRehearsalReferences([rehearsal(1)], checkedAt, 'UTC');
  assert.ok(result.gaps.includes('rehearsal_calendar_zone_not_recorded'));
  assert.ok(result.gaps.includes('rehearsal_real_origin_not_attested'));
  assert.equal(result.realDaysVerified, false);
});
