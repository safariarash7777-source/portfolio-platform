import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ResearchHistoryPanel from './ResearchHistoryPanel';
import { projectWorkbookHistory, type WorkbookHistoryRead, type WorkbookHistoryMetadata } from '../../lib/intelligence/research-history-metadata';

const uuid = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const workbookId = uuid(100);
const metadata = (): WorkbookHistoryMetadata => ({
  contract: 'p10.workbook-history.metadata.v1', actorPolicy: 'not_exposed_by_read_contract', workbookId,
  versions: [1, 2].map(n => ({ id: uuid(n), workbookId, version: n, createdAt: n === 1 ? '2026-10-01T10:00:00Z' : '2026-10-02T10:00:00Z' })),
  reviews: [{ id: uuid(200), versionId: uuid(1), decision: 'approved_internal', reviewedAt: '2026-10-03T10:00:00Z' }],
});
const read = (value: unknown = metadata()): WorkbookHistoryRead => ({ state: 'read', workbookId, metadata: value, latestVersion: 2, reviewCount: 1 });
const html = (value: WorkbookHistoryRead) => renderToStaticMarkup(<ResearchHistoryPanel read={value} />);

test('real DTO metadata projects exact references: review v1 remains v1 after v2 and reviewer is unknown', () => {
  const view = projectWorkbookHistory(read());
  assert.equal(view.state, 'read');
  assert.equal(view.history.events.length, 3);
  const review = view.history.events.find(e => e.kind === 'workbook_review_recorded')!;
  assert.equal(review.version, 1); assert.equal(review.versionId, uuid(1)); assert.equal(review.sourceRef.recordId, uuid(200));
  assert.equal(review.actorId, null); assert.equal(review.actorUnknownReason, 'not_in_contract');
  assert.equal(review.times.reviewedAt, '2026-10-03T10:00:00Z');
  assert.equal(review.times.readAt, null); assert.equal(review.times.startedAt, null); assert.equal(review.times.completedAt, null);
  assert.equal(view.history.events.find(e => e.kind === 'workbook_version_recorded' && e.version === 1)!.actorId, null);
  for (const source of ['worker_state', 'worker_last_run']) assert.equal(view.history.sources.find(s => s.source === source)!.state, 'not_supplied');
  const out = html(read());
  assert.match(out, /بازبینی ثبت‌شده/); assert.match(out, /نسخهٔ ۱/); assert.match(out, /نسخهٔ ۲/);
  assert.match(out, /worker محلی: داده‌ای تحویل نشده/);
  assert.match(out, /از نشست یا نقش حدس زده نشده/);
  assert.ok(out.includes(uuid(1)) && out.includes(uuid(200)));
  assert.doesNotMatch(out, /<button|<form|<input/);
});

test('failed/loading/unknown/stale reads are not displayed as an empty or current history', () => {
  for (const state of ['error', 'loading', 'uncertain', 'stale', 'not_supplied'] as const) {
    const out = html({ state });
    assert.doesNotMatch(out, /در متادیتای خوانده‌شده رویداد قابل نمایش وجود ندارد/);
    assert.doesNotMatch(out, /نسخهٔ ثبت‌شده/);
    assert.equal(projectWorkbookHistory({ state }).history.events.length, 0);
  }
  assert.match(html({ state: 'error' }), /به معنی خالی‌بودن تاریخچه نیست/);
  const empty = metadata(); empty.versions = []; empty.reviews = [];
  assert.match(html(read(empty)), /در متادیتای خوانده‌شده رویداد قابل نمایش وجود ندارد/);
});

test('legacy number/date-only DTO never manufactures UUID/actor/history events', () => {
  const legacy = { versions: [{ version: 1, savedAt: '2026-10-01T10:00:00Z' }], reviews: [] };
  const missing: WorkbookHistoryRead = { state: 'read', workbookId, latestVersion: 1, reviewCount: 0, metadata: undefined };
  assert.equal(projectWorkbookHistory(missing).state, 'metadata_unavailable');
  assert.match(html(missing), /UUID یا نویسنده از شمارهٔ نسخه ساخته نمی‌شود/);
  assert.equal(projectWorkbookHistory(read(legacy)).history.events.length, 0);
  const wrong = { ...metadata(), workbookId: uuid(999) };
  assert.equal(projectWorkbookHistory(read(wrong)).state, 'invalid');
  const mixed = metadata(); mixed.versions[0].workbookId = uuid(999);
  assert.equal(projectWorkbookHistory(read(mixed)).state, 'invalid');
});

test('missing actor/time remain null with reasons; no fallback to session identity or time', () => {
  const m = metadata();
  (m.versions[1] as unknown as Record<string, unknown>).createdAt = null;
  (m.reviews[0] as unknown as Record<string, unknown>).reviewedAt = 'not-a-date';
  const view = projectWorkbookHistory(read(m));
  const v2 = view.history.events.find(e => e.kind === 'workbook_version_recorded' && e.version === 2)!;
  assert.equal(v2.actorId, null); assert.equal(v2.actorUnknownReason, 'not_in_contract');
  assert.equal(v2.times.createdAt, null); assert.ok(v2.gaps.includes('createdAt_missing'));
  const review = view.history.events.find(e => e.kind === 'workbook_review_recorded')!;
  assert.equal(review.times.reviewedAt, null); assert.ok(review.gaps.includes('reviewedAt_invalid'));
  assert.match(html(read(m)), /در منبع موجود نیست یا معتبر نیست/);
});

test('duplicate references collapse, conflicts are excluded and cannot move orphan review to latest version', () => {
  const m = metadata(); m.versions.push({ ...m.versions[0] }); m.reviews.push({ ...m.reviews[0] });
  assert.equal(projectWorkbookHistory(read(m)).history.duplicatesDropped, 2);
  m.versions.push({ ...m.versions[0], version: 7 });
  const view = projectWorkbookHistory(read(m));
  assert.equal(view.history.conflictingReferences.length, 1);
  const review = view.history.events.find(e => e.kind === 'workbook_review_recorded')!;
  assert.equal(review.version, null); assert.equal(review.versionId, uuid(1));
  assert.match(html(read(m)), /مرجع متعارض کنار گذاشته شد/);
  assert.match(html(read(m)), /ارتباط به آخرین نسخه حدس زده نمی‌شود/);
});

test('private body/title/note/prompt/credential getters are never accessed by adapter or panel', () => {
  const trap = () => { throw new Error('PRIVATE field accessed'); };
  const m = metadata();
  Object.defineProperties(m, { workbook: { get: trap }, prompt: { get: trap } });
  Object.defineProperties(m.versions[0], { body: { get: trap }, title: { get: trap }, credential: { get: trap }, createdBy: { get: trap } });
  Object.defineProperties(m.reviews[0], { note: { get: trap }, reviewedBy: { get: trap } });
  const out = html(read(m));
  assert.doesNotMatch(out, /PRIVATE/);
  assert.equal(projectWorkbookHistory(read(m)).history.events.length, 3);
});

test('panel and metadata adapter have no IO, writer, local storage, clocks or role-derived permission', () => {
  const source = readFileSync(new URL('./ResearchHistoryPanel.tsx', import.meta.url), 'utf8') + readFileSync(new URL('../../lib/intelligence/research-history-metadata.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|Date\.now|new Date|createStore|insertVersion|insertReview|POST|process\.env/);
});
