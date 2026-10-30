import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectResearchHistory, type HistorySnapshot, type VersionHistoryMetadata, type ReviewHistoryMetadata } from './research-history';

const at = '2026-10-20T10:00:00Z';
const later = '2026-10-30T07:42:03.692005+00:00';
const digest = 'a'.repeat(64);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const version = (n: number): VersionHistoryMetadata => ({ id: id(n), workbookId: id(100), version: n, createdAt: at });
const review = (n = 1): ReviewHistoryMetadata => ({ id: id(201), versionId: id(n), decision: 'approved_internal', reviewedAt: later });
const read = (source: HistorySnapshot['source'], data: unknown, readAt: string | null = later): HistorySnapshot => ({ source, sourceId: 'existing-scope', status: 'read', readAt, data });
const state = (schema: 1 | 2 = 2, status = 'stored', extra = {}) => read('worker_state', { version: schema, entries: { [digest]: { at, status, id: id(300), ...extra } } });

test('v1 and v2 state observations dedupe across reads without fabricating transitions or success', () => {
  const old = state(1); old.readAt = at;
  const input = [old, state(2), state(2)];
  const before = structuredClone(input);
  const result = projectResearchHistory(input);
  assert.equal(result.events.length, 1);
  assert.equal(result.duplicatesDropped, 2);
  const event = result.events[0];
  assert.equal(event.kind, 'worker_state_observed');
  assert.equal(event.workerStatus, 'stored');
  assert.equal(event.times.entryAt, at);
  assert.equal(event.times.readAt, later);
  assert.equal(event.times.startedAt, null);
  assert.equal(event.times.completedAt, null);
  assert.equal(event.times.createdAt, null);
  assert.equal(event.actorId, null);
  assert.equal(event.writeOutcome, 'unknown');
  assert.deepEqual(result.events, projectResearchHistory([...input].reverse()).events);
  assert.deepEqual(input, before, 'projection cannot mutate source snapshots');
  assert.deepEqual(result.sources.map(s => s.schemaVersion).slice(0, 3), [1, 2, 2]);
  assert.deepEqual(result.coverage, { scope: 'supplied_metadata_only', live: false, allAnalysts: false, appendOnly: false, intermediateTransitionsReconstructed: false });
});

test('terminal state does not invent intermediate events, actor roles or model execution', () => {
  for (const status of ['started', 'ready', 'stored', 'failed']) {
    const result = projectResearchHistory([state(2, status)]);
    assert.equal(result.events.length, 1);
    const event = result.events[0];
    assert.equal(event.workerStatus, status);
    assert.equal(event.writeOutcome, 'unknown');
    assert.equal(event.actorUnknownReason, 'not_in_contract');
    assert.ok(!('role' in event));
    assert.ok(!('modelCalled' in event));
  }
});

test('missing and invalid timestamps remain null with reasons, and readAt never fills them', () => {
  const input = read('worker_state', { version: 1, entries: {
    [digest]: { status: 'started' },
    ['b'.repeat(64)]: { status: 'stored', at: '2026-02-30T10:00:00Z' },
    ['c'.repeat(64)]: { status: 'failed', at: '2026-10-20T10:00:00' },
  } });
  const result = projectResearchHistory([input]);
  assert.equal(result.events.length, 3);
  for (const event of result.events) {
    assert.equal(event.times.entryAt, null);
    assert.equal(event.times.completedAt, null);
    assert.ok(event.gaps.some(g => g === 'entryAt_missing' || g === 'entryAt_invalid'));
  }
  const v = projectResearchHistory([read('workbook_versions', [{ ...version(1), createdAt: null, createdBy: 'administrator' }], null)]).events[0];
  assert.equal(v.times.createdAt, null);
  assert.equal(v.times.readAt, null);
  assert.equal(v.actorId, null);
  assert.equal(v.actorUnknownReason, 'invalid');
  assert.ok(v.gaps.includes('createdAt_missing'));
});

test('review of v1 after v2 creation stays on v1, independent of array order or latest version', () => {
  const v1 = { ...version(1), createdBy: id(501) };
  const v2 = { ...version(2), createdAt: '2026-10-21T10:00:00Z' };
  const input = [read('workbook_versions', [v2, v1]), read('workbook_reviews', [review()])];
  const result = projectResearchHistory(input);
  const r = result.events.find(e => e.kind === 'workbook_review_recorded')!;
  assert.equal(r.version, 1);
  assert.equal(r.versionId, id(1));
  assert.equal(r.workbookId, id(100));
  assert.equal(r.decision, 'approved_internal');
  assert.equal(r.times.reviewedAt, later, 'microseconds preserved');
  assert.equal(r.times.createdAt, null);
  assert.equal(r.actorId, null, 'review does not inherit version author');
  assert.equal(r.actorUnknownReason, 'not_in_contract');
  assert.equal(result.events.find(e => e.versionId === id(1) && e.kind === 'workbook_version_recorded')!.actorId, id(501));
  assert.deepEqual(result.events, projectResearchHistory([...input].reverse()).events);
});

test('orphan review retains its exact reference, never joins another destination or guessed version', () => {
  const other = read('workbook_versions', [version(1)]); other.sourceId = 'other-destination';
  const result = projectResearchHistory([read('workbook_reviews', [review()]), other]);
  const r = result.events.find(e => e.kind === 'workbook_review_recorded')!;
  assert.equal(r.versionId, id(1));
  assert.equal(r.version, null);
  assert.equal(r.workbookId, null);
  assert.ok(r.gaps.includes('version_metadata_not_supplied_or_conflicting'));
});

test('duplicate rows and repeated read timestamps produce one action per reference', () => {
  const result = projectResearchHistory([
    read('workbook_versions', [version(1), version(1)], at),
    read('workbook_versions', [version(1)], later),
    read('workbook_reviews', [review(), review()], later),
  ]);
  assert.equal(result.events.length, 2);
  assert.equal(result.duplicatesDropped, 3);
  assert.equal(result.conflictingReferences.length, 0);
  assert.equal(result.events.find(e => e.kind === 'workbook_version_recorded')!.times.readAt, later);
});

test('conflicting reference fails closed deterministically and cannot supply review linkage', () => {
  const a = version(1), b = { ...a, version: 2 };
  const input = [read('workbook_versions', [a, a, b]), read('workbook_reviews', [review()])];
  const first = projectResearchHistory(input);
  const second = projectResearchHistory([read('workbook_versions', [b, a, a]), input[1]]);
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0].version, null);
  assert.equal(first.conflictingReferences.length, 1);
  assert.equal(first.duplicatesDropped, 1);
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.conflictingReferences, second.conflictingReferences);
  assert.equal(second.duplicatesDropped, first.duplicatesDropped);
});

test('unknown/failed write report and worker stored report do not cause a success event or retry instruction', () => {
  for (const status of ['failed', 'stored', 'unchanged', 'budget_hold']) {
    const result = projectResearchHistory([read('worker_last_run', { at, status, id: id(300), requestDigest: digest, reason: 'worker_failed', modelCalled: false })]);
    assert.equal(result.events.length, 1);
    const e = result.events[0];
    assert.equal(e.kind, 'worker_result_reported');
    assert.equal(e.times.reportedAt, at);
    assert.equal(e.times.completedAt, null);
    assert.equal(e.writeOutcome, 'unknown');
    assert.ok(!('retry' in e));
  }
  const e = projectResearchHistory([read('worker_last_run', { status: 'failed' })]).events[0];
  assert.equal(e.times.reportedAt, null);
  assert.ok(e.gaps.includes('undated_report_not_unique_run'));
});

test('private body/title/note/prompt/credentials and raw errors are neither accessed nor copied', () => {
  const trap = () => { throw new Error('private field accessed'); };
  const v = Object.defineProperties({ ...version(1) }, { body: { get: trap }, title: { get: trap }, token: { get: trap } });
  const r = Object.defineProperties({ ...review() }, { note: { get: trap }, reviewedBy: { get: trap } });
  const w = { version: 2, entries: { [digest]: Object.defineProperties({ at, status: 'ready' }, { draft: { get: trap }, provenance: { get: trap }, prompt: { get: trap } }) } };
  const input = [read('workbook_versions', [v]), read('workbook_reviews', [r]), read('worker_state', w),
    read('worker_last_run', { at, status: 'failed', reason: 'SECRET_PRIVATE_FAILURE' })];
  const out = JSON.stringify(projectResearchHistory(input));
  for (const word of ['SECRET_PRIVATE_FAILURE', 'credential', 'prompt', 'body', 'title', 'note', 'reviewedBy']) assert.equal(out.includes(word), false, word);
});

test('unavailable and not-supplied sources remain distinct from read empty or malformed history', () => {
  const failure: HistorySnapshot = { source: 'worker_state', sourceId: 'existing-scope', status: 'unavailable' };
  const result = projectResearchHistory([failure, read('workbook_versions', []), read('workbook_reviews', {})]);
  assert.equal(result.events.length, 0);
  const status = (source: HistorySnapshot['source']) => result.sources.find(r => r.source === source)!.state;
  assert.equal(status('worker_state'), 'unavailable');
  assert.equal(status('worker_last_run'), 'not_supplied');
  assert.equal(status('workbook_versions'), 'read');
  assert.equal(status('workbook_reviews'), 'invalid');
  for (const data of [{ version: 3, entries: {} }, { version: 2, entries: [] }]) {
    assert.equal(projectResearchHistory([read('worker_state', data)]).sources[0].state, 'invalid');
  }
});

test('malformed references/decisions are counted without echoing them or private source paths', () => {
  const badScope = read('worker_last_run', { at, status: 'stored' }); badScope.sourceId = 'https://credential.example/secret';
  const result = projectResearchHistory([
    read('workbook_versions', [{ ...version(1), id: 'SECRET_ID' }, { ...version(1), version: 0 }]),
    read('workbook_reviews', [{ ...review(), decision: 'published' }]),
    read('worker_state', { version: 2, entries: { SECRET_DIGEST: { status: 'stored' }, [digest]: { status: 'succeeded' } } }), badScope,
  ]);
  assert.equal(result.events.length, 0);
  assert.equal(result.sources[0].invalidRows, 2);
  assert.equal(result.sources[1].invalidRows, 1);
  assert.equal(result.sources[2].invalidRows, 2);
  assert.equal(result.sources[3].sourceId, null);
  assert.equal(result.sources[3].state, 'invalid');
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
  assert.equal(JSON.stringify(result).includes('credential.example'), false);
});

test('intent recorded uses only the native intent ID and preparation time, never a saved-version or success reference', () => {
  const row = { intentId: id(700), workbookId: id(100), baseVersion: 1, targetVersion: 2, preparedAt: at, requestHash: 'b'.repeat(64), actorId: id(900), status: 'succeeded' };
  const result = projectResearchHistory([read('workbook_intents', [row]), read('workbook_versions', [version(2)])]);
  const e = result.events.find(e => e.kind === 'workbook_intent_recorded')!;
  assert.equal(e.sourceRef.recordId, id(700)); assert.equal(e.intentId, id(700)); assert.equal(e.workbookId, id(100));
  assert.equal(e.baseVersion, 1); assert.equal(e.targetVersion, 2);
  assert.equal(e.versionId, null); assert.equal(e.version, null); assert.equal(e.actorId, null);
  assert.equal(e.requestDigest, null); assert.equal(e.writeOutcome, 'unknown');
  assert.equal(e.times.preparedAt, at); assert.equal(e.times.createdAt, null); assert.equal(e.times.startedAt, null); assert.equal(e.times.completedAt, null);
  assert.equal(e.evidence, 'supplied_intent_row'); assert.ok(e.gaps.includes('intent_not_proof_of_version_save'));
  assert.ok(!JSON.stringify(e).includes(row.requestHash));
});

test('intent identity dedupes rereads, ignores hash as identity, and excludes conflicting native references', () => {
  const a = { intentId: id(700), workbookId: id(100), baseVersion: 0, targetVersion: 1, preparedAt: at, requestHash: digest };
  const b = { ...a, intentId: id(701) };
  const view = projectResearchHistory([read('workbook_intents', [a, { ...a, requestHash: 'c'.repeat(64) }, b])]);
  assert.equal(view.events.length, 2); assert.equal(view.duplicatesDropped, 1);
  const bad = { ...a, workbookId: id(999) };
  for (const rows of [[a, bad], [bad, a]]) {
    const conflict = projectResearchHistory([read('workbook_intents', rows)]);
    assert.equal(conflict.events.length, 0); assert.equal(conflict.conflictingReferences.length, 1);
  }
  const invalid = projectResearchHistory([read('workbook_intents', [{ ...a, intentId: digest }])]);
  assert.equal(invalid.events.length, 0); assert.equal(invalid.sources[0].invalidRows, 1);
});

test('intent missing/invalid preparation time stays unknown; target corruption does not become a saved row', () => {
  const a = { intentId: id(700), workbookId: id(100), baseVersion: 0, targetVersion: 1 };
  const result = projectResearchHistory([read('workbook_intents', [a, { ...a, intentId: id(701), preparedAt: '2026-02-30T10:00:00Z' }, { ...a, intentId: id(702), targetVersion: 5 }])]);
  assert.equal(result.events.length, 2); assert.equal(result.sources[0].invalidRows, 1);
  for (const e of result.events) { assert.equal(e.times.preparedAt, null); assert.equal(e.times.completedAt, null); assert.equal(e.actorUnknownReason, 'not_in_contract'); }
});
