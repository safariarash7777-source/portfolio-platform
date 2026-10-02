import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDraftValidity } from './p07-validity-draft';
import { canReadPublication, type PublicationRow } from './publication';

const from = '2026-10-02T10:00:00.123456Z';
const until = '2026-10-02T11:00:00.123456Z';
test('synthetic draft contract includes start and excludes exact end', () => {
  assert.equal(evaluateDraftValidity('2026-10-02T10:00:00.123455Z', from, until), 'not_yet_valid');
  assert.equal(evaluateDraftValidity(from, from, until), 'within_time_window');
  assert.equal(evaluateDraftValidity('2026-10-02T11:00:00.123455Z', from, until), 'within_time_window');
  assert.equal(evaluateDraftValidity(until, from, until), 'expired');
  assert.equal(evaluateDraftValidity('2026-10-02T11:00:00.123457Z', from, until), 'expired');
});
test('offset strings represent the same instant, not local display ordering', () => {
  assert.equal(evaluateDraftValidity('2026-10-02T13:30:00.123456+03:30', from, until), 'within_time_window');
  assert.equal(evaluateDraftValidity('2026-10-02T14:30:00.123456+03:30', from, until), 'expired');
  assert.equal(evaluateDraftValidity('2026-10-02T05:00:00.123456-05:00', from, until), 'within_time_window');
});
test('missing or malformed bounds and clock cannot silently become infinite or now', () => {
  for (const invalid of [null, undefined, '', '2026-10-02', '2026-10-02T10:00:00', '2026-02-30T10:00:00Z',
    '2026-10-02T24:00:00Z', '2026-10-02T10:00:60Z', '2026-10-02T10:00:00.1234567Z', 0, {}]) {
    assert.equal(evaluateDraftValidity(invalid, from, until), 'unknown');
    assert.equal(evaluateDraftValidity(from, invalid, until), 'unknown');
    assert.equal(evaluateDraftValidity(from, from, invalid), 'unknown');
  }
});
test('empty or reversed intervals are unknown even if clock is later', () => {
  assert.equal(evaluateDraftValidity(until, from, from), 'unknown');
  assert.equal(evaluateDraftValidity(until, until, from), 'unknown');
});
test('microseconds do not collapse at adjacent interval edges', () => {
  const adjacent = '2026-10-02T10:00:00.123457Z';
  assert.equal(evaluateDraftValidity(from, from, adjacent), 'within_time_window');
  assert.equal(evaluateDraftValidity(adjacent, from, adjacent), 'expired');
  assert.equal(evaluateDraftValidity('2026-10-02T10:00:00.123Z', from, adjacent), 'not_yet_valid');
});
test('synthetic composition proves time window and current grant are independent, not canonical DB enforcement', () => {
  const cohort = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const row: PublicationRow = { id: cohort, publicationId: cohort, workbookVersionId: cohort, version: 1,
    createdAt: from, contentKind: 'brief', title: 'نمونه ساختگی', summary: 'نمونه', content: 'نمونه', sources: [],
    audience: 'cohort', cohortIds: [cohort], channels: ['site'], state: 'published', approvalCurrent: true };
  const fixtureAllows = (now: string, grants: string[], candidate = row) =>
    canReadPublication(candidate, grants) && evaluateDraftValidity(now, from, until) === 'within_time_window';
  assert.equal(fixtureAllows(from, [cohort]), true);
  assert.equal(fixtureAllows(from, []), false);
  assert.equal(fixtureAllows(until, [cohort]), false);
  for (const state of ['draft', 'ready', 'withdrawn', 'approval_invalid'] as const)
    assert.equal(fixtureAllows(from, [cohort], { ...row, state }), false);
  assert.equal(fixtureAllows(from, [cohort], { ...row, approvalCurrent: false }), false);
  // Existing publication.v1 still lacks a deadline; this fixture must not claim that gap is fixed.
  assert.equal(canReadPublication(row, [cohort]), true);
});
