import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapManualClaim, p07ReviewCurrent, p07PreparationExport, p07PublicationPreparationIssue } from './p07-workflow';
import { parseWorkbook } from './research-workbook';
import { createP07WorkflowFixture, p07FixtureWorkbook, P07_FIXTURE_COHORT } from './p07-workflow-fixture';
import { canReadPublication, type PublicationDraft, type PublicationRow } from './publication';

const WB = '/api/admin/intelligence/workbooks', PUB = '/api/admin/intelligence/publications';
const key = (n: number) => `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, '0')}`;
const manual = { kind: 'text', text: 'اصل خصوصی نمونه', transcriptConfirmed: false,
  claims: [{ id: 'c1', kind: 'observation', text: 'گزاره شاهد انتخاب‌شده', evidenceIds: ['e1'] }],
  ambiguities: [{ id: 'a1', text: 'مخرج نامعلوم', resolved: false }], privateNote: 'PRIVATE', approved: true };
test('UX preparation binds exact research version and unchanged intake, never another approved workbook', () => {
  const binding = { workbookVersionId: key(1), signature: 'exact-reviewed-preparation' };
  assert.equal(p07PublicationPreparationIssue([], key(1), binding, binding.signature), null);
  assert.notEqual(p07PublicationPreparationIssue([], key(2), binding, binding.signature), null);
  assert.notEqual(p07PublicationPreparationIssue([], key(1), binding, 'changed-original-text'), null);
  assert.notEqual(p07PublicationPreparationIssue(['unresolved'], key(1), binding, binding.signature), null);
  assert.notEqual(p07PublicationPreparationIssue([], key(1), null, binding.signature), null);
});
test('explicit observation mapping round-trips only existing evidence statement, preserving interpretation and metadata separation', () => {
  const original = p07FixtureWorkbook(), before = JSON.stringify(original);
  const mapped = mapManualClaim(original, manual, 'c1', 'e1');
  assert.equal(mapped.evidence[0].statement, manual.claims[0].text);
  assert.equal(mapped.interpretation, original.interpretation);
  assert.deepEqual(parseWorkbook(JSON.stringify(mapped)), mapped);
  assert.equal(JSON.stringify(mapped).includes(manual.text), false);
  assert.equal(JSON.stringify(mapped).includes(manual.ambiguities[0].text), false);
  assert.equal(JSON.stringify(original), before);
});
test('interpretation is mapped only by explicit human selection; scenario and unknown evidence are not guessed', () => {
  const original = p07FixtureWorkbook();
  const interpretation = { ...manual, claims: [{ ...manual.claims[0], kind: 'interpretation' }] };
  assert.equal(mapManualClaim(original, interpretation, 'c1').interpretation, manual.claims[0].text);
  assert.deepEqual(mapManualClaim(original, interpretation, 'c1').evidence, original.evidence);
  assert.throws(() => mapManualClaim(original, manual, 'c1', 'unknown'));
  assert.throws(() => mapManualClaim(original, { ...manual, claims: [{ ...manual.claims[0], kind: 'scenario' }] }, 'c1'));
});
test('local preparation export stays bounded and explicitly unpersisted, with no forged approval', () => {
  const file = p07PreparationExport(manual);
  assert.equal(file.persisted, false); assert.equal(file.intake.text, manual.text);
  assert.equal('approved' in file.intake, false); assert.equal('privateNote' in file.intake, false);
});
test('returned/latest/tied review and older workbook version cannot leave an approved badge', () => {
  const approved = { version: 1, decision: 'approved_internal' as const, reviewedAt: '2026-10-02T10:00:00Z' };
  const returned = { ...approved, decision: 'returned' as const, reviewedAt: '2026-10-02T11:00:00Z' };
  assert.equal(p07ReviewCurrent(1, 1, [approved]), true);
  assert.equal(p07ReviewCurrent(1, 1, [returned, approved]), false);
  assert.equal(p07ReviewCurrent(1, 2, [approved]), false);
  assert.equal(p07ReviewCurrent(1, 1, [approved, { ...returned, reviewedAt: approved.reviewedAt }]), false);
});

test('three synthetic workflows reuse canonical workbook handlers and publication command parser, with immutable version history', async () => {
  const fixture = createP07WorkflowFixture(); let sequence = 1;
  const post = (path: string, payload: unknown) => fixture.transport(path, { method: 'POST', body: JSON.stringify(payload) });
  const first = await post(WB, { action: 'save', workbookId: null, baseVersion: 0, workbook: p07FixtureWorkbook() });
  assert.equal(first.status, 201);
  const workbookId = first.body.workbookId;
  const approve = () => post(WB, { action: 'decide', workbookId, version: 1, decision: 'approved_internal' });
  assert.equal((await approve()).status, 201);
  const overview = await fixture.transport(PUB);
  const research = (overview.body.workbooks as { id: string }[])[0];
  const draft: PublicationDraft = { workbookVersionId: research.id, contentKind: 'brief', title: 'نمونه ساختگی گردش', summary: 'خلاصه نمونه', content: 'متن مخاطب نمونه بدون اصل خصوصی', sources: [{ url: 'https://example.invalid/p07-synthetic', asOf: '2026-10-01' }], audience: 'cohort', cohortIds: [P07_FIXTURE_COHORT], channels: ['site'] };
  const saved = await post(PUB, { action: 'save', publicationId: null, baseVersion: 0, draft, idempotencyKey: key(sequence++) });
  assert.equal(saved.status, 201); const v1 = String(saved.body.receipt);
  const command = (versionId: string, action: string) => post(PUB, { action, versionId, reason: 'بازبینی انسانی ساختگی', privacyConfirmed: true, idempotencyKey: key(sequence++) });
  assert.equal((await command(v1, 'ready')).status, 201);
  assert.equal((await command(v1, 'publish')).status, 201);
  let rows = (await fixture.transport(PUB)).body.items as PublicationRow[];
  assert.equal(canReadPublication(rows[0], [P07_FIXTURE_COHORT]), true);
  assert.equal(canReadPublication(rows[0], []), false);
  const old = fixture.snapshot().publications[0];
  const correction = await post(PUB, { action: 'save', publicationId: old.publicationId, baseVersion: 1, draft: { ...draft, content: 'اصلاح نمونه؛ فرض قبلی تغییر کرد' }, idempotencyKey: key(sequence++) });
  assert.equal(correction.status, 201); const v2 = String(correction.body.receipt);
  assert.equal(fixture.snapshot().publications[0].content, draft.content);
  rows = (await fixture.transport(PUB)).body.items as PublicationRow[];
  assert.equal(rows.length, 1); assert.equal(rows[0].id, v2); assert.equal(canReadPublication(rows[0], [P07_FIXTURE_COHORT]), false);
  assert.equal((await command(v1, 'publish')).status, 422);
  assert.equal((await command(v2, 'ready')).status, 201);
  assert.equal((await command(v2, 'publish')).status, 201);
  assert.equal((await command(v2, 'withdraw')).status, 201);
  rows = (await fixture.transport(PUB)).body.items as PublicationRow[];
  assert.equal(canReadPublication(rows[0], [P07_FIXTURE_COHORT]), false);
  assert.equal(fixture.snapshot().publications.length, 2);
  const next = await post(WB, { action: 'save', workbookId, baseVersion: 1, workbook: { ...p07FixtureWorkbook(), interpretation: 'نسخه پژوهش جدید ساختگی' } });
  assert.equal(next.status, 201);
  assert.equal((await approve()).status, 409);
  assert.equal(fixture.snapshot().versions[0].body && (fixture.snapshot().versions[0].body as { interpretation: string }).interpretation, p07FixtureWorkbook().interpretation);
});
test('synthetic outage/conflict preserves store, idempotent key replay does not duplicate versions', async () => {
  const fixture = createP07WorkflowFixture(), payload = { action: 'save', workbookId: null, baseVersion: 0, workbook: p07FixtureWorkbook() };
  fixture.failNext(503); assert.equal((await fixture.transport(WB, { method: 'POST', body: JSON.stringify(payload) })).status, 503);
  assert.equal(fixture.snapshot().versions.length, 0);
  const saved = await fixture.transport(WB, { method: 'POST', body: JSON.stringify(payload) });
  assert.equal(saved.status, 201);
  const research = (await fixture.transport(PUB)).body.workbooks as { id: string }[];
  const p = { action: 'save', publicationId: null, baseVersion: 0, idempotencyKey: key(100), draft: { workbookVersionId: research[0].id, contentKind: 'brief', title: 'نمونه', summary: 'نمونه', content: 'نمونه', sources: [{ url: 'https://example.invalid/p07', asOf: '2026-10-01' }], audience: 'public', cohortIds: [], channels: ['site'] } };
  const first = await fixture.transport(PUB, { method: 'POST', body: JSON.stringify(p) });
  const replay = await fixture.transport(PUB, { method: 'POST', body: JSON.stringify(p) });
  assert.equal(first.body.receipt, replay.body.receipt); assert.equal(fixture.snapshot().publications.length, 1);
  assert.equal((await fixture.transport(PUB, { method: 'POST', body: JSON.stringify({ ...p, baseVersion: 2 }) })).status, 409);
});
