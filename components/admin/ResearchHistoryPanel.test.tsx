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

const intentRow = (n = 700) => ({ intentId: uuid(n), workbookId, baseVersion: 1, targetVersion: 2, preparedAt: '2026-10-03T10:00:00.123456+00:00' });

test('intent adapter captures only whitelisted metadata and native ID; private/hash/actor getters are never used', async () => {
  const { intentHistoryFromPage, projectIntentHistory } = await import('../../lib/intelligence/research-history-metadata');
  const trap = () => { throw new Error('PRIVATE getter'); };
  const row = Object.defineProperties(intentRow(), { requestBody: { get: trap }, requestHash: { get: trap }, title: { get: trap }, createdBy: { get: trap }, authorMatchesSession: { get: trap } });
  const page = intentHistoryFromPage({ initial: true, availability: true, status: 200, items: [row, row], nextOffset: null, offset: 0 });
  const view = projectIntentHistory(page, workbookId);
  assert.equal(view.state, 'read'); assert.equal(view.history.events.length, 1); assert.equal(view.history.duplicatesDropped, 1);
  const e = view.history.events[0];
  assert.equal(e.intentId, row.intentId); assert.equal(e.times.preparedAt, row.preparedAt); assert.equal(e.versionId, null); assert.equal(e.version, null);
  assert.equal(e.actorId, null); assert.equal(e.writeOutcome, 'unknown');
  assert.doesNotMatch(JSON.stringify(page), /requestHash|requestBody|createdBy|authorMatchesSession|PRIVATE|title/);
  assert.equal(view.history.sources.find(s => s.source === 'worker_state')!.state, 'not_supplied');
});

test('intent missing/unavailable/error/invalid cursor differs from valid bounded empty; null cursor is not completeness', async () => {
  const { intentHistoryFromPage, projectIntentHistory } = await import('../../lib/intelligence/research-history-metadata');
  const base = { initial: true, availability: true, status: 200, items: [], nextOffset: null, offset: 0 };
  for (const [patch, expected] of [[{ availability: undefined }, 'not_supplied'], [{ availability: false }, 'unavailable'], [{ status: 503 }, 'error'], [{ items: undefined }, 'invalid'], [{ nextOffset: undefined }, 'invalid'], [{ nextOffset: 0 }, 'invalid']] as const) {
    const page = intentHistoryFromPage({ ...base, ...patch });
    assert.equal(page.state, expected);
    const out = renderToStaticMarkup(<ResearchHistoryPanel read={{ state: 'not_supplied' }} intents={page} />);
    assert.doesNotMatch(out, /در همین برش و محدودهٔ نمایش، intent ثبت‌شده‌ای تحویل نشده/);
  }
  const empty = intentHistoryFromPage(base);
  assert.equal(empty.state, 'read'); assert.equal(projectIntentHistory(empty).window?.completeHistory, false);
  const out = renderToStaticMarkup(<ResearchHistoryPanel read={{ state: 'not_supplied' }} intents={empty} />);
  assert.match(out, /در همین برش و محدودهٔ نمایش/); assert.match(out, /کامل‌بودن تاریخچه نیست/);
});

test('intent latest page is independent, and a valid workbook scope filters native references without binding target to a version', async () => {
  const { intentHistoryFromPage, projectIntentHistory } = await import('../../lib/intelligence/research-history-metadata');
  const a = intentRow(), b = { ...intentRow(701), workbookId: uuid(999) };
  const page = intentHistoryFromPage({ status: 200, items: [a, b], nextOffset: null, offset: 50 });
  const all = projectIntentHistory(page); assert.equal(all.history.events.length, 2); assert.equal(all.window?.offset, 50);
  const scoped = projectIntentHistory(page, workbookId); assert.equal(scoped.history.events.length, 1); assert.equal(scoped.excludedByWorkbook, 1);
  assert.equal(scoped.history.events[0].versionId, null);
  const out = renderToStaticMarkup(<ResearchHistoryPanel read={read()} intents={page} />);
  assert.ok(out.includes(a.intentId)); assert.ok(!out.includes(b.intentId)); assert.match(out, /این عدد، مرجع نسخهٔ ذخیره‌شده نیست/);
  const unscoped = renderToStaticMarkup(<ResearchHistoryPanel read={{ state: 'uncertain' }} intents={page} />);
  assert.match(unscoped, /نتیجهٔ ثبت نامعلوم است/); assert.match(unscoped, /این صفحه مستقل است/);
  assert.match(unscoped, /موفقیت، شروع یا پایان را ثابت نمی‌کند/);
});

test('intent conflicts are checked before workbook filtering; incomplete row or invalid date never creates a substitute ID/time', async () => {
  const { intentHistoryFromPage, projectIntentHistory } = await import('../../lib/intelligence/research-history-metadata');
  const a = intentRow(), bad = { ...a, workbookId: uuid(999) };
  const conflict = projectIntentHistory(intentHistoryFromPage({ status: 200, items: [a, bad], nextOffset: null, offset: 0 }), workbookId);
  assert.equal(conflict.history.events.length, 0); assert.equal(conflict.history.conflictingReferences.length, 1);
  const malformed = intentHistoryFromPage({ status: 200, items: [{ ...a, intentId: 'a'.repeat(64), requestHash: 'a'.repeat(64) }], nextOffset: null, offset: 0 });
  assert.equal(projectIntentHistory(malformed).history.events.length, 0);
  assert.doesNotMatch(JSON.stringify(malformed), /aaaaaaaaaa/);
  const invalidTime = intentHistoryFromPage({ status: 200, items: [{ ...a, preparedAt: 'PRIVATE_INVALID_TIMESTAMP' }], nextOffset: null, offset: 0 });
  const event = projectIntentHistory(invalidTime).history.events[0]; assert.equal(event.times.preparedAt, null); assert.ok(event.gaps.includes('preparedAt_invalid'));
  assert.doesNotMatch(JSON.stringify(invalidTime), /PRIVATE/);
});
