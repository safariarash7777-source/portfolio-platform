import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseManualIntake, manualIntakeIssues, prepareAudiencePreview } from './p07-preparation';
import { emptyWorkbook } from './research-workbook';

const intake = { kind: 'voice_manual', text: 'نمونه ساختگی برای آزمون', transcriptConfirmed: false,
  claims: [{ id: 'c1', kind: 'observation', text: 'گزاره ساختگی', evidenceIds: ['e1'] }],
  ambiguities: [{ id: 'a1', text: 'مخرج روشن نیست', resolved: false }] };
const W = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const C = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const publication = { workbookVersionId: W, contentKind: 'brief', title: 'نمونه ساختگی', summary: 'خلاصه', content: 'متن نمونه',
  sources: [{ url: 'https://example.invalid/synthetic', asOf: '2026-10-02', privateNote: 'PRIVATE' }],
  audience: 'cohort', cohortIds: [C], channels: ['site'], privateNote: 'PRIVATE', transcript: 'PRIVATE',
  holdingVersionId: W, approved: true, createdBy: 'FORGED', decision: { validUntil: '2099-01-01' } };

test('unconfirmed manual voice and unresolved ambiguity stay explicit preparation issues', () => {
  assert.deepEqual(manualIntakeIssues(parseManualIntake(intake), emptyWorkbook()), ['transcript_unconfirmed', 'ambiguity_unresolved:a1']);
});
test('checklist completion is structural only and creates no approval, persistence or inferred values', () => {
  const parsed = parseManualIntake({ ...intake, transcriptConfirmed: true, ambiguities: [{ ...intake.ambiguities[0], resolved: true }], approved: true, createdBy: 'FORGED', sizeValue: 0 });
  assert.deepEqual(manualIntakeIssues(parsed, emptyWorkbook()), []);
  assert.equal('approved' in parsed, false); assert.equal('sizeValue' in parsed, false); assert.equal('createdBy' in parsed, false);
  assert.equal(parsed.text, intake.text);
});
test('missing and foreign evidence links are reported without creating evidence or URLs', () => {
  const parsed = parseManualIntake({ ...intake, kind: 'text', ambiguities: [], claims: [
    { ...intake.claims[0], evidenceIds: [] }, { ...intake.claims[0], id: 'c2', evidenceIds: ['absent'] } ] });
  const workbook = emptyWorkbook(); const before = JSON.stringify(workbook);
  assert.deepEqual(manualIntakeIssues(parsed, workbook), ['claim_evidence_missing:c1', 'claim_evidence_unknown:c2:absent']);
  assert.equal(JSON.stringify(workbook), before);
});
test('malformed, oversized, duplicate or forged checklist values are rejected', () => {
  for (const change of [{ kind: 'provider' }, { transcriptConfirmed: 'true' }, { text: ' ' }, { text: 'x'.repeat(20001) },
    { claims: [...intake.claims, ...intake.claims] }, { ambiguities: [{ ...intake.ambiguities[0], resolved: 'true' }] },
    { claims: [{ ...intake.claims[0], evidenceIds: [null] }] }, { claims: Array(101).fill(intake.claims[0]) }]) {
    assert.throws(() => parseManualIntake({ ...intake, ...change }));
  }
});
test('no claims and ambiguous workbook evidence IDs cannot silently pass', () => {
  const workbook = emptyWorkbook(); workbook.evidence.push({ ...workbook.evidence[0] });
  assert.deepEqual(manualIntakeIssues(parseManualIntake({ ...intake, kind: 'text', claims: [], ambiguities: [] }), workbook), ['claims_missing', 'evidence_ids_duplicate']);
});
test('audience preview is exact publication allowlist, excludes identity, private material and unsaved decision extensions', () => {
  const before = JSON.stringify(publication); const preview = prepareAudiencePreview(publication);
  assert.deepEqual(Object.keys(preview).sort(), ['audience', 'cohortIds', 'content', 'contentKind', 'sources', 'summary', 'title']);
  assert.equal(JSON.stringify(preview).includes('PRIVATE'), false); assert.equal(JSON.stringify(preview).includes('FORGED'), false);
  assert.deepEqual(preview.cohortIds, [C]); assert.equal(JSON.stringify(publication), before);
  preview.sources[0].asOf = '2000-01-01'; preview.cohortIds.push(W);
  assert.equal(JSON.stringify(publication), before);
});
test('preview reuses canonical contradictory audience/date/channel rejection', () => {
  for (const change of [{ audience: 'public' }, { cohortIds: [] }, { channels: ['telegram'] },
    { sources: [{ url: 'https://user:pass@example.invalid', asOf: '2026-10-02' }] },
    { sources: [{ url: 'https://example.invalid', asOf: '2026-02-30' }] }]) assert.throws(() => prepareAudiencePreview({ ...publication, ...change }));
});
test('free text is preserved, demonstrating why privacy approval must be separate', () => {
  assert.equal(prepareAudiencePreview({ ...publication, content: 'PRIVATE free text' }).content, 'PRIVATE free text');
});
